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
    },
    learningData: {
      type: 'object',
      default: {
        brandPatterns: {},
        modelPatterns: {},
        typePatterns: {},
        filenameAssociations: {},
        completionStats: {}
      }
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
    // Check if directory exists before trying to read it
    if (!fs.existsSync(directoryPath)) {
      console.warn(`Directory does not exist, skipping: ${directoryPath}`);
      return pdfFiles;
    }

    const items = fs.readdirSync(directoryPath);
    
    for (const item of items) {
      const itemPath = path.join(directoryPath, item);
      
      try {
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
      } catch (itemError) {
        // Skip individual items that can't be accessed (broken symlinks, permission issues, etc.)
        console.warn(`Skipping inaccessible item: ${itemPath} - ${itemError.message}`);
        continue;
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${directoryPath}:`, error.message);
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

// Handler to save learning data from user metadata entries
ipcMain.handle('save-learning-data', async (event, { filename, metadata }) => {
  try {
    const learningData = store.get('learningData');
    
    // Extract patterns from filename
    const normalizedFilename = filename.toLowerCase();
    const filenameParts = normalizedFilename.replace(/[^a-z0-9]/g, ' ').split(/\s+/);
    
    // Learn brand patterns (preserve original case)
    if (metadata.brand) {
      const brandKey = metadata.brand.toLowerCase(); // for indexing
      const brandValue = metadata.brand; // preserve original case
      if (!learningData.brandPatterns[brandKey]) {
        learningData.brandPatterns[brandKey] = { count: 0, associatedWords: {}, originalValue: brandValue };
      }
      learningData.brandPatterns[brandKey].count++;
      learningData.brandPatterns[brandKey].originalValue = brandValue; // Update with latest case
      
      // Associate filename words with this brand
      filenameParts.forEach(word => {
        if (word.length > 2) { // Ignore short words
          if (!learningData.brandPatterns[brandKey].associatedWords[word]) {
            learningData.brandPatterns[brandKey].associatedWords[word] = 0;
          }
          learningData.brandPatterns[brandKey].associatedWords[word]++;
        }
      });
    }
    
    // Learn model patterns (preserve original case)
    if (metadata.model) {
      const modelKey = metadata.model.toLowerCase();
      const modelValue = metadata.model;
      if (!learningData.modelPatterns[modelKey]) {
        learningData.modelPatterns[modelKey] = { count: 0, associatedWords: {}, brands: {}, originalValue: modelValue };
      }
      learningData.modelPatterns[modelKey].count++;
      learningData.modelPatterns[modelKey].originalValue = modelValue;
      
      // Associate with brand
      if (metadata.brand) {
        const brand = metadata.brand.toLowerCase();
        if (!learningData.modelPatterns[modelKey].brands[brand]) {
          learningData.modelPatterns[modelKey].brands[brand] = 0;
        }
        learningData.modelPatterns[modelKey].brands[brand]++;
      }
      
      // Associate filename words with this model
      filenameParts.forEach(word => {
        if (word.length > 2) {
          if (!learningData.modelPatterns[modelKey].associatedWords[word]) {
            learningData.modelPatterns[modelKey].associatedWords[word] = 0;
          }
          learningData.modelPatterns[modelKey].associatedWords[word]++;
        }
      });
    }
    
    // Learn manual type patterns (preserve original case)
    if (metadata.manualType) {
      const typeKey = metadata.manualType.toLowerCase();
      const typeValue = metadata.manualType;
      if (!learningData.typePatterns[typeKey]) {
        learningData.typePatterns[typeKey] = { count: 0, associatedWords: {}, originalValue: typeValue };
      }
      learningData.typePatterns[typeKey].count++;
      learningData.typePatterns[typeKey].originalValue = typeValue;
      
      // Associate filename words with this type
      filenameParts.forEach(word => {
        if (word.length > 2) {
          if (!learningData.typePatterns[typeKey].associatedWords[word]) {
            learningData.typePatterns[typeKey].associatedWords[word] = 0;
          }
          learningData.typePatterns[typeKey].associatedWords[word]++;
        }
      });
    }
    
    // Store complete filename associations (preserve original case)
    const filenameKey = normalizedFilename.substring(0, 50); // Limit key length
    learningData.filenameAssociations[filenameKey] = {
      brand: metadata.brand || '',
      model: metadata.model || '',
      manualType: metadata.manualType || '',
      year: metadata.year || '',
      lastUsed: Date.now()
    };
    
    // Update completion stats
    if (!learningData.completionStats.totalSaved) {
      learningData.completionStats.totalSaved = 0;
    }
    learningData.completionStats.totalSaved++;
    learningData.completionStats.lastSaved = Date.now();
    
    store.set('learningData', learningData);
    return { success: true };
  } catch (error) {
    console.error('Error saving learning data:', error);
    return { success: false, error: error.message };
  }
});

// Handler to get smart suggestions based on filename
ipcMain.handle('get-smart-suggestions', async (event, filename) => {
  try {
    const learningData = store.get('learningData');
    const normalizedFilename = filename.toLowerCase();
    const filenameParts = normalizedFilename.replace(/[^a-z0-9]/g, ' ').split(/\s+/);
    
    const suggestions = {
      brand: [],
      model: [],
      manualType: [],
      confidence: 0
    };
    
    // Check for exact filename matches first
    const filenameKey = normalizedFilename.substring(0, 50);
    if (learningData.filenameAssociations[filenameKey]) {
      const exactMatch = learningData.filenameAssociations[filenameKey];
      suggestions.confidence = 0.9;
      if (exactMatch.brand) suggestions.brand.push({ value: exactMatch.brand, confidence: 0.9, reason: 'exact filename match' });
      if (exactMatch.model) suggestions.model.push({ value: exactMatch.model, confidence: 0.9, reason: 'exact filename match' });
      if (exactMatch.manualType) suggestions.manualType.push({ value: exactMatch.manualType, confidence: 0.9, reason: 'exact filename match' });
      return { success: true, suggestions };
    }
    
    // Analyze brand patterns
    const brandScores = {};
    Object.keys(learningData.brandPatterns).forEach(brandKey => {
      const pattern = learningData.brandPatterns[brandKey];
      let score = 0;
      let matchedWords = 0;
      
      filenameParts.forEach(word => {
        if (pattern.associatedWords[word]) {
          score += pattern.associatedWords[word] / pattern.count;
          matchedWords++;
        }
      });
      
      if (matchedWords > 0) {
        brandScores[brandKey] = { score: score * (matchedWords / filenameParts.length), originalValue: pattern.originalValue };
      }
    });
    
    // Get top brand suggestions
    const topBrands = Object.entries(brandScores)
      .sort(([,a], [,b]) => b.score - a.score)
      .slice(0, 3)
      .map(([brandKey, data]) => ({
        value: data.originalValue, // Use original case
        confidence: Math.min(data.score, 0.8),
        reason: `learned from ${learningData.brandPatterns[brandKey].count} files`
      }));
    
    suggestions.brand = topBrands;
    
    // Analyze model patterns (similar logic)
    const modelScores = {};
    Object.keys(learningData.modelPatterns).forEach(modelKey => {
      const pattern = learningData.modelPatterns[modelKey];
      let score = 0;
      let matchedWords = 0;
      
      filenameParts.forEach(word => {
        if (pattern.associatedWords[word]) {
          score += pattern.associatedWords[word] / pattern.count;
          matchedWords++;
        }
      });
      
      if (matchedWords > 0) {
        modelScores[modelKey] = { score: score * (matchedWords / filenameParts.length), originalValue: pattern.originalValue };
      }
    });
    
    const topModels = Object.entries(modelScores)
      .sort(([,a], [,b]) => b.score - a.score)
      .slice(0, 3)
      .map(([modelKey, data]) => ({
        value: data.originalValue, // Use original case
        confidence: Math.min(data.score, 0.8),
        reason: `learned from ${learningData.modelPatterns[modelKey].count} files`
      }));
    
    suggestions.model = topModels;
    
    // Analyze manual type patterns
    const typeScores = {};
    Object.keys(learningData.typePatterns).forEach(typeKey => {
      const pattern = learningData.typePatterns[typeKey];
      let score = 0;
      let matchedWords = 0;
      
      filenameParts.forEach(word => {
        if (pattern.associatedWords[word]) {
          score += pattern.associatedWords[word] / pattern.count;
          matchedWords++;
        }
      });
      
      if (matchedWords > 0) {
        typeScores[typeKey] = { score: score * (matchedWords / filenameParts.length), originalValue: pattern.originalValue };
      }
    });
    
    const topTypes = Object.entries(typeScores)
      .sort(([,a], [,b]) => b.score - a.score)
      .slice(0, 3)
      .map(([typeKey, data]) => ({
        value: data.originalValue, // Use original case
        confidence: Math.min(data.score, 0.8),
        reason: `learned from ${learningData.typePatterns[typeKey].count} files`
      }));
    
    suggestions.manualType = topTypes;
    
    // Calculate overall confidence
    const hasHighConfidenceSuggestions = suggestions.brand.some(s => s.confidence > 0.5) ||
                                       suggestions.model.some(s => s.confidence > 0.5) ||
                                       suggestions.manualType.some(s => s.confidence > 0.5);
    
    suggestions.confidence = hasHighConfidenceSuggestions ? 0.7 : 0.3;
    
    return { success: true, suggestions };
  } catch (error) {
    console.error('Error getting smart suggestions:', error);
    return { success: false, error: error.message };
  }
});

// Handler to get learning statistics
ipcMain.handle('get-learning-stats', async () => {
  try {
    const learningData = store.get('learningData');
    const stats = {
      totalFiles: learningData.completionStats.totalSaved || 0,
      uniqueBrands: Object.keys(learningData.brandPatterns).length,
      uniqueModels: Object.keys(learningData.modelPatterns).length,
      uniqueTypes: Object.keys(learningData.typePatterns).length,
      lastSaved: learningData.completionStats.lastSaved
    };
    return { success: true, stats };
  } catch (error) {
    console.error('Error getting learning stats:', error);
    return { success: false, error: error.message };
  }
});

// Handler to delete a specific suggestion from learning data
ipcMain.handle('delete-suggestion', async (event, { type, value }) => {
  try {
    const learningData = store.get('learningData');
    const key = value.toLowerCase();
    
    switch (type) {
      case 'brand':
        if (learningData.brandPatterns[key]) {
          delete learningData.brandPatterns[key];
          console.log(`Deleted brand suggestion: ${value}`);
        }
        break;
      case 'model':
        if (learningData.modelPatterns[key]) {
          delete learningData.modelPatterns[key];
          console.log(`Deleted model suggestion: ${value}`);
        }
        break;
      case 'manualType':
        if (learningData.typePatterns[key]) {
          delete learningData.typePatterns[key];
          console.log(`Deleted manual type suggestion: ${value}`);
        }
        break;
      default:
        return { success: false, error: 'Invalid suggestion type' };
    }
    
    store.set('learningData', learningData);
    return { success: true };
  } catch (error) {
    console.error('Error deleting suggestion:', error);
    return { success: false, error: error.message };
  }
});

// Handler to reset all learning data
ipcMain.handle('reset-learning-data', async () => {
  try {
    const resetData = {
      brandPatterns: {},
      modelPatterns: {},
      typePatterns: {},
      filenameAssociations: {},
      completionStats: {}
    };
    
    store.set('learningData', resetData);
    console.log('Learning data has been completely reset');
    return { success: true };
  } catch (error) {
    console.error('Error resetting learning data:', error);
    return { success: false, error: error.message };
  }
});
