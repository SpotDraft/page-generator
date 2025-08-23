# 📸 Webpage Replicator

An AI-powered tool that analyzes screenshots of webpages and generates pixel-perfect HTML, CSS, and JavaScript replicas using Google's Gemini API.

## 🌟 Features

- **Screenshot Analysis**: Upload any webpage screenshot for AI analysis
- **Code Generation**: Automatically generates HTML, CSS, and JavaScript
- **Visual Comparison**: AI-powered similarity scoring between original and generated pages
- **Unique URLs**: Each generated page gets a unique URL for easy sharing
- **Form Focused**: Optimized for replicating signup forms, contact forms, and similar interfaces
- **Responsive Design**: Generated pages include responsive CSS for mobile compatibility

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- Google Gemini API key

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd Signup-page-gen
```

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit the `.env` file and add your Gemini API key:
```
GEMINI_API_KEY=your_actual_api_key_here
```

### 3. Frontend Setup

```bash
cd ../frontend
npm install
```

### 4. Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
```

### 5. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Generated pages: http://localhost:3001/{page-id}

## 📖 How to Use

1. **Upload Screenshot**: Click the upload area or drag & drop a webpage screenshot
2. **Generate Page**: Click "Generate Webpage" to create the HTML replica
3. **View Results**: Access your generated page via the provided URL
4. **Compare Quality**: Review the AI's similarity analysis and improvement suggestions

## 🛠 API Endpoints

### `POST /api/generate-page`
Upload a screenshot and generate a webpage replica.

**Request:**
- `screenshot` (file): Image file (PNG, JPG, etc.)

**Response:**
```json
{
  "success": true,
  "pageId": "uuid-string",
  "url": "http://localhost:3001/uuid-string",
  "previewUrl": "http://localhost:3001/uuid-string/index.html"
}
```

### `POST /api/compare-page/:pageId`
Compare the generated page with the original screenshot.

**Response:**
```json
{
  "success": true,
  "pageId": "uuid-string",
  "comparison": {
    "similarity_score": 8,
    "layout_score": 9,
    "color_score": 7,
    "typography_score": 8,
    "positioning_score": 9,
    "feedback": "Detailed analysis...",
    "improvements": ["suggestion1", "suggestion2"]
  }
}
```

### `GET /api/pages`
List all generated pages.

### `GET /api/health`
Health check endpoint.

## 🏗 Project Structure

```
Signup-page-gen/
├── backend/                 # Express.js API server
│   ├── server.js           # Main server file
│   ├── package.json        # Backend dependencies
│   └── .env.example        # Environment variables template
├── frontend/               # Static web interface
│   ├── index.html          # Main frontend application
│   └── package.json        # Frontend dependencies
├── generated-pages/        # Stores generated HTML files
└── README.md              # Project documentation
```

## 🎨 Use Cases

This tool is particularly effective for:

- **Signup Forms**: User registration pages
- **Contact Forms**: Customer inquiry forms
- **Onboarding Forms**: Multi-step user onboarding
- **Survey Forms**: Data collection interfaces
- **Login Pages**: Authentication interfaces
- **Landing Pages**: Simple promotional pages

## 🔧 Configuration

### Environment Variables

- `GEMINI_API_KEY`: Your Google Gemini API key (required)
- `PORT`: Backend server port (default: 3001)
- `GEMINI_MODEL`: AI model to use (default: gemini-2.0-flash-exp)

### Supported Image Formats

- PNG
- JPG/JPEG
- WebP
- GIF (static)

### File Size Limits

- Maximum upload size: 10MB
- Recommended: Under 5MB for best performance

## 🚨 Limitations

- Requires active internet connection for AI processing
- Complex interactive elements may need manual refinement
- Dynamic content (data from APIs) cannot be replicated
- Performance depends on Gemini API availability

## 🔒 Security Notes

- API keys are stored in environment variables
- File uploads are validated for type and size
- Generated content is served from isolated directories
- No user data is permanently stored

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**"Failed to generate page"**
- Check your Gemini API key is valid
- Ensure the image is under 10MB
- Try a different image format

**"Cannot connect to backend"**
- Verify backend is running on port 3001
- Check for CORS issues in browser console

**"Poor similarity score"**
- Try uploading a clearer screenshot
- Ensure the original page has good contrast
- Consider simpler layouts for better results

### Getting Help

- Check the browser console for errors
- Review backend logs for API issues
- Ensure all dependencies are installed correctly

---

Built with ❤️ using Google Gemini AI