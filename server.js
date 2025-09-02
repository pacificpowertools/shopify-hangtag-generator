// Shopify Hang Tag Generator App
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const JSZip = require('jszip');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Generate hang tags from uploaded data
app.post('/api/generate-tags', async (req, res) => {
  try {
    const { products, options = {} } = req.body;
    
    if (!products || !Array.isArray(products)) {
      return res.status(400).json({ error: 'Invalid products data' });
    }

    console.log(`Generating ${products.length} hang tags...`);
    
    const zip = new JSZip();
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      console.log(`Processing product ${i + 1}/${products.length}: ${product.sku || product.handle}`);
      
      try {
        const pdfBuffer = await generateHangTagPDF(product, options);
        const filename = `${product.sku || product.handle || `product-${i + 1}`}-hangtag.pdf`;
        zip.file(filename, pdfBuffer);
      } catch (pdfError) {
        console.error(`Error generating PDF for ${product.sku}:`, pdfError);
        // Continue with other products
      }
    }
    
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="hang-tags.zip"');
    res.send(zipBuffer);
    
    console.log('Hang tags generated successfully');
  } catch (error) {
    console.error('Error generating tags:', error);
    res.status(500).json({ error: error.message });
  }
});

// PDF Generation Function
async function generateHangTagPDF(product, options = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ 
        size: [194.4, 262.8], // 2.7" x 3.65" at 72 DPI
        margins: { top: 8, bottom: 8, left: 8, right: 8 }
      });
      
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        resolve(Buffer.concat(buffers));
      });
      doc.on('error', reject);
      
      // Extract product data
      const isRecon = product.tags?.includes('Recon') || 
                     product.tags?.includes('recon') ||
                     product.sku?.endsWith('-R') ||
                     product['Variant SKU']?.endsWith('-R');
                     
      const price = parseFloat(product.price || product['Variant Price'] || 0);
      const comparePrice = parseFloat(product.compare_at_price || product['Variant Compare At Price'] || 0);
      const title = product.title || product.Title || 'Product';
      const vendor = product.vendor || product.Vendor || 'Brand';
      const sku = product.sku || product['Variant SKU'] || '';
      
      // Check for kit/includes
      const bodyHtml = product.body_html || product['Body (HTML)'] || '';
      const includesMatch = bodyHtml.match(/INCLUDES\s*:\s*(.*?)(?:<\/?[^>]*>|$)/i);
      const includesText = includesMatch ? includesMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      
      // Vendor logo area (top left)
      doc.rect(8, 15, 60, 20)
         .fillAndStroke('#e53e3e', '#e53e3e');
      
      doc.fontSize(8)
         .font('Helvetica-Bold')
         .fillColor('white')
         .text(vendor.toUpperCase(), 12, 22, { width: 52, align: 'center' });
      
      // Model number (top right)
      doc.fontSize(10)
         .fillColor('black')
         .font('Helvetica-Bold')
         .text(`Model ${sku}`, 100, 20, { width: 86, align: 'right' });
      
      // Product title
      const titleSize = parseInt(options.titleSize) || 11;
      doc.fontSize(titleSize)
         .font('Helvetica-Bold')
         .fillColor('black')
         .text(title, 12, 45, { 
           width: 170, 
           align: 'center',
           lineGap: 1
         });
      
      // Product image area (placeholder)
      const imageY = 85;
      doc.rect(25, imageY, 144, 80)
         .stroke('#cccccc');
      
      doc.fontSize(8)
         .fillColor('#999999')
         .text('Product Image', 25, imageY + 36, { width: 144, align: 'center' });
      
      // Includes section (if kit product)
      let currentY = 175;
      if (includesText) {
        doc.fontSize(8)
           .font('Helvetica-Bold-Oblique')
           .fillColor('black')
           .text('INCLUDES:', 12, currentY);
        
        currentY += 12;
        
        // Parse includes items
        const includeItems = includesText.split(/[,;]|and\s+/i)
                                        .map(item => item.trim())
                                        .filter(item => item.length > 0)
                                        .slice(0, 4); // Max 4 items to fit
        
        doc.fontSize(7)
           .font('Helvetica');
        
        includeItems.forEach(item => {
          doc.text(`• ${item}`, 12, currentY, { width: 170 });
          currentY += 9;
        });
        
        currentY += 5;
      }
      
      // Price
      const priceSize = parseInt(options.priceSize) || 24;
      const scaledPriceSize = Math.min(priceSize, 28); // Cap for PDF
      
      doc.fontSize(scaledPriceSize)
         .font('Helvetica-Bold')
         .fillColor('black')
         .text(`$${price.toFixed(2)}`, 30, currentY, { width: 134, align: 'center' });
      
      currentY += scaledPriceSize + 2;
      
      // MSRP if applicable
      if (comparePrice > price && comparePrice > 0) {
        doc.fontSize(10)
           .font('Helvetica-Oblique')
           .fillColor('#666666')
           .text(`MSRP $${comparePrice.toFixed(2)}`, 30, currentY, { 
             width: 134, 
             align: 'center',
             strike: true
           });
      }
      
      // Reconditioned bar (if applicable)
      if (isRecon) {
        doc.rect(0, 240, 194.4, 22.8)
           .fillAndStroke('#3182ce', '#3182ce');
        
        doc.fontSize(8)
           .font('Helvetica-Bold')
           .fillColor('white')
           .text('Factory Reconditioned Tool', 8, 248)
           .text(sku, 130, 248);
      }
      
      doc.end();
      
    } catch (error) {
      reject(error);
    }
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`🏷️ Hang Tag Generator running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
