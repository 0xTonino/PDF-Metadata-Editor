# Manual Library

A desktop application for organizing, viewing, and managing vehicle manuals and technical documentation.

## Features

- **Automatic PDF scanning** - Recursively scans directories for PDF files
- **Smart file resolution** - Automatically finds files even when renamed
- **Metadata editing** - Edit and save metadata for each manual
- **PDF viewing** - Built-in PDF viewer with zoom and navigation
- **JSON metadata storage** - Stores metadata in companion JSON files
- **File management** - Rename PDFs based on metadata

## New Features (Latest Update)

### Smart File Resolution
- **Automatic file finding**: When a PDF file is renamed outside the app, the system will automatically locate it
- **Intelligent matching**: Uses filename similarity and JSON metadata to find renamed files
- **Visual feedback**: Shows success messages when files are found after being renamed
- **Fallback options**: Multiple strategies to locate missing files

### Enhanced Form Editing
- **Always editable**: Form fields are now properly enabled when a PDF is selected
- **Visual indicators**: Clear visual feedback for enabled/disabled form states
- **Better accessibility**: Improved keyboard navigation and screen reader support
- **Refresh functionality**: Added refresh button to rescan directories

### Error Handling
- **Graceful degradation**: App continues to work even when some files are missing
- **User-friendly messages**: Clear error messages with actionable suggestions
- **Recovery options**: Easy ways to recover from file path issues

## Usage

1. **Select a directory** containing your PDF manuals
2. **Browse the list** of discovered manuals
3. **Click on a manual** to view and edit its metadata
4. **Edit the metadata** fields as needed
5. **Save changes** to update both the JSON file and PDF metadata

### File Resolution

If you rename a PDF file outside the application:
1. The app will automatically search for the renamed file
2. It uses filename similarity and JSON metadata to find matches
3. Success messages will confirm when files are found
4. Use the "Refresh" button to rescan the directory if needed

### Troubleshooting

- **File not found errors**: Use the "Refresh" button in the manuals panel
- **Form not editable**: Make sure a PDF is selected from the list
- **Metadata not saving**: Check file permissions and disk space

## Technical Details

- Built with Electron for cross-platform compatibility
- Uses PDF.js for PDF rendering
- Stores metadata in JSON files alongside PDFs
- Supports file renaming and smart path resolution

## Installation

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm start` to launch the application

## File Structure

```
app/
├── main.js          # Main Electron process
├── renderer.js      # Renderer process (UI logic)
├── index.html       # Main application window
├── styles.css       # Application styles
└── package.json     # Project dependencies
```

## Dependencies

- Electron - Desktop application framework
- PDF.js (pdfjs-dist) - PDF rendering
- pdf-lib - PDF metadata manipulation
- electron-store - Application settings storage

## Current Limitations

- PDF metadata saving is not fully implemented in this version (UI updates only)
- The viewer shows the entire PDF instead of just the first 5 and last 5 pages
- No PDF search functionality
- Limited PDF rendering options

## Planned Enhancements

- Save metadata directly to PDF files
- Implement first 5/last 5 pages preview mode
- Add search functionality
- Improve PDF rendering performance
- Add sorting and filtering options for the manuals list

## License

MIT
