require('dotenv').config();
const express = require('express');
const cors = require('cors');
const PDFDocument = require('pdfkit');
const JSZip = require('jszip');
const path = require('path');
const QRCode = require('qrcode');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const app = express();
const PORT = process.env.PORT || 3000;

// 3" × 4" at 300 DPI
const TAG_W = 900;
const TAG_H = 1200;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Shopify product search proxy
app.get('/api/shopify/search', async (req, res) => {
  const { q, limit = 20 } = req.query;
  const domain = req.headers['x-shopify-domain'] || process.env.SHOPIFY_DOMAIN;
  const token = req.headers['x-shopify-token'] || process.env.SHOPIFY_ADMIN_TOKEN;

  if (!token || !domain) {
    return res.status(401).json({
      error: 'Shopify credentials not configured. Open Settings and enter your Shopify domain and Admin API token.'
    });
  }

  try {
    const params = new URLSearchParams({
      title: q || '',
      limit: String(limit),
      fields: 'id,title,handle,vendor,tags,variants,images,body_html'
    });
    const url = `https://${domain}/admin/api/2024-01/products.json?${params}`;
    const response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token }
    });
    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
    }
    res.json(await response.json());
  } catch (error) {
    console.error('Shopify search error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Generate single hang tag
app.post('/api/generate-tag', async (req, res) => {
  try {
    const { product, format = 'pdf' } = req.body;
    const canvas = await renderHangTag(product);
    const filename = sanitizeFilename(product.sku || product.handle || 'hangtag');

    if (format === 'png') {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.png"`);
      res.send(canvas.toBuffer('image/png'));
    } else if (format === 'both') {
      const zip = new JSZip();
      zip.file(`${filename}.png`, canvas.toBuffer('image/png'));
      zip.file(`${filename}.pdf`, await canvasToPdf(canvas));
      const buf = await zip.generateAsync({ type: 'nodebuffer' });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}-hangtag.zip"`);
      res.send(buf);
    } else {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
      res.send(await canvasToPdf(canvas));
    }
  } catch (error) {
    console.error('Error generating tag:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate batch hang tags as ZIP
app.post('/api/generate-tags', async (req, res) => {
  try {
    const { products, format = 'pdf' } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ error: 'No products provided' });
    }

    const zip = new JSZip();
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      try {
        const canvas = await renderHangTag(product);
        const filename = sanitizeFilename(product.sku || product.handle || `product-${i + 1}`);
        if (format === 'png' || format === 'both') {
          zip.file(`${filename}.png`, canvas.toBuffer('image/png'));
        }
        if (format === 'pdf' || format === 'both') {
          zip.file(`${filename}.pdf`, await canvasToPdf(canvas));
        }
      } catch (err) {
        console.error(`Error generating tag ${i + 1}:`, err.message);
      }
    }

    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="hang-tags.zip"');
    res.send(buf);
  } catch (error) {
    console.error('Error generating batch:', error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Canvas rendering ─────────────────────────────────────────────────────────

async function renderHangTag(product) {
  const canvas = createCanvas(TAG_W, TAG_H);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, TAG_W, TAG_H);

  const {
    title = '',
    vendor = 'makita',
    sku = '',
    price = 0,
    compare_at_price = 0,
    image_url = '',
    handle = '',
    tags = '',
    includes_list = [],
    top_banner = '',
    show_recon_banner = false
  } = product;

  const isRecon =
    show_recon_banner ||
    (typeof tags === 'string' && tags.toLowerCase().includes('recon')) ||
    String(sku).endsWith('-R');

  const priceNum = parseFloat(price) || 0;
  const compareNum = parseFloat(compare_at_price) || 0;
  const hasMSRP = compareNum > priceNum && compareNum > 0;
  const storeUrl = process.env.STORE_URL || 'https://pacificpowertools.com';

  let y = 0;

  // --- TOP ACCENT BANNER ---
  if (top_banner) {
    ctx.fillStyle = '#FFE000';
    ctx.fillRect(0, 0, TAG_W, 62);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(top_banner, TAG_W / 2, 31);
    ctx.textBaseline = 'alphabetic';
    y = 72;
  } else {
    y = 24;
  }

  // --- HEADER: vendor logo (left) + model# (right) ---
  const logoX = 22, logoY = y, logoW = 200, logoH = 64;
  drawVendorLogo(ctx, vendor, logoX, logoY, logoW, logoH);

  if (sku) {
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`Model# ${sku}`, TAG_W - 22, logoY + 46);
  }
  y = logoY + logoH + 18;

  // Divider
  ctx.strokeStyle = '#dddddd';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, y);
  ctx.lineTo(TAG_W - 20, y);
  ctx.stroke();
  y += 22;

  // --- TITLE ---
  ctx.fillStyle = '#0a0a0a';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const titleLines = wrapText(ctx, title, TAG_W - 60);
  for (const line of titleLines) {
    ctx.fillText(line, TAG_W / 2, y + 52);
    y += 60;
  }
  y += 16;

  // --- PRODUCT IMAGE ---
  const imgMaxH = calcImageHeight(includes_list, hasMSRP, isRecon, titleLines.length);
  if (image_url) {
    try {
      const img = await loadImage(image_url);
      const aspect = img.width / img.height;
      const maxW = 700, maxH = imgMaxH;
      let dw = maxW, dh = maxW / aspect;
      if (dh > maxH) { dh = maxH; dw = maxH * aspect; }
      ctx.drawImage(img, (TAG_W - dw) / 2, y, dw, dh);
      y += dh + 18;
    } catch {
      y += 16;
    }
  } else {
    y += 16;
  }

  // --- INCLUDES LIST ---
  if (Array.isArray(includes_list) && includes_list.length > 0) {
    ctx.fillStyle = '#111111';
    ctx.font = 'italic bold 28px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    y += 10;
    ctx.fillText('*INCLUDES :', 30, y + 26);
    y += 36;
    ctx.font = '26px sans-serif';
    for (const item of includes_list.slice(0, 6)) {
      ctx.fillText(`• ${item}`, 54, y + 26);
      y += 34;
    }
    y += 12;
  }

  // --- PRICE ---
  const [dollarPart, centPart] = priceNum.toFixed(2).split('.');
  const dollarSize = 155, signSize = 68, centSize = 78;

  ctx.font = `bold italic ${dollarSize}px sans-serif`;
  const dollarW = ctx.measureText(dollarPart).width;
  ctx.font = `bold italic ${signSize}px sans-serif`;
  const signW = ctx.measureText('$').width;
  ctx.font = `bold italic ${centSize}px sans-serif`;
  const centW = ctx.measureText(centPart).width;

  const totalPriceW = signW + dollarW + centW + 8;
  const priceX = (TAG_W - totalPriceW) / 2;
  const priceBaseY = y + dollarSize + 10;

  ctx.fillStyle = '#0a0a0a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ctx.font = `bold italic ${signSize}px sans-serif`;
  ctx.fillText('$', priceX, priceBaseY);

  ctx.font = `bold italic ${dollarSize}px sans-serif`;
  ctx.fillText(dollarPart, priceX + signW, priceBaseY);

  ctx.font = `bold italic ${centSize}px sans-serif`;
  ctx.fillText(centPart, priceX + signW + dollarW + 8, priceBaseY - dollarSize + centSize + 12);

  y = priceBaseY + 22;

  // --- MSRP with strikethrough ---
  if (hasMSRP) {
    const msrpText = `MSRP $${compareNum.toFixed(2)}`;
    ctx.fillStyle = '#555555';
    ctx.font = 'bold italic 38px sans-serif';
    ctx.textAlign = 'center';
    const msrpW = ctx.measureText(msrpText).width;
    ctx.fillText(msrpText, TAG_W / 2, y + 36);
    ctx.strokeStyle = '#555555';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(TAG_W / 2 - msrpW / 2, y + 20);
    ctx.lineTo(TAG_W / 2 + msrpW / 2, y + 20);
    ctx.stroke();
    y += 60;
  }

  // --- QR CODE ---
  const qrUrl = handle ? `${storeUrl}/products/${handle}` : storeUrl;
  try {
    const qrBuf = await QRCode.toBuffer(qrUrl, { width: 176, margin: 1, errorCorrectionLevel: 'M' });
    const qrImg = await loadImage(qrBuf);
    const qrSize = 176;
    ctx.drawImage(qrImg, TAG_W - qrSize - 18, TAG_H - qrSize - (isRecon ? 82 : 18), qrSize, qrSize);
  } catch (err) {
    console.warn('QR code failed:', err.message);
  }

  // --- BOTTOM RECON BANNER ---
  if (isRecon) {
    ctx.fillStyle = '#1565c0';
    ctx.fillRect(0, TAG_H - 72, TAG_W, 72);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Factory Reconditioned Tool', 22, TAG_H - 26);
    ctx.textAlign = 'right';
    ctx.fillText(sku, TAG_W - 22, TAG_H - 26);
  }

  return canvas;
}

function drawVendorLogo(ctx, vendor, x, y, w, h) {
  const v = (vendor || '').toLowerCase();

  if (v.includes('makita')) {
    const r = 8;
    ctx.fillStyle = '#E8202D';
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold italic ${Math.floor(h * 0.52)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('makita', x + w / 2, y + h / 2);
  } else {
    ctx.fillStyle = '#2d2d2d';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.floor(h * 0.42)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(vendor.substring(0, 14).toUpperCase(), x + w / 2, y + h / 2);
  }
  ctx.textBaseline = 'alphabetic';
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function calcImageHeight(includesList, hasMSRP, isRecon, titleLineCount) {
  const headerH = 64 + 18 + 2 + 22;
  const titleH = titleLineCount * 60 + 16;
  const includesH = includesList?.length > 0 ? (10 + 36 + Math.min(includesList.length, 6) * 34 + 12) : 16;
  const priceH = 155 + 10 + 22;
  const msrpH = hasMSRP ? 60 : 0;
  const qrH = 176 + 18;
  const bannerH = isRecon ? 72 : 0;
  const padding = 50;
  const used = headerH + titleH + includesH + priceH + msrpH + qrH + bannerH + padding;
  return Math.max(200, Math.min(460, TAG_H - used));
}

async function canvasToPdf(canvas) {
  return new Promise((resolve, reject) => {
    const pngBuf = canvas.toBuffer('image/png');
    // 3" × 4" in points (72pt per inch)
    const doc = new PDFDocument({ size: [216, 288], margin: 0 });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.image(pngBuf, 0, 0, { width: 216, height: 288 });
    doc.end();
  });
}

function sanitizeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 60);
}

app.listen(PORT, () => {
  console.log(`Hang Tag Generator running on http://localhost:${PORT}`);
});
