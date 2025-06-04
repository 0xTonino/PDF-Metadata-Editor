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

// Global variable to store the currently loaded PDF's metadata (from JSON or fallback)
let currentManualData = {}; // Initialize as an empty object

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
    await saveMetadata(); // New call, uses global currentPDFPath and selectedManualIndex
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', (event) => {
    // Ctrl+S to save
    if (event.ctrlKey && event.key === 's') {
      event.preventDefault();
      if (currentPDFPath) {
        saveMetadata();
      }
    }
    
    // Ctrl+Right Arrow to advance to next file
    if (event.ctrlKey && event.key === 'ArrowRight') {
      event.preventDefault();
      autoAdvanceToNextFile();
    }
    
    // Ctrl+Left Arrow to go to previous file
    if (event.ctrlKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      if (selectedManualIndex > 0) {
        const prevIndex = selectedManualIndex - 1;
        selectManual(prevIndex);
      } else {
        showNotification('Already at the first file in the list!', 'info');
      }
    }
    
    // Escape to close notifications
    if (event.key === 'Escape') {
      const notifications = document.querySelectorAll('.notification');
      notifications.forEach(notif => notif.remove());
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
      // Add refresh button after successful scan
      addRefreshButton();
    } else {
      manualsList.innerHTML = '<div class="empty-state"><p>No PDF files found</p><p>Select another folder containing PDF files</p></div>';
      addRefreshButton(); // Add refresh button even when no files found
    }
  } catch (error) {
    console.error('Error scanning directory:', error);
    manualsList.innerHTML = `
      <div class="empty-state">
        <p>Error scanning directory</p>
        <p>${error.message}</p>
        <button class="btn" onclick="refreshCurrentDirectory()" style="margin-top: 10px;">Try Again</button>
      </div>`;
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
  console.log(`Selecting manual at index ${index}`);
  
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
  
  console.log(`Selected manual: ${manual.filename}`);
  console.log(`Manual path: ${manual.path}`);
  
  // Start with metadata extracted from filename (as a fallback)
  // This will be overridden by actual PDF metadata if available
  updateMetadataForm(manual.metadata);
  
  // Load PDF preview and extract its metadata
  // The loadPDF function will update the form with PDF metadata if available
  // and properly enable the form fields
  console.log(`Loading PDF for manual: ${manual.filename}`);
  await loadPDF(manual.path, manual);
  console.log(`Completed loading PDF for manual: ${manual.filename}`);
}

// Load a PDF file
async function loadPDF(pdfPath, manualObject) {
  try {
    let actualPdfPath = pdfPath;
    let fileWasRenamed = false;
    
    // First, try to find the file smartly in case it was renamed
    try {
      const findResult = await ipcRenderer.invoke('find-file-smart', pdfPath);
      if (findResult.success) {
        actualPdfPath = findResult.foundPath;
        fileWasRenamed = findResult.wasRenamed;
        
        if (fileWasRenamed) {
          console.log(`File was renamed: ${findResult.originalName} -> ${findResult.newName}`);
          // Update the manual object with the new path
          if (manualObject) {
            manualObject.path = actualPdfPath;
            manualObject.filename = path.basename(actualPdfPath);
          }
          // Update the manuals array
          if (selectedManualIndex >= 0 && manuals[selectedManualIndex]) {
            manuals[selectedManualIndex].path = actualPdfPath;
            manuals[selectedManualIndex].filename = path.basename(actualPdfPath);
          }
        }
      } else {
        throw new Error(`File not found: ${pdfPath}. ${findResult.error || ''}`);
      }
    } catch (smartFindError) {
      console.error('Smart file finding failed:', smartFindError);
      throw new Error(`Could not locate PDF file. Original path: ${pdfPath}. ${smartFindError.message}`);
    }
    
    currentPDFPath = actualPdfPath;
    
    // Clear previous PDF content
    pdfViewer.innerHTML = '';
    
    // Update viewer title
    viewerTitle.textContent = path.basename(actualPdfPath);
    
    // Attempt to load metadata from companion JSON file
    const jsonFilePath = actualPdfPath.replace(/\.pdf$/i, '.json');
    let jsonData = null;
    try {
      const readResult = await ipcRenderer.invoke('read-json-file', jsonFilePath);
      if (readResult.success) {
        jsonData = readResult.data;
        console.log(`Loaded metadata for ${path.basename(actualPdfPath)}:`, jsonData);
      } else if (readResult.code !== 'ENOENT') {
        // Only log if it's not a "file doesn't exist" error
        console.warn(`Failed to read JSON metadata from ${jsonFilePath}: ${readResult.error}`);
      }
    } catch (error) {
      console.warn(`Error reading JSON metadata for ${path.basename(actualPdfPath)}: ${error.message}`);
      jsonData = null;
    }

    // Update metadata form with available data
    if (jsonData) {
      if (manualObject) {
        manualObject.metadata = { ...jsonData }; // Update the manual's metadata store with a copy
      }
      updateMetadataForm(jsonData);
    } else {
      // Fallback: if JSON not found/error, use metadata from manualObject (filename extraction) or clear form
      if (manualObject && manualObject.metadata) {
        console.log(`Using filename-extracted metadata for ${path.basename(actualPdfPath)}`);
        updateMetadataForm(manualObject.metadata); 
      } else {
        console.log(`No metadata available for ${path.basename(actualPdfPath)} - starting with empty form`);
        updateMetadataForm({}); // Clear form if no metadata at all
      }
    }
    
    // ALWAYS enable the form fields and save button when we have a valid PDF
    console.log(`Enabling form for PDF: ${path.basename(actualPdfPath)}`);
    enableMetadataForm(true);
    
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.textContent = 'Loading PDF...';
    pdfViewer.appendChild(loadingDiv);
    
    // Load the PDF document
    console.log(`Loading PDF document: ${actualPdfPath}`);
    const loadingTask = pdfjsLib.getDocument(actualPdfPath);
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
    
    console.log(`PDF loaded successfully: ${path.basename(actualPdfPath)}`);
    
    // Show success message if file was found after being renamed
    if (fileWasRenamed) {
      showNotification('✓ File found: The PDF was renamed but successfully located.', 'success');
    }
    
  } catch (error) {
    console.error('Error loading PDF:', error);
    pdfViewer.innerHTML = `<div class="error">Error loading PDF: ${error.message}</div>`;
    showNotification(`Error loading PDF: ${error.message}`, 'error');
    // Disable form when PDF fails to load
    enableMetadataForm(false);
  }
}

// Helper function to enable/disable the metadata form
function enableMetadataForm(enabled) {
  console.log(`${enabled ? 'Enabling' : 'Disabling'} metadata form`);
  
  const formInputs = document.querySelectorAll('#metadata-form input, #metadata-form select, #metadata-form textarea');
  const saveBtn = document.getElementById('save-metadata-btn');
  const metadataForm = document.getElementById('metadata-form');
  
  console.log(`Found ${formInputs.length} form inputs to ${enabled ? 'enable' : 'disable'}`);
  
  formInputs.forEach((input, index) => {
    input.disabled = !enabled;
    if (index < 3) { // Log first 3 inputs for debugging
      console.log(`${enabled ? 'Enabled' : 'Disabled'} input: ${input.id || input.name || 'unnamed'}`);
    }
  });
  
  if (saveBtn) {
    saveBtn.disabled = !enabled || !currentPDFPath;
    console.log(`Save button ${saveBtn.disabled ? 'disabled' : 'enabled'}`);
  } else {
    console.error('Save button not found!');
  }
  
  if (metadataForm) {
    if (enabled) {
      metadataForm.style.opacity = '1';
      metadataForm.style.pointerEvents = 'auto';
      metadataForm.style.backgroundColor = ''; // Remove any background color that might indicate disabled state
    } else {
      metadataForm.style.opacity = '0.6';
      metadataForm.style.pointerEvents = 'none';
      metadataForm.style.backgroundColor = '#f5f5f5'; // Light gray to indicate disabled
    }
    console.log(`Form visual state: opacity=${metadataForm.style.opacity}, pointerEvents=${metadataForm.style.pointerEvents}`);
  } else {
    console.error('Metadata form element not found!');
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
  currentManualData = metadata || {}; // Store the loaded metadata globally for this session
  const m = currentManualData; // Use a shorthand

  document.getElementById('title').value = m.title || '';
  document.getElementById('brand').value = m.brand || '';
  document.getElementById('model').value = m.model || '';
  document.getElementById('year').value = m.year || '';
  
  // Removed year-range and revision population
  // document.getElementById('year-range').value = m.yearRange || '';
  // document.getElementById('revision').value = m.revision || '';

  document.getElementById('manualType').value = m.manualType || '';
  
  // Bike Type - Checkboxes
  const bikeTypeCheckboxes = document.querySelectorAll('input[name="bikeType"]');
  bikeTypeCheckboxes.forEach(checkbox => {
    checkbox.checked = false; // Reset all checkboxes
  });
  if (m.bikeType && Array.isArray(m.bikeType)) {
    m.bikeType.forEach(type => {
      const checkbox = document.querySelector(`input[name="bikeType"][value="${type}"]`);
      if (checkbox) checkbox.checked = true;
    });
  }

  // Language - Dropdown
  document.getElementById('language').value = m.language || '';
  
  document.getElementById('tags').value = m.tags && Array.isArray(m.tags) ? m.tags.join(', ') : '';
  document.getElementById('description').value = m.description || '';

  // Enable the form if we have a valid PDF path
  if (currentPDFPath) {
    enableMetadataForm(true);
  }
}

// Save metadata to the JSON file
async function saveMetadata() { 
  if (!currentPDFPath || selectedManualIndex < 0) {
    console.error('No PDF selected or invalid index. Cannot save metadata.');
    showNotification('Error: No PDF selected or an internal error occurred.', 'error');
    return;
  }

  // Generate a unique ID if one doesn't exist for this manual yet
  let manualId = currentManualData.id;
  if (!manualId) {
    manualId = Date.now().toString(36) + Math.random().toString(36).substring(2, 9); // Longer random part
    console.log(`Generated new ID for manual: ${manualId}`);
  }

  // Collect data from the form
  const title = document.getElementById('title').value.trim();
  const brand = document.getElementById('brand').value.trim();
  const model = document.getElementById('model').value.trim();
  const year = parseInt(document.getElementById('year').value, 10) || null; // Ensure year is a number or null
  const manualType = document.getElementById('manualType').value.trim();
  
  // Collect Bike Types from checkboxes
  const selectedBikeTypes = [];
  document.querySelectorAll('input[name="bikeType"]:checked').forEach(checkbox => {
    selectedBikeTypes.push(checkbox.value);
  });

  const language = document.getElementById('language').value;
  const tagsString = document.getElementById('tags').value.trim();
  const description = document.getElementById('description').value.trim();

  // Convert tags string to array, handling empty strings and extra spaces
  const tags = tagsString ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

  if (!title) {
    showNotification('Title is a required field.', 'warning');
    return;
  }

  // Show saving notification
  showNotification('Saving metadata...', 'info', 1000);

  // Consolidate metadata: merge form data with existing non-form data from currentManualData
  const metadataFromForm = {
    title,
    brand,
    model,
    year,
    manualType,
    bikeType: selectedBikeTypes,
    language,
    tags,
    description
  };

  const finalMetadataForJson = {
    ...currentManualData, // Includes existing id, pdfSignatureAdded (if any) from initial load
    ...metadataFromForm,  // Overwrites with form values for shared fields
    id: manualId          // Explicitly use the determined manualId (newly generated or existing)
  };

  // --- Filename Generation and Renaming Logic (if title changed) ---
  // Construct new filename based on title, brand, model, year, language
  let newSanitizedFilenameComponent = '';
  if (title) {
    newSanitizedFilenameComponent = title.replace(/[\s\/\?%\*:\|"<>]+/g, '_').replace(/[^a-zA-Z0-9_\.\-]+/g, '');
    if (!newSanitizedFilenameComponent) { // Handle cases where sanitization results in an empty string
        newSanitizedFilenameComponent = 'Untitled_Manual';
    }
  } else {
    // If title is empty, use the existing filename base
    newSanitizedFilenameComponent = path.basename(currentPDFPath, '.pdf');
  }

  const directory = path.dirname(currentPDFPath);
  const newProposedPdfFilename = newSanitizedFilenameComponent + '.pdf';
  let newPdfPath = path.join(directory, newProposedPdfFilename);

  const oldJsonFilePath = currentPDFPath.replace(/\.pdf$/i, '.json');
  let newJsonFilePath = newPdfPath.replace(/\.pdf$/i, '.json');

  try {
    let pdfPathToSaveJsonTo = currentPDFPath; // Path to use for JSON if PDF isn't renamed

    // --- PDF Renaming Logic --- 
    if (newPdfPath.toLowerCase() !== currentPDFPath.toLowerCase()) {
      console.log(`PDF filename change proposed: from ${path.basename(currentPDFPath)} to ${newProposedPdfFilename}`);
      
      const checkFileResult = await ipcRenderer.invoke('check-file-exists', newPdfPath);
      if (!checkFileResult.success) {
        showNotification(`Error checking file existence: ${checkFileResult.error}`, 'error');
        return;
      }
      if (checkFileResult.exists) {
        showNotification(`Error: A file named "${newProposedPdfFilename}" already exists in this directory. Please choose a different title or rename the existing file.`, 'error', 5000);
        return;
      }

      // Rename PDF
      console.log(`Attempting to rename PDF from ${currentPDFPath} to ${newPdfPath}`);
      const renamePdfResult = await ipcRenderer.invoke('rename-file', { oldPath: currentPDFPath, newPath: newPdfPath });
      if (!renamePdfResult.success) {
        showNotification(`Error renaming PDF: ${renamePdfResult.error}. Metadata not saved.`, 'error', 5000);
        return;
      }
      console.log(`PDF renamed successfully to ${newPdfPath}`);
      pdfPathToSaveJsonTo = newPdfPath; // JSON will be associated with the new PDF path

      // Rename old JSON file if it exists
      try {
        const oldJsonExists = await ipcRenderer.invoke('check-file-exists', oldJsonFilePath);
        if (oldJsonExists.exists) {
          console.log(`Attempting to rename old JSON from ${oldJsonFilePath} to ${newJsonFilePath}`);
          const renameJsonResult = await ipcRenderer.invoke('rename-file', { oldPath: oldJsonFilePath, newPath: newJsonFilePath });
          if (!renameJsonResult.success) {
            // Non-critical error, log it. The new JSON will be created anyway.
            console.warn(`Could not rename old JSON file: ${renameJsonResult.error}`);
          }
        } else {
          console.log(`Old JSON file ${oldJsonFilePath} not found, no need to rename.`);
        }
      } catch (e) {
        console.warn(`Error during old JSON file rename check/process: ${e.message}`);
      }

      // Update currentPDFPath and manual object to reflect the rename
      currentPDFPath = newPdfPath;
      currentManualData.filename = path.basename(newPdfPath);
      
      // Update the manuals array with new path
      if (manuals[selectedManualIndex]) {
        manuals[selectedManualIndex].path = newPdfPath;
        manuals[selectedManualIndex].filename = path.basename(newPdfPath);
      }
    } else {
      // If PDF name hasn't changed, newJsonFilePath should still be based on currentPDFPath
      newJsonFilePath = currentPDFPath.replace(/\.pdf$/i, '.json');
      pdfPathToSaveJsonTo = currentPDFPath;
    }

    // --- Save Metadata to JSON (Initial Save) --- 
    console.log(`Attempting to write JSON metadata to: ${newJsonFilePath}`);
    const writeJsonResult = await ipcRenderer.invoke('write-json-file', { filePath: newJsonFilePath, data: finalMetadataForJson });
    if (!writeJsonResult.success) {
      showNotification(`Error saving metadata to JSON file: ${writeJsonResult.error}`, 'error', 5000);
      return;
    }
    console.log('Initial metadata saved successfully to JSON file.');
    currentManualData = { ...finalMetadataForJson }; // Update in-memory metadata with what was just saved

    // --- Add PDF Signature if not already added --- 
    let overallSuccessMessage = "Metadata saved successfully!";
    let signatureAttemptFailed = false;

    if (!currentManualData.pdfSignatureAdded) {
      console.log(`Attempting to add PDF signature to: ${pdfPathToSaveJsonTo}`);
      const signature = "Processed by Moto-Manual.com";
      const setProducerResult = await ipcRenderer.invoke('set-pdf-producer', { 
        pdfPath: pdfPathToSaveJsonTo, 
        producerString: signature 
      });

      if (setProducerResult.success) {
        console.log(`PDF signature added successfully to ${pdfPathToSaveJsonTo}.`);
        currentManualData.pdfSignatureAdded = true; // Update in-memory version

        console.log(`Re-saving JSON metadata to ${newJsonFilePath} with pdfSignatureAdded flag.`);
        const rewriteJsonResult = await ipcRenderer.invoke('write-json-file', { 
          filePath: newJsonFilePath, 
          data: currentManualData // currentManualData now has the flag
        });

        if (!rewriteJsonResult.success) {
          console.warn(`Failed to re-save JSON with pdfSignatureAdded flag: ${rewriteJsonResult.error}`);
          overallSuccessMessage = "Metadata saved and PDF signed. However, failed to update the JSON file with the signature status.";
          signatureAttemptFailed = true; // Indicates a partial failure in the signature process
        }
      } else {
        console.warn(`Failed to add PDF signature: ${setProducerResult.error}`);
        overallSuccessMessage = "Metadata saved to JSON. However, failed to add the signature to the PDF file itself.";
        signatureAttemptFailed = true; // Indicates a failure in the signature process
      }
    } else {
      console.log('PDF signature already present in metadata, or not added in this step.');
    }

    // --- Update UI --- 
    viewerTitle.textContent = path.basename(currentPDFPath); // Use currentPDFPath as it's authoritative
    const manualItem = document.querySelector(`.manual-item[data-index="${selectedManualIndex}"]`);
    if (manualItem) {
      manualItem.querySelector('.manual-item-title').textContent = currentManualData.title || path.basename(currentManualData.filename, '.pdf');
      const brandModelYearDiv = manualItem.querySelector('.manual-item-brand-model');
      if (brandModelYearDiv) {
         brandModelYearDiv.textContent = 
          `${currentManualData.brand || ''} ${currentManualData.model || ''} ${currentManualData.year ? `(${currentManualData.year})` : ''}`.trim();
      }
      const typeSpan = manualItem.querySelector('.manual-item-type');
      if (typeSpan) {
        if (currentManualData.manualType) {
            typeSpan.textContent = currentManualData.manualType;
            typeSpan.style.display = '';
        } else {
            typeSpan.style.display = 'none';
        }
      }
    }

    // Show success notification
    const notificationType = signatureAttemptFailed ? 'warning' : 'success';
    showNotification(overallSuccessMessage, notificationType, 2000);
    
    // Auto-advance to next file after a short delay
    setTimeout(() => {
      autoAdvanceToNextFile();
    }, 1500);

  } catch (error) {
    console.error('Error in saveMetadata process:', error);
    showNotification(`An unexpected error occurred while saving metadata: ${error.message}`, 'error', 5000);
  }
}

// Extract metadata from filename
function extractMetadataFromFilename(filename) {
  const metadata = {
    title: '',
    brand: '',
    model: '',
    year: '',
    manualType: '',
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
      // Removed year-range handling
    }
  }
  
  if (parts.length >= 4) {
    // Check if the fourth part matches any known type
    const lowerType = parts[3].toLowerCase();
    const knownTypes = ['service', 'user manual', 'diagram', 'electrical', 'parts catalog'];
    
    for (const type of knownTypes) {
      if (lowerType.includes(type.toLowerCase())) {
        metadata.manualType = type;
        break;
      }
    }
  }
  
  return metadata;
}

// Refresh the current directory scan
async function refreshCurrentDirectory() {
  const directories = await ipcRenderer.invoke('get-manual-directories');
  if (directories && directories.length > 0) {
    console.log('Refreshing directory scan...');
    
    // Show loading notification
    showNotification('🔄 Refreshing directory...', 'info', 1000);
    
    await scanDirectory(directories[0]);
    
    // Show refresh success message
    showNotification('🔄 Directory refreshed successfully!', 'success', 2000);
  } else {
    showNotification('No directory selected to refresh.', 'warning');
  }
}

// Add refresh button functionality
function addRefreshButton() {
  const headerDiv = document.querySelector('.left-panel .panel-header');
  
  // Check if refresh button already exists
  if (document.getElementById('refresh-directory-btn')) {
    return;
  }
  
  const refreshBtn = document.createElement('button');
  refreshBtn.id = 'refresh-directory-btn';
  refreshBtn.className = 'btn';
  refreshBtn.textContent = 'Refresh';
  refreshBtn.style.marginLeft = '10px';
  refreshBtn.addEventListener('click', refreshCurrentDirectory);
  
  headerDiv.appendChild(refreshBtn);
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

// Debugging functions for manual testing (available in console)
window.debugApp = {
  enableForm: () => {
    console.log('Manually enabling form...');
    enableMetadataForm(true);
  },
  disableForm: () => {
    console.log('Manually disabling form...');
    enableMetadataForm(false);
  },
  checkFormState: () => {
    const formInputs = document.querySelectorAll('#metadata-form input, #metadata-form select, #metadata-form textarea');
    const saveBtn = document.getElementById('save-metadata-btn');
    console.log('Form state check:');
    console.log(`- Number of form inputs: ${formInputs.length}`);
    console.log(`- Disabled inputs: ${Array.from(formInputs).filter(input => input.disabled).length}`);
    console.log(`- Save button disabled: ${saveBtn ? saveBtn.disabled : 'Button not found'}`);
    console.log(`- Current PDF path: ${currentPDFPath || 'None'}`);
    console.log(`- Selected manual index: ${selectedManualIndex}`);
    return {
      totalInputs: formInputs.length,
      disabledInputs: Array.from(formInputs).filter(input => input.disabled).length,
      saveButtonDisabled: saveBtn ? saveBtn.disabled : null,
      currentPDFPath,
      selectedManualIndex
    };
  },
  getCurrentManual: () => {
    if (selectedManualIndex >= 0 && manuals[selectedManualIndex]) {
      return manuals[selectedManualIndex];
    }
    return null;
  },
  showTestNotification: (message = 'Test notification', type = 'info') => {
    showNotification(message, type);
  },
  getManualsList: () => {
    return manuals.map((manual, index) => ({
      index,
      filename: manual.filename,
      hasMetadata: !!manual.metadata,
      selected: index === selectedManualIndex
    }));
  },
  saveCurrentFile: () => {
    if (currentPDFPath) {
      saveMetadata();
    } else {
      console.warn('No file selected');
    }
  },
  nextFile: () => {
    autoAdvanceToNextFile();
  },
  clearNotifications: () => {
    const notifications = document.querySelectorAll('.notification');
    notifications.forEach(notif => notif.remove());
    console.log(`Cleared ${notifications.length} notifications`);
  }
};

// Helper function to show non-blocking notifications
function showNotification(message, type = 'success', duration = 3000) {
  // Remove any existing notifications
  const existingNotifs = document.querySelectorAll('.notification');
  existingNotifs.forEach(notif => notif.remove());
  
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    border-radius: 5px;
    color: white;
    font-weight: bold;
    z-index: 10000;
    max-width: 400px;
    word-wrap: break-word;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    transform: translateX(100%);
    transition: transform 0.3s ease-in-out;
  `;
  
  // Set background color based on type
  switch(type) {
    case 'success':
      notification.style.backgroundColor = '#28a745';
      break;
    case 'error':
      notification.style.backgroundColor = '#dc3545';
      break;
    case 'warning':
      notification.style.backgroundColor = '#ffc107';
      notification.style.color = '#000';
      break;
    case 'info':
      notification.style.backgroundColor = '#17a2b8';
      break;
  }
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => {
    notification.style.transform = 'translateX(0)';
  }, 100);
  
  // Auto-remove after duration
  setTimeout(() => {
    notification.style.transform = 'translateX(100%)';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }, duration);
}

// Helper function to auto-advance to next file in the list
function autoAdvanceToNextFile() {
  if (selectedManualIndex >= 0 && selectedManualIndex < manuals.length - 1) {
    const nextIndex = selectedManualIndex + 1;
    console.log(`Auto-advancing from file ${selectedManualIndex} to ${nextIndex}`);
    selectManual(nextIndex);
    return true;
  } else {
    console.log('Already at the last file in the list');
    showNotification('You have reached the last file in the list!', 'info');
    return false;
  }
}
