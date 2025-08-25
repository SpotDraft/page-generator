import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import dotenv from 'dotenv';
import GCSService from './gcs-service.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize GCS Service
let gcsService;
try {
  gcsService = new GCSService();
  console.log('GCS Service initialized successfully');
} catch (error) {
  console.error('Failed to initialize GCS Service:', error.message);
  process.exit(1);
}

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Initialize Gemini AI
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

// Function to remove existing terms/conditions elements to avoid duplicates with Clickthrough SDK
function removeExistingTermsElements(html) {
  console.log('Scanning for existing terms/conditions elements to remove...');
  
  // Patterns to detect and remove existing terms/conditions elements
  const termsPatterns = [
    // Checkboxes with terms-related text
    /<input[^>]*type\s*=\s*["']checkbox["'][^>]*[^>]*>\s*[^<]*(?:terms|condition|agree|policy|privacy)[^<]*<\/?\w*>/gi,
    /<label[^>]*>[^<]*<input[^>]*type\s*=\s*["']checkbox["'][^>]*>\s*[^<]*(?:terms|condition|agree|policy|privacy)[^<]*<\/label>/gi,
    
    // Divs or paragraphs containing checkbox + terms text
    /<div[^>]*>[^<]*<input[^>]*type\s*=\s*["']checkbox["'][^>]*>[^<]*(?:terms|condition|agree|policy|privacy)[^<]*<\/div>/gi,
    /<p[^>]*>[^<]*<input[^>]*type\s*=\s*["']checkbox["'][^>]*>[^<]*(?:terms|condition|agree|policy|privacy)[^<]*<\/p>/gi,
    
    // Text containing "I agree to" or similar
    /<[^>]*>[^<]*(?:I\s+agree\s+to|By\s+clicking|Accept\s+terms|Terms\s+and\s+conditions|Privacy\s+policy)[^<]*<\/[^>]*>/gi,
    
    // Links to terms/privacy within form contexts
    /<a[^>]*href[^>]*(?:terms|privacy|condition)[^>]*>[^<]*(?:terms|privacy|condition)[^<]*<\/a>/gi,
    
    // Standalone checkboxes near submit buttons (likely terms acceptance)
    /<input[^>]*type\s*=\s*["']checkbox["'][^>]*>\s*(?=.*(?:submit|sign.up|register))/gi
  ];
  
  let removedCount = 0;
  
  // Remove each pattern found
  termsPatterns.forEach((pattern, index) => {
    const matches = html.match(pattern);
    if (matches) {
      console.log(`Pattern ${index + 1} found ${matches.length} matches:`, matches);
      html = html.replace(pattern, '');
      removedCount += matches.length;
    }
  });
  
  console.log(`Total terms/conditions elements removed: ${removedCount}`);
  return html;
}

// Function to remove image references from generated HTML
function removeImageReferences(html) {
  console.log('Removing image references from generated HTML...');
  
  // Remove img tags
  html = html.replace(/<img[^>]*>/gi, '');
  
  // Remove src attributes from other elements
  html = html.replace(/\s+src\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove background-image CSS properties
  html = html.replace(/background-image\s*:\s*url\([^)]*\);?/gi, '');
  
  // Remove other image-related CSS
  html = html.replace(/background\s*:\s*url\([^)]*\)[^;]*;?/gi, '');
  
  console.log('Image references removed');
  return html;
}

// Function to add Clickthrough SDK integration
function addClickthroughToHTML(html, clickthroughId, clusterId) {
  console.log('Adding Clickthrough integration...');
  console.log('Parameters:', { clickthroughId, clusterId });
  
  try {
    // Remove existing terms/conditions elements first
    html = removeExistingTermsElements(html);
    
    // Find form elements
    const formRegex = /<form[^>]*>/i;
    const formMatch = html.match(formRegex);
    
    if (!formMatch) {
      console.log('No form found for Clickthrough integration');
      return html;
    }
    
    // Find submit button
    const submitButtonRegex = /<(button|input)[^>]*(?:type\s*=\s*["']submit["']|class\s*=\s*["'][^"']*submit[^"']*["'])[^>]*>/i;
    const submitMatch = html.match(submitButtonRegex);
    
    if (!submitMatch) {
      console.log('No submit button found for Clickthrough integration');
      return html;
    }
    
    // Clickthrough integration code
    const clickthroughIntegration = `
    <!-- Clickthrough SDK Integration -->
    <script async defer crossorigin="anonymous" src="https://api.in.spotdraft.com/clickthrough/clickthrough.js"></script>
    <script>
      document.addEventListener('DOMContentLoaded', function() {
        // Initialize Clickthrough
        window.Clickthrough = window.Clickthrough || {};
        window.Clickthrough.host = '${clusterId}';
        
        // Find the form and submit button
        const form = document.querySelector('form');
        const submitButton = form ? form.querySelector('button[type="submit"], input[type="submit"], .submit-button') : null;
        
        if (form && submitButton) {
          console.log('Clickthrough: Form and submit button found');
          
          // Create terms acceptance checkbox
          const termsCheckbox = document.createElement('input');
          termsCheckbox.type = 'checkbox';
          termsCheckbox.id = 'clickthrough-terms';
          termsCheckbox.name = 'clickthrough-terms';
          termsCheckbox.required = true;
          termsCheckbox.style.marginRight = '8px';
          
          // Create terms label with Clickthrough link
          const termsLabel = document.createElement('label');
          termsLabel.htmlFor = 'clickthrough-terms';
          termsLabel.innerHTML = 'I agree to the <a href="#" data-clickthrough-id="${clickthroughId}" data-clickthrough-host="${clusterId}">Terms and Conditions</a>';
          termsLabel.style.fontSize = '14px';
          termsLabel.style.marginBottom = '16px';
          termsLabel.style.display = 'block';
          
          // Create container for terms
          const termsContainer = document.createElement('div');
          termsContainer.appendChild(termsCheckbox);
          termsContainer.appendChild(termsLabel);
          termsContainer.style.marginBottom = '16px';
          
          // Insert terms before submit button
          submitButton.parentNode.insertBefore(termsContainer, submitButton);
          
          // Initialize Clickthrough on the terms link
          const termsLink = termsLabel.querySelector('[data-clickthrough-id]');
          if (termsLink && window.Clickthrough) {
            console.log('Clickthrough: Initializing on terms link');
            // The Clickthrough SDK will automatically handle links with data-clickthrough-id
          }
          
          // Prevent form submission if terms not accepted
          form.addEventListener('submit', function(e) {
            if (!termsCheckbox.checked) {
              e.preventDefault();
              alert('Please accept the Terms and Conditions to continue.');
              return false;
            }
          });
          
          console.log('Clickthrough: Integration complete');
        } else {
          console.log('Clickthrough: Form or submit button not found');
        }
      });
    </script>`;
    
    // Insert before closing </body> tag
    const bodyCloseIndex = html.lastIndexOf('</body>');
    if (bodyCloseIndex !== -1) {
      html = html.slice(0, bodyCloseIndex) + clickthroughIntegration + html.slice(bodyCloseIndex);
      console.log('Clickthrough integration added successfully');
    } else {
      // If no </body> tag, append to end
      html += clickthroughIntegration;
      console.log('Clickthrough integration appended to end (no </body> tag found)');
    }
    
    return html;
    
  } catch (error) {
    console.error('Error adding Clickthrough integration:', error);
    // Return original HTML if processing fails
    return html;
  }
}

// Endpoint to upload screenshot and generate webpage
app.post('/api/generate-page', upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No screenshot uploaded' });
    }

    const pageId = uuidv4();
    const screenshotBuffer = req.file.buffer;
    
    // Get Clickthrough parameters from form data
    const clickthroughId = req.body.clickthroughId;
    const clusterId = req.body.clusterId;
    
    console.log('Received parameters:', {
      clickthroughId,
      clusterId,
      hasFile: !!req.file,
      bodyKeys: Object.keys(req.body)
    });
    
    // Convert image to base64 for Gemini
    const base64Image = screenshotBuffer.toString('base64');
    const mimeType = req.file.mimetype;

    // Generate HTML/CSS/JS using Gemini - CLEAN GENERATION WITHOUT CLICKTHROUGH
    
    // Universal instructions that always apply
    const imageHandlingInstructions = `
    
    CRITICAL IMAGE HANDLING INSTRUCTIONS (ALWAYS APPLY):
    - DO NOT include any <img> tags or image references from the screenshot
    - DO NOT attempt to replicate logos, photos, graphics, or any visual images
    - REPLACE image areas with appropriate styled elements:
      * For logos: Use styled text/typography or CSS-based geometric shapes
      * For decorative images: Use CSS backgrounds, gradients, or colored divs
      * For photos: Use placeholder colored backgrounds or CSS patterns
      * For icons: Use CSS symbols, Unicode characters, or styled elements
    - Focus on creating a clean, functional page without broken image links
    - Use colors, typography, and CSS styling to maintain visual hierarchy instead of images
    `;
    
    let clickthroughInstructions = '';
    if (clickthroughId && clusterId) {
      clickthroughInstructions = `
      
      IMPORTANT: Do NOT include any terms and conditions, privacy policy checkboxes, or legal acceptance elements in your generated HTML. These will be added automatically during post-processing.
      `;
    }
    
    const prompt = `
    Analyze this screenshot of a webpage and generate complete HTML, CSS, and JavaScript code to replicate it as closely as possible.
    
    Critical Requirements for Accurate Replication:
    
    TYPOGRAPHY & FONTS:
    - Match exact font families, sizes, and weights
    - Replicate line-height, letter-spacing, and text alignment
    - Preserve heading hierarchy and text formatting
    - Ensure proper font loading and fallbacks
    
    PAGE FORMATTING & LAYOUT:
    - Create pixel-perfect replica of spacing, margins, and padding
    - Match exact element positioning and alignment
    - Preserve proportions and visual hierarchy
    - Implement responsive design with proper breakpoints
    
    VISUAL DETAILS:
    - Match colors exactly (backgrounds, text, borders)
    - Replicate shadows, gradients, and visual effects
    - Preserve border radius, styling, and decorative elements
    - Maintain consistent spacing between all elements
    
    TECHNICAL REQUIREMENTS:
    - Use modern CSS (flexbox, grid) for accurate layout
    - Include all interactive elements and form styling
    - Implement proper semantic HTML structure
    - Add inline CSS and JavaScript in single HTML file
    - Ensure full functionality with form validation and interactions
    ${imageHandlingInstructions}
    ${clickthroughInstructions}
    
    Focus on maintaining the exact visual appearance and formatting integrity of the original design.
    
    IMPORTANT: Return ONLY the complete HTML code with embedded CSS and JavaScript. Do not use markdown code blocks, backticks, or any formatting - just return the raw HTML code directly.
    `;

    const response = await genAI.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Image,
                mimeType: mimeType
              }
            }
          ]
        }
      ]
    });

    let generatedHTML = response.text;
    
    // Clean up markdown code block formatting if present
    generatedHTML = generatedHTML
      .replace(/^```html\s*/i, '')  // Remove opening ```html
      .replace(/^```\s*/gm, '')     // Remove any other opening ```
      .replace(/\s*```$/gm, '')     // Remove closing ```
      .replace(/```html/gi, '')     // Remove any remaining ```html
      .replace(/```/g, '')          // Remove any remaining ```
      .trim();
    
    // POST-PROCESS: Clean up any image references (always apply)
    generatedHTML = removeImageReferences(generatedHTML);
    
    // POST-PROCESS: Add Clickthrough integration if parameters provided
    if (clickthroughId && clusterId) {
      generatedHTML = addClickthroughToHTML(generatedHTML, clickthroughId, clusterId);
    }
    
    // Save generated files to GCS
    const htmlFileName = `pages/${pageId}/index.html`;
    const screenshotFileName = `pages/${pageId}/original.png`;
    
    // Save the HTML file to GCS
    const htmlUrl = await gcsService.uploadFile(htmlFileName, Buffer.from(generatedHTML, 'utf8'), 'text/html');
    
    // Save the original screenshot to GCS
    const screenshotUrl = await gcsService.uploadFile(screenshotFileName, screenshotBuffer, 'image/png');
    
    res.json({
      success: true,
      pageId: pageId,
      url: htmlUrl,
      previewUrl: htmlUrl,
      screenshotUrl: screenshotUrl
    });

  } catch (error) {
    console.error('Error generating page:', error);
    res.status(500).json({ 
      error: 'Failed to generate page',
      details: error.message 
    });
  }
});

// Endpoint to compare generated page with original screenshot
app.post('/api/compare-page/:pageId', async (req, res) => {
  try {
    const { pageId } = req.params;
    
    // Download files from GCS
    const screenshotFileName = `pages/${pageId}/original.png`;
    const htmlFileName = `pages/${pageId}/index.html`;
    
    const originalBuffer = await gcsService.downloadFile(screenshotFileName);
    const base64Original = originalBuffer.toString('base64');
    
    // Download and read the HTML content
    const htmlBuffer = await gcsService.downloadFile(htmlFileName);
    const htmlContent = htmlBuffer.toString('utf8');
    
    const prompt = `
    Compare this original screenshot with the HTML code that was generated to replicate it.
    
    Analyze and rate the similarity on a scale of 1-10, paying special attention to:
    
    1. LAYOUT ACCURACY:
       - Overall page structure and component arrangement
       - Spacing, margins, and padding consistency
       - Grid/flexbox alignment and distribution
       - Responsive design elements
    
    2. TYPOGRAPHY & FONT FORMATTING:
       - Font family, size, and weight matching
       - Line height and letter spacing
       - Text alignment and justification
       - Heading hierarchy and consistency
       - Text color and contrast accuracy
    
    3. COLOR MATCHING:
       - Background colors and gradients
       - Text colors and readability
       - Button and interactive element colors
       - Border colors and styling
    
    4. ELEMENT POSITIONING:
       - Precise placement of all UI elements
       - Alignment of buttons, inputs, and forms
       - Icon and image positioning
       - Consistent spacing between elements
    
    5. PAGE FORMATTING:
       - Overall page dimensions and proportions
       - Section breaks and content organization
       - Visual hierarchy maintenance
       - Brand consistency and styling
    
    6. DETAILED FORMATTING:
       - Border radius and shadows
       - Input field styling and placeholder text
       - Button hover states and interactions
       - Form validation styling
    
    HTML Code Analysis:
    ${htmlContent.substring(0, 8000)} // Extended for better analysis
    
    Provide a JSON response with detailed scoring:
    {
      "similarity_score": number (1-10),
      "layout_score": number (1-10),
      "color_score": number (1-10),
      "typography_score": number (1-10),
      "positioning_score": number (1-10),
      "formatting_score": number (1-10),
      "font_accuracy_score": number (1-10),
      "feedback": "detailed feedback focusing on typography, formatting, and layout precision",
      "font_issues": ["specific font/typography problems"],
      "formatting_issues": ["specific page formatting problems"],
      "improvements": ["detailed suggestions for typography and formatting fixes"]
    }
    `;
    
    const response = await genAI.models.generateContent({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: base64Original,
                mimeType: 'image/png'
              }
            }
          ]
        }
      ]
    });
    
    const comparison = JSON.parse(response.text);
    
    res.json({
      success: true,
      pageId: pageId,
      comparison: comparison
    });
    
  } catch (error) {
    console.error('Error comparing page:', error);
    res.status(500).json({ 
      error: 'Failed to compare page',
      details: error.message 
    });
  }
});

// Endpoint to list all generated pages
app.get('/api/pages', async (req, res) => {
  try {
    const pages = await gcsService.listFiles('pages/');
    
    // Group files by page ID and create page objects
    const pageMap = new Map();
    
    pages.forEach(file => {
      // Extract pageId from path like 'pages/uuid/index.html'
      const pathParts = file.name.split('/');
      if (pathParts.length >= 3 && pathParts[0] === 'pages') {
        const pageId = pathParts[1];
        if (!pageMap.has(pageId)) {
          pageMap.set(pageId, {
            id: pageId,
            createdAt: file.created
          });
        }
        
        // Add URL for HTML files
        if (pathParts[2] === 'index.html') {
          pageMap.get(pageId).url = file.publicUrl;
          pageMap.get(pageId).previewUrl = file.publicUrl;
        }
        // Add screenshot URL for PNG files  
        if (pathParts[2] === 'original.png') {
          pageMap.get(pageId).screenshotUrl = file.publicUrl;
        }
      }
    });
    
    const pageList = Array.from(pageMap.values())
      .filter(page => page.url) // Only include pages with HTML files
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    res.json({
      success: true,
      pages: pageList
    });
    
  } catch (error) {
    console.error('Error listing pages:', error);
    res.status(500).json({ 
      error: 'Failed to list pages',
      details: error.message 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'webpage-replicator-backend' });
});

// Test Clickthrough integration endpoint
app.post('/api/test-clickthrough', (req, res) => {
  const testHTML = `<!DOCTYPE html>
<html><head><title>Test</title></head>
<body>
<form><input type="email" placeholder="Email">
<button type="submit" class="submit-button">Start my free trial</button>
</form></body></html>`;

  const result = addClickthroughToHTML(testHTML, 'test-clickthrough-id', 'api.in.spotdraft.com');
  
  res.json({
    success: true,
    original: testHTML,
    withClickthrough: result,
    hasClickthrough: result.includes('clickthrough-host')
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log('Make sure to set GEMINI_API_KEY and GCS_BUCKET_NAME environment variables');
});