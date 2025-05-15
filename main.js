const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

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
