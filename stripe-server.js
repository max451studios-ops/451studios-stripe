// Simple Stripe checkout server for 451studios.com
// Run with: node stripe-server.js

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_WRITE_KEY || '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');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('.')); // Serve HTML files from current directory

// Create checkout session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { priceId, successUrl, cancelUrl } = req.body;
    
    // Validate priceId exists in your products
    const validPriceIds = [
      'price_1TNGZjKCitPJBfMM...', // $500 product
      'price_1TNGZjKCitPJBfMM...'  // $750 product
    ];
    
    if (!validPriceIds.includes(priceId)) {
      return res.status(400).json({ error: 'Invalid price ID' });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl || `${req.headers.origin}/success.html`,
      cancel_url: cancelUrl || `${req.headers.origin}/cancel.html`,
      metadata: {
        product: 'Starter Automation Sprint',
        price: priceId.includes('500') ? '500' : '750'
      }
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error('Stripe error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Webhook handler for Stripe events (optional)
app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || 'whsec_...'
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('Payment succeeded:', session.id);
      // Here you can:
      // - Send confirmation email
      // - Create customer record
      // - Trigger onboarding workflow
      break;
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('PaymentIntent was successful:', paymentIntent.id);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

// Success and cancel pages
app.get('/success', (req, res) => {
  res.sendFile(__dirname + '/success.html');
});

app.get('/cancel', (req, res) => {
  res.sendFile(__dirname + '/cancel.html');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Stripe server running on port ${PORT}`);
  console.log(`Stripe key: ${process.env.STRIPE_WRITE_KEY ? 'Loaded' : 'Missing'}`);
});