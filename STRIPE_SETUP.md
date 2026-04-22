# Stripe Checkout Setup for 451studios.com

## What's Been Done

1. **Stripe buttons added** to the main website (`index.html`) for $500 and $750 pilot options
2. **Stripe JavaScript integration** with your live publishable key
3. **Backend server** (`stripe-server.js`) ready to handle checkout sessions
4. **Success/Cancel pages** created for post-payment experience
5. **Package.json** with dependencies

## What You Need to Do

### 1. Create Products in Stripe Dashboard
Go to: https://dashboard.stripe.com/products

Create two products:
- **Starter Automation Sprint ($500)** - One-time payment
- **Starter Automation Sprint ($750)** - One-time payment

Copy the Price IDs (looks like `price_1TNGZjKCitPJBfMM...`)

### 2. Update the Website
In `index.html`, update the `priceIds` object with your actual Price IDs:

```javascript
const priceIds = {
  'price_500': 'YOUR_ACTUAL_500_PRICE_ID',
  'price_750': 'YOUR_ACTUAL_750_PRICE_ID'
};
```

### 3. Deploy the Backend Server
You have options:

**Option A: Vercel/Railway (Recommended)**
- Push this folder to GitHub
- Connect to Vercel/Railway
- Set environment variable: `STRIPE_WRITE_KEY=your_live_secret_key`
- Update website to point to your deployed URL

**Option B: Hostinger Node.js Hosting**
- Upload files to Hostinger
- Install Node.js dependencies: `npm install`
- Set up PM2 to run: `node stripe-server.js`
- Configure domain/subdomain

**Option C: Local Testing**
```bash
cd /home/thewo/.openclaw/workspace/451studios
npm install
STRIPE_WRITE_KEY=your_key node stripe-server.js
```

### 4. Update Website Checkout URLs
In `index.html`, update the fetch call to point to your deployed backend:

```javascript
const response = await fetch('https://your-domain.com/create-checkout-session', {
  // ...
});
```

### 5. Set Up Webhooks (Optional but Recommended)
In Stripe Dashboard → Developers → Webhooks
- Add endpoint: `https://your-domain.com/webhook`
- Select events: `checkout.session.completed`, `payment_intent.succeeded`
- Copy signing secret and set as `STRIPE_WEBHOOK_SECRET` environment variable

## Environment Variables Needed

```
STRIPE_WRITE_KEY=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
STRIPE_WEBHOOK_SECRET=whsec_... (optional)
PORT=3000 (or your hosting provider's port)
```

## Testing

1. Use Stripe test mode keys first
2. Test with card: `4242 4242 4242 4242`
3. Verify success/cancel flows work
4. Switch to live mode when ready

## Next Steps After Payment

When a payment succeeds:
1. Stripe sends webhook to `/webhook`
2. You can:
   - Send confirmation email (using SendGrid)
   - Create customer record in your CRM
   - Trigger onboarding workflow
   - Schedule discovery call automatically

## Files Created

- `index.html` - Updated with Stripe buttons
- `stripe-server.js` - Backend server
- `success.html` - Payment success page
- `cancel.html` - Payment cancelled page
- `package.json` - Node.js dependencies
- `STRIPE_SETUP.md` - This guide

## Support

Email: max451studios@gmail.com
Stripe Dashboard: https://dashboard.stripe.com