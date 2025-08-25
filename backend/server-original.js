import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), '..', 'generated-pages')));

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
      console.log(`Found ${matches.length} existing terms elements (pattern ${index + 1}):`, matches);
      html = html.replace(pattern, '<!-- Existing terms element removed - replaced by SpotDraft Clickthrough -->');
      removedCount += matches.length;
    }
  });
  
  // Additional cleanup: Remove empty labels, divs, or paragraphs that might be left behind
  html = html.replace(/<(label|div|p)[^>]*>\s*<!--[^>]*-->\s*<\/\1>/gi, '');
  html = html.replace(/<!--[^>]*-->\s*<!--[^>]*-->/gi, '<!-- Multiple terms elements removed -->');
  
  console.log(`Removed ${removedCount} existing terms/conditions elements`);
  
  return html;
}

// Function to remove image references and replace with styled elements
function removeImageReferences(html) {
  console.log('Scanning for image references to remove...');
  
  let removedCount = 0;
  
  // Remove all <img> tags and replace with styled placeholders
  html = html.replace(/<img[^>]*>/gi, (match) => {
    removedCount++;
    
    // Extract alt text if available for replacement text
    const altMatch = match.match(/alt\s*=\s*["']([^"']*)["']/i);
    const altText = altMatch ? altMatch[1] : 'Image';
    
    // Extract any classes for styling context
    const classMatch = match.match(/class\s*=\s*["']([^"']*)["']/i);
    const classes = classMatch ? classMatch[1] : '';
    
    // Determine replacement based on context
    if (classes.includes('logo') || altText.toLowerCase().includes('logo')) {
      // Replace logos with styled text
      return `<div class="logo-placeholder" style="display: inline-flex; align-items: center; font-weight: bold; color: #2c3e50; padding: 10px; border: 2px solid #3498db; border-radius: 5px; background: linear-gradient(45deg, #f8f9fa, #e9ecef);">${altText}</div>`;
    } else if (classes.includes('icon') || altText.toLowerCase().includes('icon')) {
      // Replace icons with CSS symbols
      return `<div class="icon-placeholder" style="display: inline-block; width: 24px; height: 24px; background: #3498db; border-radius: 50%; text-align: center; line-height: 24px; color: white; font-size: 12px;">●</div>`;
    } else {
      // Replace other images with colored placeholders
      return `<div class="image-placeholder" style="display: block; width: 100%; max-width: 300px; height: 150px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: 500;">${altText}</div>`;
    }
  });
  
  // Remove any background-image references in CSS (they would be broken)
  html = html.replace(/background-image\s*:\s*url\([^)]*\)\s*;?/gi, '');
  
  // Remove any references to image files in CSS
  html = html.replace(/url\(['"]?[^'"]*\.(jpg|jpeg|png|gif|svg|webp)['"]?\)/gi, '');
  
  console.log(`Removed ${removedCount} image references and replaced with styled elements`);
  
  return html;
}

// Function to add Clickthrough integration to generated HTML
function addClickthroughToHTML(html, clickthroughId, clusterId) {
  try {
    console.log('Adding Clickthrough integration...', { clickthroughId, clusterId });
    
    // STEP 1: Remove existing terms/conditions elements to avoid duplicates
    html = removeExistingTermsElements(html);
    
    // STEP 2: Add SDK script to <head>
    const sdkScript = `<script type="module" src="https://sdk.spotdraft.com/clickwrap/v1/sdk.js"></script>`;
    html = html.replace('</head>', `  ${sdkScript}\n</head>`);
    
    // STEP 3: Find CTA button patterns and add Clickthrough div above them
    const ctaPatterns = [
      /(<button[^>]*type\s*=\s*["']submit["'][^>]*>)/gi,
      /(<button[^>]*class\s*=\s*["'][^"']*(?:submit|cta|signup|register|join|trial)[^"']*["'][^>]*>)/gi,
      /(<input[^>]*type\s*=\s*["']submit["'][^>]*\/?>)/gi,
      /(<button[^>]*>[^<]*(?:submit|sign.up|register|join|continue|get.started|start.*trial|free.trial)[^<]*<\/button>)/gi,
      /(<button[^>]*class\s*=\s*["']submit-button["'][^>]*>.*?<\/button>)/gi
    ];
    
    let clickthroughAdded = false;
    
    for (const pattern of ctaPatterns) {
      if (html.match(pattern) && !clickthroughAdded) {
        console.log('Found CTA pattern match, adding Clickthrough div');
        html = html.replace(pattern, (match) => {
          clickthroughAdded = true;
          return `    <!-- SpotDraft Clickthrough Integration -->
    <div id="clickthrough-host" style="margin: 15px 0; padding: 10px 0;"></div>
    
    ${match}`;
        });
        break;
      }
    }
    
    console.log('Clickthrough added:', clickthroughAdded);
    
    // Fallback: If no CTA found, add before the last closing form tag or div
    if (!clickthroughAdded) {
      const fallbackPatterns = [
        /(.*<\/form>)/gi,
        /(.*<\/div>\s*<\/body>)/gi
      ];
      
      for (const pattern of fallbackPatterns) {
        if (html.match(pattern)) {
          html = html.replace(pattern, (match) => {
            return match.replace(/(<\/(?:form|div)>)/, `    <!-- SpotDraft Clickthrough Integration -->
    <div id="clickthrough-host" style="margin: 15px 0; padding: 10px 0;"></div>
    
    $1`);
          });
          clickthroughAdded = true;
          break;
        }
      }
    }
    
    // 3. Add Clickthrough JavaScript before </body> - EXACT implementation per documentation
    const clickthroughJS = `
  <script>
  window.addEventListener("sdClickthroughLoaded", function () {
      const clickthrough = new SdClickthrough({
          clickwrapId: "${clickthroughId}",
          hostLocationDomId: "clickthrough-host",
          baseUrl: "https://${clusterId}/"
      });
      clickthrough.init();
      
      // Handle form submission with Clickthrough
      const submitBtn = document.querySelector('[type="submit"], button[type="submit"]') ||
                       document.querySelector('button');
      const form = document.querySelector('form') || submitBtn?.closest('form');
      
      if (submitBtn) {
          submitBtn.addEventListener('click', function(e) {
              e.preventDefault();
              
              // Extract user data for payload
              const userEmail = document.querySelector('[type="email"]')?.value || 
                              document.querySelector('[name*="email" i]')?.value || 
                              document.querySelector('[placeholder*="email" i]')?.value || 'user@example.com';
              
              const firstName = document.querySelector('[name*="first" i], [placeholder*="first" i]')?.value || '';
              const lastName = document.querySelector('[name*="last" i], [placeholder*="last" i]')?.value || '';
              
              // Create payload as per documentation
              const payload = {
                  user_identifier: userEmail,
                  first_name: firstName,
                  last_name: lastName,
                  user_email: userEmail
              };
              
              // Submit Clickthrough contract
              clickthrough.submit(payload).then(contractData => {
                  console.log('Clickthrough contract created:', contractData);
                  alert('Terms accepted! Form submitted successfully.');
                  
                  // Continue with original form submission
                  if (form) {
                      form.submit();
                  }
              }).catch(error => {
                  console.error('Clickthrough error:', error);
                  alert('Please accept the terms and conditions to continue.');
              });
          });
      }
  });
  </script>`;
    
    html = html.replace('</body>', `${clickthroughJS}\n</body>`);
    
    return html;
  } catch (error) {
    console.error('Error adding Clickthrough to HTML:', error);
    return html; // Return original HTML if processing fails
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
    
    SPECIAL INSTRUCTION FOR CLICKTHROUGH INTEGRATION:
    - If the screenshot contains checkboxes, "I agree to terms", "Terms and Conditions", or privacy policy acceptance elements, DO NOT replicate them
    - Skip any terms/conditions/privacy policy checkboxes or acceptance UI elements
    - Focus on replicating the form fields and layout, but omit terms acceptance elements
    - The terms acceptance will be handled by a separate integration system
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
    
    // Create directory for this page
    const pageDir = path.join(process.cwd(), '..', 'generated-pages', pageId);
    await fs.mkdir(pageDir, { recursive: true });
    
    // Save the generated HTML
    const htmlPath = path.join(pageDir, 'index.html');
    await fs.writeFile(htmlPath, generatedHTML);
    
    // Save the original screenshot for comparison
    const screenshotPath = path.join(pageDir, 'original.png');
    await fs.writeFile(screenshotPath, screenshotBuffer);
    
    res.json({
      success: true,
      pageId: pageId,
      url: `http://localhost:${PORT}/${pageId}`,
      previewUrl: `http://localhost:${PORT}/${pageId}/index.html`
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
    const pageDir = path.join(process.cwd(), '..', 'generated-pages', pageId);
    
    // Read the original screenshot
    const originalPath = path.join(pageDir, 'original.png');
    const originalBuffer = await fs.readFile(originalPath);
    const base64Original = originalBuffer.toString('base64');
    
    // For comparison, we'll need a screenshot of the generated page
    // This would typically be done with a headless browser like Puppeteer
    // For now, we'll analyze based on the HTML structure
    
    const htmlPath = path.join(pageDir, 'index.html');
    const htmlContent = await fs.readFile(htmlPath, 'utf8');
    
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
    const pagesDir = path.join(process.cwd(), '..', 'generated-pages');
    const pages = await fs.readdir(pagesDir);
    
    const pageList = await Promise.all(
      pages.map(async (pageId) => {
        try {
          const pageDir = path.join(pagesDir, pageId);
          const stats = await fs.stat(pageDir);
          return {
            id: pageId,
            url: `http://localhost:${PORT}/${pageId}`,
            createdAt: stats.birthtime
          };
        } catch (error) {
          return null;
        }
      })
    );
    
    res.json({
      success: true,
      pages: pageList.filter(page => page !== null)
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
  console.log('Make sure to set GEMINI_API_KEY environment variable');
});