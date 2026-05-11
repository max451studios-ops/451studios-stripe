# 451 Studios Tools — Deployment Guide

All tools live in `451studios/tools/` and are served by `stripe-server.js`.

## Files to Upload to Hostinger

Upload the entire `tools/` directory to your server so they're accessible at:
- 451studios.com/tools/
- 451studios.com/tools/payment-link.html
- 451studios.com/tools/review-response.html
- 451studios.com/tools/lead-capture.html
- 451studios.com/tools/payment-link-app.html
- 451studios.com/tools/review-response-app.html
- 451studios.com/tools/lead-capture-app.html

## Backend (stripe-server.js)

The `stripe-server.js` file now has these additional endpoints:

### POST /api/create-payment-link
Generates a Stripe Checkout session for one-time payments.
Body: `{ businessName, customerName, amount, description }`
Returns: `{ url, id, amount }`

### POST /api/generate-review-response (single tone)
Generates one review response.
Body: `{ review, rating, businessName, responseType }`
Returns: `{ response, type }`

### POST /api/generate-all-responses (all 3 tones in parallel)
Generates professional, friendly, and short responses at once.
Body: `{ review, rating, businessName }`
Returns: `{ responses: { professional, friendly, short } }`

### GET /api/social-proof/notifications
Returns a random social proof notification: `{ city, product, time }`

## Running

```bash
cd /home/thewo/.openclaw/workspace/451studios
node stripe-server.js
```

The server serves static files from the current directory AND handles all API endpoints. In production, the 451studios.com domain must proxy API calls to this server.

## API Security Note
- The Review Response AI now calls a server-side proxy (DeepSeek key stays on the server)
- The Payment Link tool creates Stripe sessions server-side (Stripe restricted key stays on the server)
- No API keys are exposed to end users
