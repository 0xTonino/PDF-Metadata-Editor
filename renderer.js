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
  
  // Load PDF preview
  await loadPDF(manual.path);
  
  // Update form with manual metadata
  updateMetadataForm(manual.metadata);
  
  // Enable save button
  saveMetadataBtn.disabled = false;
}

// Load a PDF file
async function loadPDF(pdfPath) {
  try {
    currentPDFPath = pdfPath;
    
    // Clear previous PDF content
    pdfViewer.innerHTML = '';
    
    // Update viewer title
    viewerTitle.textContent = path.basename(pdfPath);
    
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
  const metadata = {
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
    manuals[selectedManualIndex].metadata = metadata;
    
    // Update the manual item in the list
    const manualItem = document.querySelector(`.manual-item[data-index="${selectedManualIndex}"]`);
    if (manualItem) {
      manualItem.querySelector('.manual-item-title').textContent = metadata.title || path.basename(manuals[selectedManualIndex].filename, '.pdf');
      
      if (metadata.type) {
        let typeElem = manualItem.querySelector('.manual-item-type');
        if (!typeElem) {
          typeElem = document.createElement('span');
          typeElem.className = 'manual-item-type';
          manualItem.querySelector('.manual-item-header').appendChild(typeElem);
        }
        typeElem.textContent = metadata.type;
      }
      
      manualItem.querySelector('.manual-item-brand-model').textContent = 
        `${metadata.brand ? metadata.brand : ''} ${metadata.model ? metadata.model : ''} ${metadata.year ? `(${metadata.year})` : ''}`;
    }
  }
  
  // TODO: Implement actual metadata saving to PDF files
  // This would require additional libraries for PDF modification
  // For now, just show a success message
  alert('Metadata updated. (Note: This version does not save metadata directly to PDF files yet)');
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
