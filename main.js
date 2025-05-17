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
    
    // Format keywords as a consistently formatted string within an array
    // The string will include all fields in a fixed order, even if they're empty
    // Format: ["Year: 2008, Years range: , Type: Service, Tags: Cruiser"]
    
    // Extract tags from keywords array (if present)
    let tags = [];
    if (metadata.keywords && Array.isArray(metadata.keywords)) {
      // Extract any regular tags that don't follow the key-value format
      tags = metadata.keywords.filter(kw => !kw.match(/^\w+:\s*.+$/));
    }
    
    // Build a fixed-format string with all required fields in specified order
    const formattedKeywordsStr = [
      `Year: ${metadata.year || ''}`, 
      `Years range: ${metadata.yearRange || ''}`, 
      `Type: ${metadata.type || ''}`,
      `Tags: ${tags.join(', ') || ''}`
    ].join(', ');
    
    // Set the keywords as an array containing our formatted string
    // This maintains the array type that pdf-lib expects while keeping our format
    pdfDoc.setKeywords([formattedKeywordsStr]);
    
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
// Handler for renaming PDF files
ipcMain.handle('rename-pdf-file', async (event, { oldPath, newPath }) => {
  try {
    // Check if source file exists
    if (!fs.existsSync(oldPath)) {
      return { success: false, error: `Source file does not exist: ${oldPath}` };
    }
    
    // Check if target path is different
    if (oldPath === newPath) {
      return { success: true, message: 'File paths are identical, no rename needed' };
    }
    
    // Check if target directory exists
    const targetDir = path.dirname(newPath);
    if (!fs.existsSync(targetDir)) {
      // Create directory if it doesn't exist
      try {
        fs.mkdirSync(targetDir, { recursive: true });
      } catch (mkdirError) {
        return { success: false, error: `Could not create target directory: ${mkdirError.message}` };
      }
    }
    
    // Check if target file already exists
    if (fs.existsSync(newPath)) {
      // Generate a unique filename by adding a number suffix
      let counter = 1;
      const ext = path.extname(newPath);
      const baseName = path.basename(newPath, ext);
      const dir = path.dirname(newPath);
      
      let uniquePath = newPath;
      while (fs.existsSync(uniquePath)) {
        uniquePath = path.join(dir, `${baseName}_${counter}${ext}`);
        counter++;
        
        // Safety check to prevent infinite loops
        if (counter > 100) {
          return { success: false, error: 'Could not generate a unique filename after 100 attempts' };
        }
      }
      
      newPath = uniquePath;
    }
    
    // Perform the rename operation
    try {
      fs.renameSync(oldPath, newPath);
      return { success: true, newPath };
    } catch (renameError) {
      // If direct rename fails (possibly due to different volumes), try copy and delete
      if (renameError.code === 'EXDEV') {
        try {
          // Copy file contents
          fs.copyFileSync(oldPath, newPath);
          
          // Verify copy was successful
          if (fs.existsSync(newPath)) {
            // Delete original file
            fs.unlinkSync(oldPath);
            return { success: true, newPath };
          } else {
            return { success: false, error: 'Copy succeeded but target file not found' };
          }
        } catch (copyError) {
          return { success: false, error: `Copy operation failed: ${copyError.message}` };
        }
      } else {
        return { success: false, error: `Rename operation failed: ${renameError.message}` };
      }
    }
  } catch (error) {
    console.error('Error renaming file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('extract-pdf-metadata', async (event, pdfPath) => {
  try {
    const existingPdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    // Get the metadata
    const metadata = {
      title: pdfDoc.getTitle() || '',
      author: pdfDoc.getAuthor() || '',
      subject: pdfDoc.getSubject() || '',
      producer: pdfDoc.getProducer() || '',
      creator: pdfDoc.getCreator() || '',
      keywords: pdfDoc.getKeywords() || []
    };
    
    // Initialize tags array and custom fields
    metadata.tags = [];
    metadata.year = '';
    metadata.yearRange = '';
    metadata.revision = '';
    metadata.type = '';
    
    console.log('Raw PDF keywords:', JSON.stringify(metadata.keywords));
    
    // Parse keyword field for our custom metadata
    // Only handling our standard format: "Year: Value, Years range: Value, Type: Value, Tags: Value(s)"
    if (Array.isArray(metadata.keywords) && metadata.keywords.length > 0) {
      // Get the string from the array
      const formattedString = metadata.keywords[0];
      console.log('Metadata string:', formattedString);
      
      // Split by comma and process each field
      const fields = formattedString.split(', ');
      console.log('Split fields:', fields);
      
      // Process each field
      fields.forEach(field => {
        // Extract key-value pairs
        const match = field.match(/^([^:]+):\s*(.*)$/);
        if (match) {
          const [, fieldName, fieldValue] = match;
          console.log(`Extracted field: ${fieldName} = '${fieldValue}'`);
          
          // Process known fields
          switch (fieldName.trim()) {
            case 'Year':
              metadata.year = fieldValue.trim();
              break;
            case 'Years range':
              metadata.yearRange = fieldValue.trim();
              break;
            case 'Type':
              metadata.type = fieldValue.trim();
              break;
            case 'Tags':
              // Split tags by comma if they exist
              if (fieldValue.trim()) {
                metadata.tags = fieldValue.split(', ').map(tag => tag.trim());
              }
              break;
            case 'Revision':
              metadata.revision = fieldValue.trim();
              break;
            default:
              console.log(`Unknown metadata field: ${fieldName}`);
          }
        } else {
          console.log(`Could not parse field: ${field}`);
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
