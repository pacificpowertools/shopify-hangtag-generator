const { shopifyApi, LATEST_API_VERSION } = require('@shopify/shopify-api');
require('@shopify/shopify-api/adapters/node');

// Initialize Shopify API
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: process.env.SCOPES?.split(',') || ['read_products'],
  hostName: process.env.HOST?.replace(/https?:\/\//, '') || 'localhost:3000',
  hostScheme: process.env.HOST?.startsWith('https') ? 'https' : 'http',
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
  // Session storage will be added separately
});

module.exports = shopify;
