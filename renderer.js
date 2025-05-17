// Import required modules
const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const pdfjsLib = require('pdfjs-dist');
const pdfjsViewer = require('pdfjs-dist/web/pdf_viewer');

// Set the PDF.js worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.js');

// DOM Elements
const selectDirectoryBtn = document.getElementById('select-directory-btn');
const manualsList = document.getElementById('manuals-list');
const pdfViewer = document.getElementById('pdf-viewer');
const metadataForm = document.getElementById('metadata-form');
const saveMetadataBtn = document.getElementById('save-metadata-btn');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const currentPageInput = document.getElementById('current-page');
const pageCountSpan = document.getElementById('page-count');
const viewerTitle = document.getElementById('viewer-title');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');

// State variables
let currentPDFPath = null;
let currentPDFDoc = null;
let currentPage = 1;
let pageCount = 0;
let currentScale = 1.0;
let manuals = [];
let selectedManualIndex = -1;
let pageRendering = false;
let pageNumPending = null;

// Initialize the application
async function initApp() {
  // Try to load saved directories
  const directories = await ipcRenderer.invoke('get-manual-directories');
  
  if (directories && directories.length > 0) {
    // Scan the first directory in the list
    await scanDirectory(directories[0]);
  }
  
  // Set up event listeners
  setupEventListeners();
}

// Set up event listeners
function setupEventListeners() {
  // Select directory button
  selectDirectoryBtn.addEventListener('click', async () => {
    const directoryPath = await ipcRenderer.invoke('select-directory');
    if (directoryPath) {
      await scanDirectory(directoryPath);
    }
  });
  
  // PDF navigation controls
  prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderPage(currentPage);
    }
  });
  
  nextPageBtn.addEventListener('click', () => {
    if (currentPage < pageCount) {
      currentPage++;
      renderPage(currentPage);
    }
  });
  
  currentPageInput.addEventListener('change', () => {
    const pageNum = parseInt(currentPageInput.value);
    if (pageNum >= 1 && pageNum <= pageCount && !isNaN(pageNum)) {
      currentPage = pageNum;
      renderPage(currentPage);
    } else {
      currentPageInput.value = currentPage;
    }
  });
  
  // Zoom controls
  zoomInBtn.addEventListener('click', () => {
    currentScale += 0.2;
    renderPage(currentPage);
  });
  
  zoomOutBtn.addEventListener('click', () => {
    if (currentScale > 0.4) {
      currentScale -= 0.2;
      renderPage(currentPage);
    }
  });
  
  // Save metadata button
  saveMetadataBtn.addEventListener('click', async () => {
    if (selectedManualIndex >= 0) {
      await saveMetadata(manuals[selectedManualIndex].path);
    }
  });
}

// Scan directory for PDF files
async function scanDirectory(directoryPath) {
  manualsList.innerHTML = '<div class="loading">Scanning for PDF files...</div>';
  
  try {
    manuals = await ipcRenderer.invoke('scan-directory-for-pdfs', directoryPath);
    
    if (manuals.length > 0) {
      await loadManualsList(manuals);
    } else {
      manualsList.innerHTML = '<div class="empty-state"><p>No PDF files found</p><p>Select another folder containing PDF files</p></div>';
    }
  } catch (error) {
    console.error('Error scanning directory:', error);
    manualsList.innerHTML = `<div class="empty-state"><p>Error scanning directory</p><p>${error.message}</p></div>`;
  }
}

// Load the list of manuals into the UI
async function loadManualsList(manuals) {
  manualsList.innerHTML = '';
  
  for (let i = 0; i < manuals.length; i++) {
    const manual = manuals[i];
    
    // Attempt to extract metadata from filename
    const metadata = extractMetadataFromFilename(manual.filename);
    
    // Store metadata with the manual
    manual.metadata = metadata;
    
    // Create manual item element
    const manualItem = document.createElement('div');
    manualItem.className = 'manual-item';
    manualItem.dataset.index = i;
    
    manualItem.innerHTML = `
      <div class="manual-item-header">
        <div class="manual-item-title">${metadata.title || path.basename(manual.filename, '.pdf')}</div>
        ${metadata.type ? `<span class="manual-item-type">${metadata.type}</span>` : ''}
      </div>
      <div class="manual-item-brand-model">
        ${metadata.brand ? metadata.brand : ''} ${metadata.model ? metadata.model : ''}
        ${metadata.year ? `(${metadata.year})` : ''}
      </div>
    `;
    
    // Add click event to select this manual
    manualItem.addEventListener('click', () => {
      selectManual(i);
    });
    
    manualsList.appendChild(manualItem);
  }
}

// Select a manual from the list
async function selectManual(index) {
  // Clear previous selection
  const previousSelected = document.querySelector('.manual-item.selected');
  if (previousSelected) {
    previousSelected.classList.remove('selected');
  }
  
  // Mark new selection
  const manualItem = document.querySelector(`.manual-item[data-index="${index}"]`);
  if (manualItem) {
    manualItem.classList.add('selected');
  }
  
  selectedManualIndex = index;
  const manual = manuals[index];
  
  // Start with metadata extracted from filename (as a fallback)
  // This will be overridden by actual PDF metadata if available
  updateMetadataForm(manual.metadata);
  
  // Enable save button
  saveMetadataBtn.disabled = false;
  
  // Load PDF preview and extract its metadata
  // The loadPDF function will update the form with PDF metadata if available
  await loadPDF(manual.path);
}

// Load a PDF file
async function loadPDF(pdfPath) {
  try {
    currentPDFPath = pdfPath;
    
    // Clear previous PDF content
    pdfViewer.innerHTML = '';
    
    // Update viewer title
    viewerTitle.textContent = path.basename(pdfPath);
    
    // Try to extract metadata from the PDF file
    try {
      const result = await ipcRenderer.invoke('extract-pdf-metadata', pdfPath);
      if (result.success && result.metadata) {
        // Store the extracted metadata for later use
        if (selectedManualIndex >= 0) {
          // Merge extracted metadata with existing metadata
          const extractedMetadata = result.metadata;
          
          // Map PDF metadata fields to our application fields
          const appMetadata = {
            title: extractedMetadata.title || '',
            brand: extractedMetadata.author || '', // author → brand
            model: extractedMetadata.subject || '', // subject → model
            tags: extractedMetadata.tags || [],
            // Custom fields extracted from keywords
            year: extractedMetadata.year || '',
            yearRange: extractedMetadata.yearRange || '',
            revision: extractedMetadata.revision || '',
            type: extractedMetadata.type || ''
          };
          
          // Update the manual's metadata
          manuals[selectedManualIndex].metadata = appMetadata;
          
          // Update the form with the extracted metadata
          updateMetadataForm(appMetadata);
        }
      }
    } catch (error) {
      console.error('Error loading PDF metadata:', error);
      // Continue loading the PDF even if metadata extraction fails
    }
    
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.textContent = 'Loading PDF...';
    pdfViewer.appendChild(loadingDiv);
    
    // Load the PDF document
    const loadingTask = pdfjsLib.getDocument(pdfPath);
    currentPDFDoc = await loadingTask.promise;
    
    // Get page count
    pageCount = currentPDFDoc.numPages;
    pageCountSpan.textContent = pageCount;
    
    // Reset current page
    currentPage = 1;
    currentPageInput.value = currentPage;
    
    // Enable navigation buttons
    prevPageBtn.disabled = false;
    nextPageBtn.disabled = false;
    zoomInBtn.disabled = false;
    zoomOutBtn.disabled = false;
    
    // Render the current page
    await renderPage(currentPage);
  } catch (error) {
    console.error('Error loading PDF:', error);
    pdfViewer.innerHTML = `<div class="error">Error loading PDF: ${error.message}</div>`;
  }
}

// Render a specific page of the PDF
async function renderPage(pageNum) {
  if (pageRendering) {
    pageNumPending = pageNum;
    return;
  }
  
  pageRendering = true;
  
  try {
    // Update current page input
    currentPageInput.value = pageNum;
    
    // Get the page
    const page = await currentPDFDoc.getPage(pageNum);
    
    // Remove any existing canvas
    const existingCanvas = pdfViewer.querySelector('canvas');
    if (existingCanvas) {
      existingCanvas.remove();
    }
    
    // Create a canvas for rendering
    const canvas = document.createElement('canvas');
    canvas.className = 'pdf-canvas';
    pdfViewer.innerHTML = '';
    pdfViewer.appendChild(canvas);
    
    const context = canvas.getContext('2d');
    
    // Set the viewport based on scale
    const viewport = page.getViewport({ scale: currentScale });
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    // Render the page
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    pageRendering = false;
    
    if (pageNumPending !== null) {
      // New page rendering is pending
      renderPage(pageNumPending);
      pageNumPending = null;
    }
  } catch (error) {
    console.error('Error rendering page:', error);
    pageRendering = false;
  }
}

// Update metadata form with the given metadata
function updateMetadataForm(metadata) {
  document.getElementById('title').value = metadata.title || '';
  document.getElementById('brand').value = metadata.brand || '';
  document.getElementById('model').value = metadata.model || '';
  document.getElementById('year').value = metadata.year || '';
  document.getElementById('year-range').value = metadata.yearRange || '';
  document.getElementById('revision').value = metadata.revision || '';
  document.getElementById('type').value = metadata.type || '';
  
  // Clear all checkboxes first
  const checkboxes = document.querySelectorAll('input[name="tags"]');
  checkboxes.forEach(checkbox => {
    checkbox.checked = false;
  });
  
  // Check the ones that match tags in metadata
  if (metadata.tags && Array.isArray(metadata.tags)) {
    metadata.tags.forEach(tag => {
      const checkbox = document.querySelector(`input[name="tags"][value="${tag}"]`);
      if (checkbox) {
        checkbox.checked = true;
      }
    });
  }
}

// Save metadata to the PDF file
async function saveMetadata(pdfPath) {
  // Get values from form
  const formMetadata = {
    title: document.getElementById('title').value,
    brand: document.getElementById('brand').value,
    model: document.getElementById('model').value,
    year: document.getElementById('year').value,
    yearRange: document.getElementById('year-range').value,
    revision: document.getElementById('revision').value,
    type: document.getElementById('type').value,
    tags: Array.from(document.querySelectorAll('input[name="tags"]:checked'))
      .map(checkbox => checkbox.value)
  };
  
  // Update manuals array with new metadata
  if (selectedManualIndex >= 0) {
    manuals[selectedManualIndex].metadata = formMetadata;
    
    // Update the manual item in the list
    const manualItem = document.querySelector(`.manual-item[data-index="${selectedManualIndex}"]`);
    if (manualItem) {
      manualItem.querySelector('.manual-item-title').textContent = formMetadata.title || path.basename(manuals[selectedManualIndex].filename, '.pdf');
      
      if (formMetadata.type) {
        let typeElem = manualItem.querySelector('.manual-item-type');
        if (!typeElem) {
          typeElem = document.createElement('span');
          typeElem.className = 'manual-item-type';
          manualItem.querySelector('.manual-item-header').appendChild(typeElem);
        }
        typeElem.textContent = formMetadata.type;
      }
      
      manualItem.querySelector('.manual-item-brand-model').textContent = 
        `${formMetadata.brand ? formMetadata.brand : ''} ${formMetadata.model ? formMetadata.model : ''} ${formMetadata.year ? `(${formMetadata.year})` : ''}`;
    }
    
    // Get the current path which might be different after file operations
    const currentPath = currentPDFPath || pdfPath;
    
    // Check if file exists and is accessible
    if (!fs.existsSync(currentPath)) {
      console.error(`File does not exist: ${currentPath}`);
      alert(`Cannot save metadata: The file does not exist at ${currentPath}`);
      return; // Exit function early
    }
    
    // Prepare for file renaming if title has changed
    let newFilePath = currentPath;
    let shouldRename = false;
    
    if (formMetadata.title && formMetadata.title.trim() !== '') {
      // Create a safe filename from the title
      const sanitizedTitle = formMetadata.title.replace(/[\\/:*?"<>|]/g, '_').trim();
      if (sanitizedTitle) {
        const dir = path.dirname(currentPath);
        const ext = path.extname(currentPath);
        const originalBasename = path.basename(currentPath, ext);
        
        // Generate new file path
        const proposedPath = path.join(dir, sanitizedTitle + ext);
        
        // Only rename if the name would actually change (case-insensitive comparison)
        if (proposedPath.toLowerCase() !== currentPath.toLowerCase()) {
          newFilePath = proposedPath;
          shouldRename = true;
        }
      }
    }
    
    // First save the metadata to the current file
    // Only afterward will we try to rename it
    
    // Prepare metadata for PDF update
    // Map form fields to standard PDF metadata fields
    const pdfMetadata = {
      title: formMetadata.title,
      author: formMetadata.brand, // Map 'brand' to PDF 'author' field
      subject: formMetadata.model, // Map 'model' to PDF 'subject' field
      keywords: formMetadata.tags || [], // Just send tags as an array, main.js will handle formatting
      producer: 'Manual Library',
      creator: `Manual Library - ${formMetadata.revision ? 'Rev ' + formMetadata.revision : ''}`,
      // Add all the requested fields for custom metadata
      year: formMetadata.year,
      yearRange: formMetadata.yearRange,
      revision: formMetadata.revision,
      type: formMetadata.type
    };
    
    try {
      // Step 1: Call IPC handler to update the PDF metadata
      const result = await ipcRenderer.invoke('update-pdf-metadata', { pdfPath: currentPath, metadata: pdfMetadata });
      
      if (!result.success) {
        alert(`Error saving metadata to PDF: ${result.error}`);
        return;
      }
      
      // Step 2: If we need to rename the file, do it now that the PDF is saved
      if (shouldRename) {
        try {
          // Before renaming, ensure we release all handles to the file
          // This is important to prevent EBUSY errors
          if (currentPDFDoc) {
            currentPDFDoc.cleanup?.();
            currentPDFDoc = null;
          }
          
          // Use IPC to rename the file (more reliable than direct fs operations in renderer)
          const renameResult = await ipcRenderer.invoke('rename-pdf-file', { 
            oldPath: currentPath, 
            newPath: newFilePath 
          });
          
          if (renameResult.success) {
            // Update all references to this file
            manuals[selectedManualIndex].path = newFilePath;
            manuals[selectedManualIndex].filename = path.basename(newFilePath);
            currentPDFPath = newFilePath;
            
            // Update UI
            viewerTitle.textContent = path.basename(newFilePath);
            
            // Update the list item
            const manualItem = document.querySelector(`.manual-item[data-index="${selectedManualIndex}"]`);
            if (manualItem) {
              manualItem.querySelector('.manual-item-title').textContent = formMetadata.title;
            }
            
            // Re-load the PDF to update the view
            await loadPDF(newFilePath);
            
            alert(`Metadata saved and file renamed successfully to: ${path.basename(newFilePath)}`);
          } else {
            // If rename failed but metadata was saved, still show a success message for metadata
            console.error('Error renaming file:', renameResult.error);
            alert(`Metadata was saved, but couldn't rename the file: ${renameResult.error}`);
          }
        } catch (renameError) {
          console.error('Error in rename process:', renameError);
          alert(`Metadata was saved, but couldn't rename the file: ${renameError.message}`);
        }
      } else {
        // No renaming needed, just show success message
        alert('Metadata saved successfully to the PDF file!');
      }
    } catch (error) {
      console.error('Error updating PDF metadata:', error);
      alert(`Error updating PDF metadata: ${error.message}`);
    }
  }
}

// Extract metadata from filename
function extractMetadataFromFilename(filename) {
  const metadata = {
    title: '',
    brand: '',
    model: '',
    year: '',
    yearRange: '',
    revision: '',
    type: '',
    tags: []
  };
  
  // Remove .pdf extension
  const nameWithoutExt = path.basename(filename, '.pdf');
  
  // Try to parse filename with common formats
  // Format: Brand_Model_Year_Type.pdf
  const parts = nameWithoutExt.split('_');
  
  if (parts.length >= 1) {
    metadata.brand = parts[0];
    metadata.title = nameWithoutExt; // Use full filename as title by default
  }
  
  if (parts.length >= 2) {
    metadata.model = parts[1];
  }
  
  if (parts.length >= 3) {
    // Check if the third part is a year (4 digits)
    if (/^\d{4}$/.test(parts[2])) {
      metadata.year = parts[2];
    } else if (/^\d{4}-\d{4}$/.test(parts[2])) {
      metadata.yearRange = parts[2];
    }
  }
  
  if (parts.length >= 4) {
    // Check if the fourth part matches any known type
    const lowerType = parts[3].toLowerCase();
    const knownTypes = ['service', 'user manual', 'diagram', 'electrical', 'parts catalog'];
    
    for (const type of knownTypes) {
      if (lowerType.includes(type.toLowerCase())) {
        metadata.type = type;
        break;
      }
    }
  }
  
  return metadata;
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);
