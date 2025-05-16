const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const { PDFDocument } = require('pdf-lib');

// Initialize the store for application settings
const store = new Store({
  schema: {
    manualDirectories: {
      type: 'array',
      default: []
    },
    windowBounds: {
      type: 'object',
      properties: {
        width: { type: 'number', default: 1200 },
        height: { type: 'number', default: 800 }
      },
      default: { width: 1200, height: 800 }
    }
  }
});

let mainWindow;

function createWindow() {
  const { width, height } = store.get('windowBounds');
  
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    title: 'Manual Library'
  });

  mainWindow.loadFile('index.html');
  
  // Uncomment to open DevTools automatically
  // mainWindow.webContents.openDevTools();
  
  mainWindow.on('resize', () => {
    store.set('windowBounds', mainWindow.getBounds());
  });
}

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for the renderer process to communicate with the main process

// Handler to update PDF metadata directly
ipcMain.handle('update-pdf-metadata', async (event, { pdfPath, metadata }) => {
  try {
    // First check if the file exists and is accessible
    if (!fs.existsSync(pdfPath)) {
      console.error(`File does not exist: ${pdfPath}`);
      return { success: false, error: `File does not exist: ${pdfPath}` };
    }
    
    let existingPdfBytes;
    try {
      existingPdfBytes = fs.readFileSync(pdfPath);
    } catch (readError) {
      console.error(`Error reading file: ${readError.message}`);
      return { success: false, error: `Cannot read file: ${readError.message}` };
    }
    
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(existingPdfBytes);
    } catch (loadError) {
      console.error(`Error loading PDF: ${loadError.message}`);
      return { success: false, error: `Cannot load PDF: ${loadError.message}` };
    }

    // Set standard metadata fields if present
    if (metadata.title) pdfDoc.setTitle(metadata.title);
    if (metadata.author) pdfDoc.setAuthor(metadata.author);
    if (metadata.subject) pdfDoc.setSubject(metadata.subject);
    
    // Clear existing keywords and create a fresh set with consistent ordering
    // Start with regular tags in alphabetical order
    let orderedKeywords = [];
    
    // First add any regular tags (sorted alphabetically)
    if (metadata.keywords && Array.isArray(metadata.keywords)) {
      // Filter out any custom field pairs that might have been mixed in
      const regularTags = metadata.keywords.filter(kw => !kw.match(/^\w+:\s*.+$/));
      orderedKeywords = [...regularTags].sort();
    }
    
    // Then add custom fields in a specific, consistent order
    // Format all custom fields with the same structure: "Field: value"
    const customFieldsOrder = [
      { key: 'Type', value: metadata.type },
      { key: 'Year', value: metadata.year },
      { key: 'YearRange', value: metadata.yearRange },
      { key: 'Revision', value: metadata.revision }
    ];
    
    // Add formatted custom fields in our predefined order
    customFieldsOrder.forEach(field => {
      if (field.value) {
        orderedKeywords.push(`${field.key}: ${field.value}`);
      }
    });
    
    // Set the keywords with our consistently ordered array
    if (orderedKeywords.length > 0) {
      pdfDoc.setKeywords(orderedKeywords);
    } else {
      // If no keywords, set an empty array to clear existing keywords
      pdfDoc.setKeywords([]);
    }
    
    if (metadata.producer) pdfDoc.setProducer(metadata.producer);
    if (metadata.creator) pdfDoc.setCreator(metadata.creator);
    
    // Save the PDF and overwrite the original file
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, pdfBytes);
    return { success: true };
  } catch (error) {
    console.error('PDF metadata error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled) {
    const directoryPath = result.filePaths[0];
    
    // Save to store
    const directories = store.get('manualDirectories');
    if (!directories.includes(directoryPath)) {
      directories.push(directoryPath);
      store.set('manualDirectories', directories);
    }
    
    return directoryPath;
  }
  
  return null;
});

ipcMain.handle('get-manual-directories', () => {
  return store.get('manualDirectories');
});

ipcMain.handle('scan-directory-for-pdfs', async (event, directoryPath) => {
  return scanDirectoryForPDFs(directoryPath);
});

// Handler to extract PDF metadata
ipcMain.handle('extract-pdf-metadata', async (event, pdfPath) => {
  try {
    const existingPdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    // Get standard metadata
    const metadata = {
      title: pdfDoc.getTitle() || '',
      author: pdfDoc.getAuthor() || '',
      subject: pdfDoc.getSubject() || '',
      keywords: pdfDoc.getKeywords() || []
    };
    
    // Initialize tags array and custom fields
    metadata.tags = [];
    
    // Parse keyword field for our custom metadata
    if (Array.isArray(metadata.keywords)) {
      metadata.keywords.forEach(keyword => {
        // Look for custom fields formatted as "Field: Value"
        const match = keyword.match(/^(\w+):\s*(.+)$/);
        if (match) {
          const [, field, value] = match;
          // Store custom field values in their own properties
          switch (field) {
            case 'Year':
              metadata.year = value;
              break;
            case 'YearRange':
              metadata.yearRange = value;
              break;
            case 'Revision':
              metadata.revision = value;
              break;
            case 'Type':
              metadata.type = value;
              break;
            default:
              // Unknown custom field, store it in the tags array
              metadata.tags.push(keyword);
          }
        } else {
          // This is a regular keyword/tag
          metadata.tags.push(keyword);
        }
      });
    }
    
    return { success: true, metadata };
  } catch (error) {
    console.error('Error extracting PDF metadata:', error);
    return { success: false, error: error.message };
  }
});

// Function to recursively scan a directory for PDF files
async function scanDirectoryForPDFs(directoryPath) {
  const pdfFiles = [];
  
  try {
    const items = fs.readdirSync(directoryPath);
    
    for (const item of items) {
      const itemPath = path.join(directoryPath, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        const subDirPDFs = await scanDirectoryForPDFs(itemPath);
        pdfFiles.push(...subDirPDFs);
      } else if (stats.isFile() && path.extname(itemPath).toLowerCase() === '.pdf') {
        pdfFiles.push({
          path: itemPath,
          filename: item,
          size: stats.size,
          lastModified: stats.mtime
        });
      }
    }
  } catch (error) {
    console.error('Error scanning directory:', error);
  }
  
  return pdfFiles;
}
