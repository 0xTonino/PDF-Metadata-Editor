# Manual Library

A desktop application for organizing, viewing, and managing vehicle manuals and technical documentation.

## Features

- **Manual Listing**: Browse and select PDF manuals from a selected directory and its subdirectories
- **Three-panel Layout**: Intuitive interface with manuals list, PDF viewer, and metadata editor
- **PDF Viewer**: View PDF documents with basic navigation controls
- **Metadata Editor**: Edit and organize manuals with comprehensive metadata fields
- **Automatic Metadata Extraction**: Attempts to parse metadata from filenames

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) (v14.0.0 or higher recommended)
- [npm](https://www.npmjs.com/) (comes with Node.js)

### Steps

1. Clone or download this repository
2. Open a terminal in the project directory
3. Install dependencies:

```bash
npm install
```

4. Start the application:

```bash
npm start
```

## Usage

1. Click "Select Folder" to choose a directory containing PDF manuals
2. Browse the list of manuals in the left panel
3. Click on a manual to view it in the center panel
4. Edit metadata for the selected manual in the right panel
5. Click "Save Changes" to save the metadata

## Project Structure

- `main.js` - Electron main process (window creation, app lifecycle, IPC handlers)
- `renderer.js` - UI interactions and application logic
- `index.html` - Application HTML structure (three-panel layout)
- `styles.css` - Application styling
- `package.json` - Project configuration, dependencies, and scripts

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
