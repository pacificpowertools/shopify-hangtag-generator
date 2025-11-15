# Quick Setup Guide

Follow these steps to get your Shopify Hang Tag Generator app running quickly.

## Step 1: Shopify Partner Setup (5 minutes)

1. Go to https://partners.shopify.com/
2. Create a new app: **Apps** > **Create app** > **Create app manually**
3. Configure:
   - Name: "Hang Tag Generator"
   - App URL: `https://YOUR-NGROK-URL.ngrok.io`
   - Redirect URLs:
     - `https://YOUR-NGROK-URL.ngrok.io/api/auth/callback`
     - `https://YOUR-NGROK-URL.ngrok.io/api/auth/online/callback`
   - Embedded: **Yes**
   - Scopes: `read_products`

4. Save your **API Key** and **API Secret**

## Step 2: Local Setup (2 minutes)

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

## Step 3: Configure .env (1 minute)

Edit `.env` and fill in:

```env
SHOPIFY_API_KEY=<paste-your-api-key>
SHOPIFY_API_SECRET=<paste-your-api-secret>
SCOPES=read_products
HOST=https://YOUR-NGROK-URL.ngrok.io
SESSION_SECRET=<generate-random-string>
```

Generate a session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Step 4: Start Development (2 minutes)

```bash
# Terminal 1: Start ngrok
ngrok http 3000

# Copy the ngrok URL (e.g., https://abc123.ngrok.io)
# Update your .env HOST variable with this URL
# Update your Shopify app URLs in Partner dashboard

# Terminal 2: Start the app
npm run dev
```

## Step 5: Install the App (1 minute)

Visit in your browser:
```
https://YOUR-NGROK-URL.ngrok.io/api/auth?shop=YOUR-STORE.myshopify.com
```

Replace:
- `YOUR-NGROK-URL` with your actual ngrok URL (without https://)
- `YOUR-STORE` with your Shopify store name

Click **Install** and you're done!

## Using the App

1. Open the app from your Shopify admin
2. Click "Load Products from Shopify"
3. Apply filters as needed
4. Click "Generate All Hang Tags"
5. Download your ZIP file

## Troubleshooting

**OAuth Error?**
- Make sure HOST in .env matches your ngrok URL exactly
- Ensure redirect URLs in Shopify Partner dashboard are correct

**Products not loading?**
- Check the browser console for errors
- Verify your app has read_products scope
- Make sure your store has products

**Need Help?**
See the full README.md for detailed documentation.
