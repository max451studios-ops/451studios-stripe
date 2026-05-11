// Simple Stripe checkout server for 451studios.com
// Run with: node stripe-server.js

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_WRITE_KEY);
const app = express();
const PORT = process.env.PORT || 3000;

// CORS middleware - allow requests from 451studios.com
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://451studios.com',
    'https://www.451studios.com',
    'http://localhost:3000',
    'http://localhost:8000'
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Middleware
app.use(express.json());
app.use(express.static('.')); // Serve HTML files from current directory


// --- Social Proof Widget API ---
// Get demo notification data for the social proof widget
app.get('/api/social-proof/notifications', (req, res) => {
  const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'Austin', 'Miami', 'Atlanta', 'Denver', 'Seattle', 'Portland', 'Nashville', 'Charlotte', 'Orlando', 'Tampa', 'Raleigh'];
  const products = ['Pro Package', 'Starter Plan', 'Premium Course', 'Consulting Call', 'Tool Bundle', 'Business Kit', 'Growth Package', 'Strategy Session'];
  
  const notif = {
    city: cities[Math.floor(Math.random() * cities.length)],
    product: products[Math.floor(Math.random() * products.length)],
    time: 'just now'
  };
  
  res.json(notif);
});

// Create checkout session
app.post('/create-checkout-session', async (req, res) => {
  try {
    const { priceId } = req.body;
    
    // Validate priceId exists in your products
    const validPriceIds = [
      process.env.STRIPE_PRICE_500, // $500 product
      process.env.STRIPE_PRICE_750  // $750 product
    ].filter(Boolean); // Remove empty values if env vars not set
    
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
      success_url: 'https://451studios.com/success.html',
      cancel_url: 'https://451studios.com/cancel.html',
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
      process.env.STRIPE_WEBHOOK_SECRET
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

// --- Payment Link Generator API ---
app.post('/api/create-payment-link', async (req, res) => {
  try {
    const { businessName, customerName, amount, description } = req.body;
    
    if (!businessName || !customerName || !amount) {
      return res.status(400).json({ error: 'Business name, customer name, and amount are required' });
    }
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${businessName} — ${description || 'Payment'}`,
            description: `Invoice for ${customerName}`,
          },
          unit_amount: Math.round(parseFloat(amount) * 100), // Convert dollars to cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://451studios.com/success.html',
      cancel_url: 'https://451studios.com/tools/payment-link-app.html',
      metadata: {
        businessName,
        customerName,
        description: description || ''
      }
    });

    res.json({ 
      url: session.url,
      id: session.id,
      amount: parseFloat(amount)
    });
  } catch (error) {
    console.error('Payment link error:', error);
    res.status(500).json({ error: error.message });
  }
});

// --- Review Response AI Proxy ---
app.post('/api/generate-review-response', async (req, res) => {
  try {
    const { review, rating, businessName, responseType } = req.body;
    
    if (!review) {
      return res.status(400).json({ error: 'Review text is required' });
    }
    
    const toneGuides = {
      professional: 'Professional and courteous — thank them sincerely, address their points, and maintain a polished tone.',
      friendly: 'Warm and conversational — like a real business owner talking to a customer. Use natural language.',
      short: 'Brief and to the point — 1-2 sentences that show you care without being wordy.'
    };
    
    const toneGuide = toneGuides[responseType] || toneGuides.professional;
    
    const prompt = `You are a customer service expert helping a small business owner respond to a Google review.

Business Name: ${businessName || 'Our Business'}
Customer Rating: ${rating || '5'} out of 5 stars
Customer Review: "${review}"

Tone: ${toneGuide}

Write a response as the business owner. Keep it under 100 words. Be genuine — no generic "Thank you for your feedback" templates. Reference specific things from their review if possible. Sign with "— ${businessName || 'The Team'}"`;

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.7
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error?.message || 'DeepSeek API error');
    }
    
    res.json({
      response: data.choices[0]?.message?.content || '',
      type: responseType
    });
  } catch (error) {
    console.error('Review response error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Also generate all 3 responses in one call
app.post('/api/generate-all-responses', async (req, res) => {
  try {
    const { review, rating, businessName } = req.body;
    
    if (!review) {
      return res.status(400).json({ error: 'Review text is required' });
    }
    
    // Generate all 3 responses in parallel
    const types = ['professional', 'friendly', 'short'];
    const results = await Promise.allSettled(
      types.map(type => {
        const toneGuides = {
          professional: 'Professional and courteous — thank them sincerely, address their points, and maintain a polished tone.',
          friendly: 'Warm and conversational — like a real business owner talking to a customer. Use natural language.',
          short: 'Brief and to the point — 1-2 sentences that show you care without being wordy.'
        };
        
        const prompt = `You are a customer service expert helping a small business owner respond to a Google review.

Business Name: ${businessName || 'Our Business'}
Customer Rating: ${rating || '5'} out of 5 stars
Customer Review: "${review}"

Tone: ${toneGuides[type]}

Write a response as the business owner. Keep it under 100 words. Be genuine — no generic templates. Reference specific things from their review if possible. Sign with "— ${businessName || 'The Team'}"`;

        return fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
          },
          body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300,
            temperature: 0.7
          })
        }).then(r => r.json());
      })
    );
    
    const responses = {};
    types.forEach((type, i) => {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value.choices) {
        responses[type] = result.value.choices[0]?.message?.content || '';
      } else {
        responses[type] = '';
      }
    });
    
    res.json({ responses });
  } catch (error) {
    console.error('Review response error:', error);
    res.status(500).json({ error: error.message });
  }
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
