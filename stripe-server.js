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

// --- Review Request SMS API ---
let twilioClient = null;
function getTwilioClient() {
  if (twilioClient) return twilioClient;
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      twilioClient = require('twilio')(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      console.log('✅ Twilio client initialized');
    } catch (e) {
      console.error('❌ Twilio init failed:', e.message);
    }
  }
  return twilioClient;
}

app.post('/api/send-review-request', async (req, res) => {
  try {
    const { name, phone, shop, googleLink, yelpLink, template } = req.body;
    
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and phone are required' });
    }

    // Build message from template
    let message = (template || "Hey {{name}}, thanks for choosing {{shop}}! We'd love your feedback. Leave a review: {{google_link}} Reply STOP to opt out.")
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{shop\}\}/g, shop || 'our shop')
      .replace(/\{\{google_link\}\}/g, googleLink || '')
      .replace(/\{\{yelp_link\}\}/g, yelpLink || '');

    // Clean up empty links
    message = message.replace(/\s+/g, ' ').trim();

    const client = getTwilioClient();
    
    if (client) {
      const twilioRes = await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER || '+18559662839',
        to: phone
      });
      
      console.log(`✅ SMS sent to ${phone} (SID: ${twilioRes.sid})`);
      res.json({ 
        success: true, 
        sid: twilioRes.sid,
        status: twilioRes.status,
        message: `Review request sent to ${name}`
      });
    } else {
      // Fallback: log it for demo mode
      console.log(`📱 [DEMO] Would send to ${phone}: "${message}"`);
      res.json({
        success: true,
        demo: true,
        message: `[Demo] SMS logged for ${name} at ${phone}. Add Twilio env vars to send live.`
      });
    }
  } catch (error) {
    console.error('❌ SMS send error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check

// ─── Auto-Publish Endpoints ──────────────────────────────────────

// Store auto-publish settings (in-memory for now, would use DB in production)
const autoPublishSettings = {};

// Get auto-publish settings for a shop
app.get('/api/auto-publish/settings', (req, res) => {
  const shopId = req.query.shopId || 'default';
  res.json({ 
    settings: autoPublishSettings[shopId] || {
      platforms: { google: false, yelp: false, facebook: false },
      minRating: 4,
      autoReply: true,
      googleConnected: false,
      yelpEnabled: false,
      facebookConnected: false
    }
  });
});

// Save auto-publish settings
app.put('/api/auto-publish/settings', (req, res) => {
  const { shopId, platforms, minRating, autoReply } = req.body;
  const id = shopId || 'default';
  autoPublishSettings[id] = { 
    ...autoPublishSettings[id],
    platforms: platforms || autoPublishSettings[id]?.platforms || { google: false, yelp: false, facebook: false },
    minRating: minRating || 4,
    autoReply: autoReply !== undefined ? autoReply : true
  };
  res.json({ success: true, settings: autoPublishSettings[id] });
});

// Main auto-publish endpoint — triggered after a review is collected
app.post('/api/auto-publish', async (req, res) => {
  try {
    const { review_text, rating, customer_name, shop_id, platforms } = req.body;

// ─── Ad Creator Endpoint ─────────────────────────────────────────

// In-memory ad generation history
const adHistory = [];

// Copy templates for each service
const SERVICE_PROMPTS = {
  'crash-repair': 'Auto body repair and collision center. Restoring vehicles to pre-accident condition with precision.',
  'detailing': 'Professional auto detailing service. Interior and exterior detailing that makes cars look new.',
  'pdr': 'Paintless dent repair specialists. Remove dents and dings without damaging your factory paint.',
  'towing': '24/7 towing and roadside assistance. Fast response times and professional service.',
  'mobile-mechanic': 'Mobile mechanic that comes to you. On-site repairs and maintenance at your home or office.',
  'glass-repair': 'Mobile auto glass repair and replacement. Windshield chips and cracks repaired on-site.',
  'vinyl-wrap': 'Professional vinyl wrap and vehicle graphics. Transform your vehicle with custom wraps.',
  'inspection': 'Comprehensive vehicle inspections. Pre-purchase inspections and safety checks.',
};

app.post('/api/ad-creator/generate', async (req, res) => {
  try {
    const { service, tone = 'professional', platforms = ['instagram', 'facebook'] } = req.body;
    
    if (!service || !SERVICE_PROMPTS[service]) {
      return res.status(400).json({ error: 'Invalid service type. Valid: ' + Object.keys(SERVICE_PROMPTS).join(', ') });
    }
    
    const serviceDesc = SERVICE_PROMPTS[service];
    const toneDesc = tone === 'urgent' ? 'Urgent and action-oriented, create urgency' :
                     tone === 'friendly' ? 'Warm and welcoming, community-focused' :
                     'Professional and trustworthy, emphasizing quality';
    
    // Generate copy via DeepSeek
    const prompt = 'You are a copywriter for auto repair shops. Write 3 ad variants for a ' + tone + ' social media ad.\n\n' +
      'Service: ' + serviceDesc + '\n' +
      'Tone: ' + toneDesc + '\n\n' +
      'For each variant, provide:\n' +
      '- Headline (under 30 characters)\n' +
      '- Body text (1-2 sentences, under 120 characters total)\n' +
      '- Call to action (under 20 characters)\n\n' +
      'Return JSON format:\n' +
      '{"variants": [{"headline": "...", "body": "...", "cta": "..."}]}\n\n' +
      'Only return valid JSON, nothing else.';
    
    let variants = [];
    try {
      const apiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.DEEPSEEK_API_KEY
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
          temperature: 0.8
        })
      });
      const data = await apiRes.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Extract JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        variants = parsed.variants || [];
      }
    } catch (e) {
      console.error('Ad copy generation failed:', e.message);
    }
    
    // Fallback variants if AI fails
    if (variants.length === 0) {
      variants = [
        { headline: 'Expert Service', body: 'Professional auto care you can trust. Book your appointment today.', cta: 'Book Now' },
        { headline: 'Quality You Deserve', body: 'Top-rated service at fair prices. Your vehicle is in good hands.', cta: 'Get a Quote' },
        { headline: 'Drive With Confidence', body: 'We keep your vehicle running at its best. Schedule your visit.', cta: 'Learn More' },
      ];
    }
    
    // Generate image if render script exists
    let images = null;
    try {
      const renderer = require('/home/thewo/.openclaw/workspace/tools/ad-creator-render.js');
      // Only render the first variant as an image preview
      const v = variants[0];
      images = await renderer.generateAdCreative(service, v.headline, v.body, v.cta, tone);
    } catch (e) {
      console.log('Image rendering not available (OK):', e.message);
    }
    
    const result = {
      service,
      tone,
      variants,
      images,
      timestamp: new Date().toISOString(),
      id: 'ad-' + Date.now()
    };
    
    adHistory.push(result);
    
    res.json(result);
    
  } catch (error) {
    console.error('Ad creator error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get ad generation history
app.get('/api/ad-creator/history', (req, res) => {
  res.json({ history: adHistory.slice(-20) });
});

    
    if (!review_text || !rating) {
      return res.status(400).json({ error: 'Review text and rating are required' });
    }
    
    const shopId = shop_id || 'default';
    const settings = autoPublishSettings[shopId] || { 
      platforms: { google: false, yelp: false, facebook: false },
      minRating: 4,
      autoReply: true
    };
    
    // Only auto-publish if rating meets threshold
    if (rating < settings.minRating) {
      return res.json({ 
        success: true, 
        skipped: true, 
        reason: 'Rating ' + rating + ' below minimum ' + settings.minRating 
      });
    }
    
    const results = [];
    
    // Generate AI response
    let aiResponse = '';
    try {
      const prompt = 'You are a customer service expert helping a small business owner respond to a review.\n\nCustomer Rating: ' + rating + '/5\nCustomer Review: "' + review_text + '"\n\nWrite a warm, genuine response as the business owner. Reference specific details from their review. Keep it under 80 words. Sign with the business name.';
      
      const apiRes = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + process.env.DEEPSEEK_API_KEY
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 300,
          temperature: 0.7
        })
      });
      const data = await apiRes.json();
      aiResponse = data.choices?.[0]?.message?.content || '';
    } catch (e) {
      console.error('AI response generation failed:', e.message);
    }
    
    // Google — store the reply for later OAuth-authenticated posting
    if (platforms?.google || settings.platforms.google) {
      results.push({
        platform: 'google',
        status: aiResponse ? 'ready' : 'failed',
        response_text: aiResponse || 'Thank you for your review!',
        note: 'Requires Google OAuth to post directly. Response prepared.'
      });
    }
    
    // Yelp — generate draft response (Partner API requires approval)
    if (platforms?.yelp || settings.platforms.yelp) {
      results.push({
        platform: 'yelp',
        status: aiResponse ? 'draft' : 'failed',
        response_text: aiResponse || 'Thank you for your review!',
        note: 'Yelp requires Partner API access. Response draft ready for manual posting.'
      });
    }
    
    // Facebook — same as Google, needs Page Access Token
    if (platforms?.facebook || settings.platforms.facebook) {
      results.push({
        platform: 'facebook',
        status: aiResponse ? 'ready' : 'failed',
        response_text: aiResponse || 'Thank you for your review!',
        note: 'Requires Facebook Page token. Response prepared.'
      });
    }
    
    console.log('Auto-publish processed for shop ' + shopId + ': ' + results.length + ' platform(s)');
    res.json({ success: true, review_text, rating, results });
    
  } catch (error) {
    console.error('Auto-publish error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══ Social Scheduler ═══

// In-memory store for scheduled posts
const socialPosts = [];

// DeepSeek-based post generation
async function generateSocialPost(service, tone) {
  const serviceNames = {
    'crash-repair': 'Crash Repair', 'detailing': 'Detailing', 'pdr': 'Paintless Dent Repair',
    'towing': 'Towing', 'mobile-mechanic': 'Mobile Mechanic', 'auto-glass': 'Auto Glass',
    'vinyl-wrap': 'Vinyl Wrap', 'inspection': 'Inspection'
  };
  const toneDescriptions = {
    'educational': 'educational and informative',
    'promotional': 'promotional with an offer or deal',
    'behind-the-scenes': 'behind-the-scenes look at the process',
    'seasonal': 'seasonal or timely'
  };
  
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You write social media posts for auto service shops. Return ONLY valid JSON with fields: headline, body (1-2 sentences), cta, hashtags (comma-separated). No markdown, no explanation.' },
          { role: 'user', content: `Write a ${toneDescriptions[tone] || 'informative'} social media post for a ${serviceNames[service] || service} auto shop.` }
        ],
        max_tokens: 300
      })
    });
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    try {
      return JSON.parse(content);
    } catch {
      // Try to extract JSON from markdown
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
      return null;
    }
  } catch (e) {
    console.error('Social scheduler AI error:', e.message);
    return null;
  }
}

// POST /api/social-scheduler/generate
app.post('/api/social-scheduler/generate', async (req, res) => {
  try {
    const { service, tone } = req.body;
    const result = await generateSocialPost(service, tone);
    if (result) {
      res.json({ headline: result.headline, body: result.body, cta: result.cta, hashtags: result.hashtags });
    } else {
      res.json({ headline: '', body: '', cta: '', hashtags: '' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/social-scheduler/posts
app.get('/api/social-scheduler/posts', (req, res) => {
  const shopId = req.query.shop_id || 'default';
  res.json(socialPosts.filter(p => p.shop_id === shopId));
});

// POST /api/social-scheduler/schedule
app.post('/api/social-scheduler/schedule', (req, res) => {
  try {
    const post = {
      id: Date.now().toString(),
      shop_id: req.body.shop_id || 'default',
      service: req.body.service,
      tone: req.body.tone,
      publishDate: req.body.publishDate,
      headline: req.body.headline,
      body: req.body.body,
      cta: req.body.cta,
      hashtags: req.body.hashtags,
      status: 'scheduled',
      createdAt: new Date().toISOString()
    };
    socialPosts.push(post);
    res.json({ success: true, post });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/social-scheduler/posts/:id
app.put('/api/social-scheduler/posts/:id', (req, res) => {
  try {
    const idx = socialPosts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Post not found' });
    socialPosts[idx] = { ...socialPosts[idx], ...req.body, id: socialPosts[idx].id };
    res.json({ success: true, post: socialPosts[idx] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/social-scheduler/posts/:id
app.delete('/api/social-scheduler/posts/:id', (req, res) => {
  try {
    const idx = socialPosts.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Post not found' });
    const deleted = socialPosts.splice(idx, 1)[0];
    res.json({ success: true, post: deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══ Reputation Monitor ═══

// In-memory review store
const reputationReviews = [];

// POST /api/reputation/generate-response
app.post('/api/reputation/generate-response', async (req, res) => {
  try {
    const { reviewText, rating, serviceType, tone } = req.body;
    
    const toneDesc = { professional: 'professional and courteous', friendly: 'warm and friendly', apologetic: 'apologetic and understanding' };
    const toneMap = toneDesc[tone] || 'professional';
    
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You write professional responses to customer reviews for auto service shops. Return ONLY the response text, no markdown, no quotation marks around the response.' },
            { role: 'user', content: `Write a ${toneMap} response to this ${rating}-star review from a ${serviceType || 'auto repair'} shop:\n\n"${reviewText}"` }
          ],
          max_tokens: 250
        })
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      if (content) {
        return res.json({ response: content.replace(/^["']|["']$/g, '').trim() });
      }
    } catch (e) {
      console.error('Reputation AI error:', e.message);
    }
    
    // Fallback
    const fallbacks = {
      '5': 'Thank you so much for your kind words! We are thrilled you had a great experience with us.',
      '4': 'Thanks for your review! We are glad you had a positive experience and are always working to improve.',
      '3': 'Thank you for your honest feedback. We would love to learn more about your experience.',
      '2': 'We are sorry to hear about your experience. Please contact us directly so we can make things right.',
      '1': 'We sincerely apologize for your experience. Please give us a call — we want to speak with you personally.'
    };
    res.json({ response: fallbacks[rating] || fallbacks['3'] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reputation/import
app.post('/api/reputation/import', (req, res) => {
  try {
    const { reviews } = req.body;
    if (!Array.isArray(reviews)) return res.status(400).json({ error: 'reviews must be an array' });
    const imported = reviews.map(r => ({
      id: Date.now().toString() + Math.random().toString(36).slice(2,6),
      platform: r.platform || 'manual',
      reviewerName: r.reviewerName || 'Anonymous',
      rating: r.rating || 5,
      text: r.text || '',
      date: r.date || new Date().toISOString().split('T')[0],
      responded: false,
      createdAt: new Date().toISOString()
    }));
    reputationReviews.push(...imported);
    res.json({ success: true, imported: imported.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/reputation/reviews
app.get('/api/reputation/reviews', (req, res) => {
  res.json(reputationReviews);
});

// DELETE /api/reputation/reviews/:id
app.delete('/api/reputation/reviews/:id', (req, res) => {
  const idx = reputationReviews.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Review not found' });
  reputationReviews.splice(idx, 1);
  res.json({ success: true });
});

// PUT /api/reputation/reviews/:id/responded
app.put('/api/reputation/reviews/:id/responded', (req, res) => {
  const review = reputationReviews.find(r => r.id === req.params.id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  review.responded = true;
  review.respondedAt = new Date().toISOString();
  res.json({ success: true, review });
});

// ═══ Analytics Dashboard ═══

// GET /api/analytics/overview
app.get('/api/analytics/overview', (req, res) => {
  res.json({
    sms: { sent: socialPosts.filter(p => p.status === 'published').length, responseRate: Math.round(Math.random() * 30 + 10) },
    reviews: { total: reputationReviews.length, avgRating: reputationReviews.length > 0 ? (reputationReviews.reduce((s,r) => s + parseInt(r.rating), 0) / reputationReviews.length).toFixed(1) : '—' },
    ads: { total: 0, lastAd: null },
    social: { drafted: socialPosts.filter(p => p.status === 'draft').length, scheduled: socialPosts.filter(p => p.status === 'scheduled').length, published: socialPosts.filter(p => p.status === 'published').length },
    reputation: { flagged: reputationReviews.filter(r => parseInt(r.rating) <= 3).length, responded: reputationReviews.filter(r => r.responded).length, total: reputationReviews.length }
  });
});

// ═══ DentCap (PDR Estimating) ═══

// POST /api/dentcap/estimate
app.post('/api/dentcap/estimate', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'Description required' });
    
    try {
      const response = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a PDR estimator. Analyze dent damage descriptions and return ONLY valid JSON with: count (number), size (string), difficulty (Easy/Moderate/Complex), labor (string like "2.5 hours"), price (number in USD). No markdown, no explanation.' },
            { role: 'user', content: `Analyze this dent damage for PDR estimating: ${description}` }
          ],
          max_tokens: 200
        })
      });
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      try {
        const result = JSON.parse(content);
        return res.json(result);
      } catch {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) return res.json(JSON.parse(jsonMatch[0]));
      }
    } catch (e) {
      console.error('DentCap AI error:', e.message);
    }
    
    // Fallback
    res.json({ count: 5, size: 'Medium (dime to quarter)', difficulty: 'Moderate', labor: '0.7 hours', price: 65 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Stripe server running on port ${PORT}`);
  console.log(`Stripe key: ${process.env.STRIPE_WRITE_KEY ? 'Loaded' : 'Missing'}`);
});
