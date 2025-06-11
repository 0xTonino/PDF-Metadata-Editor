# 📚 Manual Library

> A modern desktop application for organizing, viewing, and managing vehicle manuals and technical documentation

[![Electron](https://img.shields.io/badge/Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://electronjs.org/)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![PDF.js](https://img.shields.io/badge/PDF.js-FF6B35?style=for-the-badge&logo=adobe&logoColor=white)](https://mozilla.github.io/pdf.js/)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://choosealicense.com/licenses/mit/)

## 📋 Table of Contents

- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [📖 Usage](#-usage)
- [📸 Screenshots](#-screenshots)
- [🎬 Demo & Live Preview](#-demo--live-preview)
- [🔧 Tech Stack](#-tech-stack)
- [📁 Project Structure](#-project-structure)
- [🤖 Development Story](#-development-story)
- [🚀 Current Status](#-current-status)
- [🤝 Contributing](#-contributing)
- [📝 License](#-license)
- [🙏 Acknowledgments](#-acknowledgments)

## ✨ Features

### 🔍 **Smart PDF Management**
- **Automatic PDF Discovery** - Recursively scans directories for PDF files
- **Intelligent File Resolution** - Automatically finds files even when renamed outside the app
- **Metadata Management** - Edit and save comprehensive metadata for each manual
- **JSON Storage** - Stores metadata in companion JSON files alongside PDFs

### 📑 **Advanced PDF Viewing**
- **Built-in PDF Viewer** - Powered by PDF.js with zoom and navigation controls
- **Responsive Interface** - Clean, modern UI that adapts to your workflow
- **Quick Preview** - Fast loading and rendering of PDF documents

### 🛠️ **File Operations**
- **Smart File Matching** - Uses filename similarity and metadata for intelligent file location
- **Bulk Operations** - Manage multiple manuals efficiently
- **File Renaming** - Rename PDFs based on their metadata
- **Error Recovery** - Graceful handling of missing or moved files

### 🔄 **Latest Enhancements**
- ✅ **Always-Editable Forms** - Form fields properly enabled when PDFs are selected
- ✅ **Visual Feedback** - Clear indicators for all user actions
- ✅ **Improved Accessibility** - Better keyboard navigation and screen reader support
- ✅ **Auto-Refresh** - Smart directory rescanning capabilities
- ✅ **Enhanced Error Handling** - User-friendly error messages with actionable solutions

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/0xTonino/PDF-Metadata-Editor.git
   cd PDF-Metadata-Editor
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Launch the application**
   ```bash
   npm start
   ```

## 📖 Usage

### Getting Started

1. **📁 Select Directory** - Choose a folder containing your PDF manuals
2. **👀 Browse Collection** - View the automatically discovered manuals in the sidebar
3. **✏️ Edit Metadata** - Click on any manual to view and edit its information
4. **💾 Save Changes** - Updates are saved to both JSON files and PDF metadata

### 🔄 File Resolution

When files are renamed outside the application:

- 🔍 **Automatic Detection** - The app searches for renamed files using intelligent matching
- 📊 **Similarity Analysis** - Compares filenames and metadata to find the best matches
- ✅ **Success Notifications** - Clear feedback when files are successfully located
- 🔄 **Manual Refresh** - Use the refresh button to rescan directories

## 📸 Screenshots

<!-- 
📸 **Screenshot Placement Instructions:**

To add screenshots to your README:

**Option 1: Repository Assets (Recommended)**
1. Create an `assets` or `screenshots` folder in your repository root
2. Upload your screenshot files there (PNG or JPG format)
3. Reference them like this: ![Main Interface](./assets/main-interface.png)

**Option 2: GitHub Issues Hosting**
1. Go to Issues tab in your GitHub repo
2. Click "New Issue" 
3. Drag and drop your images into the comment box
4. Copy the generated URLs (they look like: https://user-images.githubusercontent.com/...)
5. Use those URLs in your README: ![Description](URL)

**Recommended Screenshots:**
- Main application window with PDF loaded
- Metadata editing interface
- File management/resolution features
- Settings or preferences panel

Example:
![Main Interface](./assets/main-interface.png)
*Main application interface showing PDF viewer and metadata editor*

![Smart File Resolution](./assets/file-resolution.png) 
*Automatic file resolution when PDFs are renamed*
-->

### 🛠️ Troubleshooting

| Issue | Solution |
|-------|----------|
| 🚫 File not found errors | Use the "Refresh" button in the manuals panel |
| ❌ Form not editable | Ensure a PDF is selected from the list |
| 💾 Metadata not saving | Check file permissions and available disk space |

## 🔧 Tech Stack

### Core Technologies
- **[Electron](https://electronjs.org/)** - Cross-platform desktop application framework
- **[PDF.js](https://mozilla.github.io/pdf.js/)** - JavaScript PDF rendering engine
- **[pdf-lib](https://pdf-lib.js.org/)** - PDF metadata manipulation
- **[electron-store](https://github.com/sindresorhus/electron-store)** - Application settings persistence

### Development Tools
- **JavaScript ES6+** - Modern JavaScript features
- **HTML5 & CSS3** - Responsive and accessible UI
- **Node.js** - Runtime environment

## 📁 Project Structure

```
PDF-Metadata-Editor/
├── 📄 main.js                # Main Electron process
├── 📄 renderer.js            # Renderer process (UI logic)  
├── 📄 index.html             # Main application window
├── 📄 styles.css             # Application styles
├── 📄 package.json           # Project configuration
├── 📄 package-lock.json      # Dependency lock file
├── 📄 .gitignore             # Git ignore rules
├── 📄 README.md              # Project documentation
└── 📂 assets/                # Screenshots and media files (optional)
```

## 🎬 Demo & Live Preview

### 🖥️ Try the Application
1. Download the latest release from the [Releases](https://github.com/0xTonino/PDF-Metadata-Editor/releases) page
2. Or clone and run locally following the [Quick Start](#-quick-start) instructions

## 🤖 Development Story

This project was **vibe coded** - meaning it was developed collaboratively with AI agents handling the majority of the implementation:

- 🤖 **AI-Powered Development** - Core functionality written by AI agents (Claude, Cursor AI)
- 🧠 **Human-AI Collaboration** - Strategic decisions and requirements guided by human oversight
- 🔄 **Iterative Refinement** - Continuous improvement through human feedback and AI implementation
- 📚 **Transparent Development** - Open about the role of AI in creating this application
- 🎯 **AI-First Approach** - Leveraging AI capabilities for rapid prototyping and feature development

### 🔧 AI Contributions
- Complete codebase architecture and implementation
- Smart file resolution algorithms
- UI/UX design and responsive layout
- Error handling and recovery systems
- Documentation and README creation

*This project demonstrates the potential of human-AI collaboration in software development, where AI handles implementation while humans provide direction and requirements.*

## 🚀 Current Status

### ✅ Implemented Features
- ✅ PDF scanning and discovery
- ✅ Metadata editing and storage
- ✅ Built-in PDF viewer
- ✅ Smart file resolution
- ✅ Enhanced form handling
- ✅ Error recovery systems

### 🔄 In Progress
- 🔄 Advanced PDF rendering options
- 🔄 Search functionality

### 📋 Planned Features
- 📋 Advanced sorting and filtering
- 📋 Batch metadata operations
- 📋 Plugin system for custom metadata fields

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. 🍴 **Fork the repository**
2. 🌿 **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. 💾 **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. 📤 **Push to the branch** (`git push origin feature/amazing-feature`)
5. 🔄 **Open a Pull Request**

### Development Guidelines
- Follow existing code style and conventions
- Add tests for new features when applicable
- Update documentation for any API changes
- Ensure cross-platform compatibility

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **PDF.js Team** - For the excellent PDF rendering engine
- **Electron Team** - For making cross-platform desktop apps accessible
- **Open Source Community** - For the amazing tools and libraries

---

<div align="center">

**Built with 🤖 AI collaboration • Vibe coded for the community**

[⭐ Star this repo](https://github.com/0xTonino/PDF-Metadata-Editor) • [🐛 Report Bug](https://github.com/0xTonino/PDF-Metadata-Editor/issues) • [💡 Request Feature](https://github.com/0xTonino/PDF-Metadata-Editor/issues)

</div>
