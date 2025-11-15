# Shopify Hang Tag Generator

A fully integrated Shopify app that generates professional PDF hang tags for your products in bulk.

## Features

- **Seamless Shopify Integration**: Embedded app experience with OAuth authentication
- **Direct Product Fetching**: Load products directly from your Shopify store
- **Bulk PDF Generation**: Generate hang tags for hundreds of products at once
- **Advanced Filtering**: Filter by vendor, reconditioned products, kits, or sale pricing
- **Design Customization**: Adjust fonts and sizing to match your brand
- **Special Product Support**: Automatic detection of reconditioned products and kit bundles
- **Professional Output**: Download all hang tags as a ZIP file

## Architecture

```
shopify-hangtag-generator/
├── server.js                 # Main Express server with Shopify OAuth
├── package.json              # Dependencies and scripts
├── .env.example              # Environment variables template
├── public/
│   └── index.html           # Embedded app frontend
├── utils/
│   ├── shopify-config.js    # Shopify API configuration
│   └── session-storage.js   # In-memory session storage
└── middleware/
    └── auth.js              # Authentication middleware
```

## Prerequisites

- Node.js 18.x or higher
- A Shopify Partner account
- ngrok or similar tunneling service (for development)

## Setup Instructions

### 1. Create a Shopify App

1. Go to [Shopify Partners](https://partners.shopify.com/)
2. Navigate to **Apps** > **Create app** > **Create app manually**
3. Fill in your app details:
   - **App name**: Hang Tag Generator
   - **App URL**: Your ngrok URL (e.g., `https://abc123.ngrok.io`)
   - **Allowed redirection URL(s)**: `https://abc123.ngrok.io/api/auth/callback` and `https://abc123.ngrok.io/api/auth/online/callback`

4. Go to **Configuration** and set:
   - **Embedded app**: Enable
   - **App scopes**: `read_products`

5. Note your **API key** and **API secret**

### 2. Clone and Install

```bash
# Clone the repository
git clone <your-repo-url>
cd shopify-hangtag-generator

# Install dependencies
npm install
```

### 3. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env
```

Edit `.env` with your values:

```env
SHOPIFY_API_KEY=your_api_key_here
SHOPIFY_API_SECRET=your_api_secret_here
SCOPES=read_products
HOST=https://your-ngrok-url.ngrok.io
PORT=3000
NODE_ENV=development
SESSION_SECRET=your_random_secret_here
```

**Important**:
- Replace `your_api_key_here` and `your_api_secret_here` with values from your Shopify app
- Replace `https://your-ngrok-url.ngrok.io` with your actual ngrok URL
- Generate a random string for `SESSION_SECRET` (e.g., `openssl rand -base64 32`)

### 4. Start Development Server

#### Option A: Using ngrok separately

```bash
# Terminal 1: Start ngrok
ngrok http 3000

# Terminal 2: Start the app
npm run dev
```

#### Option B: Using npm scripts

```bash
# Start both ngrok and the server
npm run dev
```

### 5. Install the App

1. Visit: `https://your-ngrok-url.ngrok.io/api/auth?shop=YOUR_STORE.myshopify.com`
2. Replace `YOUR_STORE` with your actual Shopify store name
3. Complete the OAuth flow
4. The app will be embedded in your Shopify admin

### 6. Use the App

1. In your Shopify admin, find the app in **Apps**
2. Click **Load Products from Shopify** to fetch your products
3. Use filters to select which products to generate tags for:
   - Filter by vendor
   - Include/exclude reconditioned products
   - Include/exclude kit products
   - Show only products with sale pricing
4. Customize the design (font, title size, price size)
5. Click **Generate All Hang Tags**
6. Download the ZIP file containing all PDFs

## API Endpoints

### Authentication

- `GET /api/auth` - Start OAuth flow
- `GET /api/auth/callback` - OAuth callback (offline token)
- `GET /api/auth/online` - Start online OAuth flow
- `GET /api/auth/online/callback` - Online OAuth callback

### App Routes

- `GET /` - Main app (embedded)
- `GET /api/health` - Health check endpoint

### Protected Routes (Require Authentication)

- `GET /api/products` - Fetch all products from Shopify
- `POST /api/generate-tags` - Generate hang tag PDFs

### Webhooks (GDPR Compliance)

- `POST /api/webhooks/customers/data_request` - Customer data request
- `POST /api/webhooks/customers/redact` - Customer data deletion
- `POST /api/webhooks/shop/redact` - Shop data deletion

## Hang Tag Specifications

- **Size**: 2.7" x 3.65" (194.4 x 262.8 pt at 72 DPI)
- **Format**: PDF
- **Includes**:
  - Vendor logo area
  - Product SKU/Model number
  - Product title
  - Product image placeholder
  - Kit includes (if applicable)
  - Price (with MSRP if on sale)
  - Reconditioned indicator (if applicable)

## Production Deployment

### Database Session Storage

For production, replace the in-memory session storage with a database:

```javascript
// utils/session-storage.js
// Implement using PostgreSQL, MySQL, or Redis
// See Shopify docs: https://shopify.dev/docs/api/session-storage
```

### Recommended Services

- **Hosting**: Railway, Heroku, DigitalOcean, AWS
- **Database**: PostgreSQL (Railway, Supabase), Redis (Upstash)
- **Environment**: Set all `.env` variables in your hosting platform

### Environment Variables for Production

```env
SHOPIFY_API_KEY=your_production_api_key
SHOPIFY_API_SECRET=your_production_api_secret
SCOPES=read_products
HOST=https://your-production-domain.com
PORT=3000
NODE_ENV=production
SESSION_SECRET=strong_random_secret
DATABASE_URL=your_database_connection_string  # Optional
```

## Troubleshooting

### OAuth Errors

- Ensure your `HOST` in `.env` matches your ngrok URL exactly (including `https://`)
- Verify redirect URLs in Shopify Partner dashboard match your callback routes
- Check that your API key and secret are correct

### Session Not Found

- Make sure cookies are enabled
- For production, implement database session storage
- Clear browser cookies and reinstall the app

### Product Loading Issues

- Verify the app has `read_products` scope
- Check that the store has products
- Look for errors in server console

### PDF Generation Errors

- Ensure all product data is valid (prices, SKUs, etc.)
- Check server logs for specific error messages
- Verify PDFKit is installed correctly

## Development

```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Start production server
npm start
```

## Tech Stack

- **Backend**: Node.js, Express.js
- **Shopify Integration**: @shopify/shopify-api v9
- **PDF Generation**: PDFKit
- **File Compression**: JSZip
- **Frontend**: Vanilla JavaScript, Shopify App Bridge

## License

MIT

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review Shopify's [app development docs](https://shopify.dev/docs/apps)
3. Open an issue in this repository

## Contributing

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

---

Made with ❤️ for Shopify merchants
