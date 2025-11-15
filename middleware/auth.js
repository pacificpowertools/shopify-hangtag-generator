const shopify = require('../utils/shopify-config');

/**
 * Middleware to verify that the request is from an authenticated Shopify session
 */
async function verifyAuth(req, res, next) {
  try {
    const sessionId = await shopify.session.getCurrentId({
      isOnline: true,
      rawRequest: req,
      rawResponse: res,
    });

    if (!sessionId) {
      return res.status(401).json({ error: 'Unauthorized - No session found' });
    }

    // Load session from storage
    const session = await shopify.config.sessionStorage.loadSession(sessionId);

    if (!session || !session.accessToken) {
      return res.status(401).json({ error: 'Unauthorized - Invalid session' });
    }

    // Check if session is still valid
    if (session.expires && session.expires < new Date()) {
      return res.status(401).json({ error: 'Unauthorized - Session expired' });
    }

    // Attach session to request for use in routes
    req.shopifySession = session;
    next();
  } catch (error) {
    console.error('Auth verification error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Middleware to verify webhook requests from Shopify
 */
async function verifyWebhook(req, res, next) {
  try {
    const valid = await shopify.webhooks.validate({
      rawBody: req.body,
      rawRequest: req,
      rawResponse: res,
    });

    if (!valid) {
      return res.status(401).json({ error: 'Unauthorized - Invalid webhook' });
    }

    next();
  } catch (error) {
    console.error('Webhook verification error:', error);
    return res.status(500).json({ error: 'Webhook verification error' });
  }
}

module.exports = {
  verifyAuth,
  verifyWebhook,
};
