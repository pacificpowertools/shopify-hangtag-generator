// Shopify Hang Tag Generator App - Embedded Shopify App
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const { LATEST_API_VERSION } = require('@shopify/shopify-api');
const PDFDocument = require('pdfkit');
const JSZip = require('jszip');
const path = require('path');

// Import Shopify config and utilities
const { shopifyApi } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');
const sessionStorage = require('./utils/session-storage');
const { verifyAuth } = require('./middleware/auth');

// Validate required environment variables
const requiredEnvVars = ['SHOPIFY_API_KEY', 'SHOPIFY_API_SECRET', 'HOST', 'SCOPES'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.error('Please copy .env.example to .env and fill in the values');
  process.exit(1);
}

// Initialize Shopify API
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES.split(','),
  hostName: process.env.HOST.replace(/https?:\/\//, ''),
  hostScheme: process.env.HOST.startsWith('https') ? 'https' : 'http',
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
  sessionStorage: sessionStorage,
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cookieParser());

// Raw body for webhooks
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

// JSON parsing for other routes
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// ===== SHOPIFY OAUTH ROUTES =====

/**
 * Step 1: Redirect to Shopify OAuth
 */
app.get('/api/auth', async (req, res) => {
  try {
    const shop = req.query.shop;

    if (!shop) {
      return res.status(400).send('Missing shop parameter');
    }

    // Start OAuth flow
    await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(shop, true),
      callbackPath: '/api/auth/callback',
      isOnline: false, // Get offline token for background tasks
      rawRequest: req,
      rawResponse: res,
    });
  } catch (error) {
    console.error('OAuth begin error:', error);
    res.status(500).send('Failed to begin OAuth');
  }
});

/**
 * Step 2: Handle OAuth callback
 */
app.get('/api/auth/callback', async (req, res) => {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const { session } = callback;

    // Store the session
    await sessionStorage.storeSession(session);

    // Register mandatory GDPR webhooks
    await registerWebhooks(session);

    console.log(`✅ App installed successfully for shop: ${session.shop}`);

    // Redirect to app with shop and host params
    const host = req.query.host;
    res.redirect(`/?shop=${session.shop}&host=${host}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send('Failed to complete OAuth');
  }
});

/**
 * Start online (user-based) token flow for API requests
 */
app.get('/api/auth/online', async (req, res) => {
  try {
    await shopify.auth.begin({
      shop: shopify.utils.sanitizeShop(req.query.shop, true),
      callbackPath: '/api/auth/online/callback',
      isOnline: true, // Online token for user-specific requests
      rawRequest: req,
      rawResponse: res,
    });
  } catch (error) {
    console.error('Online OAuth begin error:', error);
    res.status(500).send('Failed to begin online OAuth');
  }
});

/**
 * Handle online OAuth callback
 */
app.get('/api/auth/online/callback', async (req, res) => {
  try {
    const callback = await shopify.auth.callback({
      rawRequest: req,
      rawResponse: res,
    });

    const { session } = callback;
    await sessionStorage.storeSession(session);

    const host = req.query.host;
    res.redirect(`/?shop=${session.shop}&host=${host}`);
  } catch (error) {
    console.error('Online OAuth callback error:', error);
    res.status(500).send('Failed to complete online OAuth');
  }
});

// ===== WEBHOOK HANDLERS =====

/**
 * Register required GDPR webhooks
 */
async function registerWebhooks(session) {
  const webhookRegistrations = [
    {
      path: '/api/webhooks/customers/data_request',
      topic: 'CUSTOMERS_DATA_REQUEST',
      webhookHandler: async (topic, shop, body) => {
        console.log('Customer data request:', { shop, body });
        // Implement customer data retrieval
      },
    },
    {
      path: '/api/webhooks/customers/redact',
      topic: 'CUSTOMERS_REDACT',
      webhookHandler: async (topic, shop, body) => {
        console.log('Customer redact request:', { shop, body });
        // Implement customer data deletion
      },
    },
    {
      path: '/api/webhooks/shop/redact',
      topic: 'SHOP_REDACT',
      webhookHandler: async (topic, shop, body) => {
        console.log('Shop redact request:', { shop, body });
        // Implement shop data deletion
        await sessionStorage.deleteSessions([session.id]);
      },
    },
  ];

  for (const webhook of webhookRegistrations) {
    try {
      const response = await shopify.webhooks.register({
        session,
        topic: webhook.topic,
        path: webhook.path,
        webhookHandler: webhook.webhookHandler,
      });

      if (response.success) {
        console.log(`✅ Registered webhook: ${webhook.topic}`);
      } else {
        console.log(`⚠️ Failed to register webhook: ${webhook.topic}`, response.result);
      }
    } catch (error) {
      console.error(`Error registering webhook ${webhook.topic}:`, error);
    }
  }
}

/**
 * GDPR Webhook endpoints
 */
app.post('/api/webhooks/customers/data_request', async (req, res) => {
  console.log('Received customer data request webhook');
  res.status(200).send('OK');
});

app.post('/api/webhooks/customers/redact', async (req, res) => {
  console.log('Received customer redact webhook');
  res.status(200).send('OK');
});

app.post('/api/webhooks/shop/redact', async (req, res) => {
  console.log('Received shop redact webhook');
  res.status(200).send('OK');
});

// ===== APP ROUTES =====

/**
 * Main app route - serves the embedded app
 */
app.get('/', async (req, res) => {
  const shop = req.query.shop;
  const host = req.query.host;

  if (!shop) {
    return res.status(400).send('Missing shop parameter. Please install the app from your Shopify admin.');
  }

  // Check if we have a session for this shop
  const sessions = await sessionStorage.findSessionsByShop(shop);

  if (sessions.length === 0) {
    // No session found, redirect to OAuth
    return res.redirect(`/api/auth?shop=${shop}`);
  }

  // Serve the app
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    shopifyApiVersion: LATEST_API_VERSION,
  });
});

// ===== PROTECTED API ROUTES =====

/**
 * Fetch products from Shopify
 */
app.get('/api/products', verifyAuth, async (req, res) => {
  try {
    const session = req.shopifySession;
    const client = new shopify.clients.Rest({ session });

    const limit = parseInt(req.query.limit) || 250;
    const allProducts = [];
    let params = { limit };

    // Fetch all products with pagination
    do {
      const response = await client.get({
        path: 'products',
        query: params,
      });

      const products = response.body.products;
      allProducts.push(...products);

      // Check for pagination
      const linkHeader = response.headers.get('link');
      if (linkHeader && linkHeader.includes('rel="next"')) {
        const nextLink = linkHeader.split(',').find(link => link.includes('rel="next"'));
        const pageInfo = new URLSearchParams(nextLink.split('?')[1]).get('page_info');
        params = { limit, page_info: pageInfo };
      } else {
        params = null;
      }
    } while (params);

    console.log(`Fetched ${allProducts.length} products from Shopify`);

    // Transform products to include variant data
    const transformedProducts = [];

    allProducts.forEach(product => {
      product.variants.forEach(variant => {
        transformedProducts.push({
          id: variant.id,
          title: product.title,
          vendor: product.vendor,
          product_type: product.product_type,
          tags: product.tags,
          body_html: product.body_html,
          handle: product.handle,
          image: product.image?.src || product.images?.[0]?.src,
          sku: variant.sku,
          price: variant.price,
          compare_at_price: variant.compare_at_price,
          barcode: variant.barcode,
          inventory_quantity: variant.inventory_quantity,
        });
      });
    });

    res.json({
      products: transformedProducts,
      count: transformedProducts.length
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Generate hang tags from product data
 */
app.post('/api/generate-tags', verifyAuth, async (req, res) => {
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

// ===== PDF GENERATION FUNCTION =====

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

// ===== START SERVER =====

app.listen(PORT, () => {
  console.log('');
  console.log('🏷️  Shopify Hang Tag Generator');
  console.log('================================');
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📍 URL: ${process.env.HOST}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📦 Shopify API Version: ${LATEST_API_VERSION}`);
  console.log('');
  console.log('To install the app:');
  console.log(`👉 Visit: ${process.env.HOST}/api/auth?shop=YOUR_SHOP.myshopify.com`);
  console.log('');
});

module.exports = app;
