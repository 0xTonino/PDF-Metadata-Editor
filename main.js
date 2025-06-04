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
/* // Commenting out old handler as per new JSON workflow
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
*/

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

// Handler for renaming PDF files
/* // Commenting out old PDF-specific rename handler, using generic 'rename-file' instead
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
      newPath = uniquePath; // Update newPath to the unique path
    }
    
    // Perform the rename operation
    fs.renameSync(oldPath, newPath);
    return { success: true, newPath: newPath }; // Return the potentially modified newPath
  } catch (error) {
    console.error('Error renaming PDF file:', error);
    return { success: false, error: error.message };
  }
});
*/

// Handler to extract PDF metadata
/* // Commenting out old handler as per new JSON workflow
ipcMain.handle('extract-pdf-metadata', async (event, pdfPath) => {
  try {
    const existingPdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    
    const title = pdfDoc.getTitle();
    const author = pdfDoc.getAuthor();
    const subject = pdfDoc.getSubject();
    const keywordsArray = pdfDoc.getKeywords(); // This is an array
    
    let metadata = {
      title: title || '',
      author: author || '', // Corresponds to 'brand'
      subject: subject || '', // Corresponds to 'model'
      tags: [], // For general tags if any; specific fields below
      year: '',
      yearRange: '',
      revision: '',
      type: ''
    };

    // Process keywords string if it exists (expected to be the first element of the array)
    if (keywordsArray && keywordsArray.length > 0) {
      const keywordsString = keywordsArray[0]; // Assuming our formatted string is the first keyword
      const parts = keywordsString.split(', ');
      parts.forEach(part => {
        const [key, ...valueParts] = part.split(': ');
        const value = valueParts.join(': ').trim();
        if (key === 'Year' && value) metadata.year = value;
        if (key === 'Years range' && value) metadata.yearRange = value;
        if (key === 'Type' && value) metadata.type = value;
        if (key === 'Tags' && value) {
          metadata.tags = value.split(',').map(t => t.trim()).filter(t => t);
        }
      });
    }
    
    return { success: true, metadata: metadata };
  } catch (error) {
    console.error('Error extracting PDF metadata:', error);
    return { success: false, error: error.message };
  }
});
*/

// --- New/Updated IPC Handlers for JSON metadata --- 

// Handler to check if a file exists
ipcMain.handle('check-file-exists', async (event, filePath) => {
  try {
    return { success: true, exists: fs.existsSync(filePath) };
  } catch (error) {
    console.error('Error checking file existence:', error);
    return { success: false, error: error.message };
  }
});

// Handler to read a JSON file
ipcMain.handle('read-json-file', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      // Don't log this as an error since it's expected for new files
      return { success: false, error: 'File does not exist', code: 'ENOENT' };
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContent);
    return { success: true, data: data };
  } catch (error) {
    // Only log actual errors, not missing files
    if (error.code !== 'ENOENT') {
      console.error('Error reading JSON file:', error);
    }
    return { success: false, error: error.message, code: error.code };
  }
});

// Handler to write a JSON file
ipcMain.handle('write-json-file', async (event, { filePath, data }) => {
  try {
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, jsonData);
    return { success: true };
  } catch (error) {
    console.error('Error writing JSON file:', error);
    return { success: false, error: error.message };
  }
});

// Handler for renaming a file
ipcMain.handle('rename-file', async (event, { oldPath, newPath }) => {
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
      newPath = uniquePath; // Update newPath to the unique path
    }
    
    // Perform the rename operation
    fs.renameSync(oldPath, newPath);
    return { success: true, newPath: newPath }; // Return the potentially modified newPath
  } catch (error) {
    console.error('Error renaming file:', error);
    return { success: false, error: error.message };
  }
});

// New IPC Handler to set the PDF Producer (signature)
ipcMain.handle('set-pdf-producer', async (event, { pdfPath, producerString }) => {
  try {
    if (!fs.existsSync(pdfPath)) {
      console.error(`[set-pdf-producer] File does not exist: ${pdfPath}`);
      return { success: false, error: `File does not exist: ${pdfPath}` };
    }

    let existingPdfBytes;
    try {
      existingPdfBytes = fs.readFileSync(pdfPath);
    } catch (readError) {
      console.error(`[set-pdf-producer] Error reading file ${pdfPath}: ${readError.message}`);
      return { success: false, error: `Cannot read file: ${readError.message}` };
    }

    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(existingPdfBytes);
    } catch (loadError) {
      console.error(`[set-pdf-producer] Error loading PDF ${pdfPath}: ${loadError.message}`);
      return { success: false, error: `Cannot load PDF: ${loadError.message}` };
    }

    pdfDoc.setProducer(producerString);

    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, pdfBytes);
    console.log(`[set-pdf-producer] Successfully set producer for ${pdfPath} to "${producerString}"`);
    return { success: true };
  } catch (error) {
    console.error(`[set-pdf-producer] Error setting PDF producer for ${pdfPath}:`, error);
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

// Handler to find a file that may have been renamed
ipcMain.handle('find-file-smart', async (event, originalPath) => {
  try {
    // First, check if the original file still exists
    if (fs.existsSync(originalPath)) {
      return { success: true, foundPath: originalPath, wasRenamed: false };
    }

    const directory = path.dirname(originalPath);
    const originalBasename = path.basename(originalPath, '.pdf');
    
    // Look for similar files in the same directory
    const items = fs.readdirSync(directory);
    const pdfFiles = items.filter(item => path.extname(item).toLowerCase() === '.pdf');
    
    // Try to find the most likely candidate
    for (const pdfFile of pdfFiles) {
      const candidatePath = path.join(directory, pdfFile);
      const candidateBasename = path.basename(pdfFile, '.pdf');
      
      // Check if there's a companion JSON file with matching metadata
      const jsonPath = candidatePath.replace(/\.pdf$/i, '.json');
      if (fs.existsSync(jsonPath)) {
        try {
          const jsonContent = fs.readFileSync(jsonPath, 'utf8');
          const metadata = JSON.parse(jsonContent);
          
          // If the JSON contains a title that matches the original filename pattern
          // or if the filename is very similar, consider it a match
          if (metadata.title && (
            originalBasename.toLowerCase().includes(metadata.title.toLowerCase()) ||
            metadata.title.toLowerCase().includes(originalBasename.toLowerCase()) ||
            candidateBasename.toLowerCase().includes(originalBasename.toLowerCase()) ||
            originalBasename.toLowerCase().includes(candidateBasename.toLowerCase())
          )) {
            return { 
              success: true, 
              foundPath: candidatePath, 
              wasRenamed: true,
              originalName: originalBasename,
              newName: candidateBasename
            };
          }
        } catch (jsonError) {
          // JSON parsing failed, continue checking other files
        }
      }
      
      // Fallback: check for filename similarity (at least 70% match)
      const similarity = calculateStringSimilarity(originalBasename.toLowerCase(), candidateBasename.toLowerCase());
      if (similarity > 0.7) {
        return { 
          success: true, 
          foundPath: candidatePath, 
          wasRenamed: true,
          originalName: originalBasename,
          newName: candidateBasename,
          similarity: similarity
        };
      }
    }
    
    return { success: false, error: 'File not found in directory' };
  } catch (error) {
    console.error('Error in smart file search:', error);
    return { success: false, error: error.message };
  }
});

// Helper function to calculate string similarity (Levenshtein distance based)
function calculateStringSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}
