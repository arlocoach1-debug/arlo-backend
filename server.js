// Arlo Backend - Deployed via Railway
const express = require('express');
const twilio = require('twilio');
const { Firestore } = require('@google-cloud/firestore');
const admin = require('firebase-admin');
const OpenAI = require('openai');
const { retrieveInsight } = require('./utils/retrieveInsight');
const { parseWorkout, generateWorkoutConfirmation } = require('./utils/workoutParser');
const visionRoute = require("./routes/visionRoute");
require('dotenv').config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use("/vision", visionRoute);

// Initialize Firebase Admin with service account from environment variable
if (!admin.apps.length) {
  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  };
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const firestore = admin.firestore();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Normalize phone number - remove 'whatsapp:' prefix if present
function normalizePhoneNumber(phone) {
  return phone.replace('whatsapp:', '');
}

// Format phone number for WhatsApp sending
function formatForWhatsApp(phone) {
  const normalized = normalizePhoneNumber(phone);
  return `whatsapp:${normalized}`;
}

// System prompt for Arlo
const ARLO_SYSTEM_PROMPT = `You are Arlo, an AI performance and lifestyle coach. You communicate via text message with athletes and high performers.

Your coaching style:
- Calm, confident, and motivational (think Huberman meets Olympic coach)
- Science-based but conversational - NEVER sound robotic or academic
- Weave research insights naturally into advice without just reciting studies
- Only mention sources when it adds credibility or the user seems skeptical
- Use casual coaching language: "Here's the thing...", "Quick tip:", "Try this:", "Let's fix that"
- Ask clarifying questions when needed
- Keep responses concise (2-3 sentences max for text)
- Focus on: workouts, recovery, sleep, nutrition, performance optimization

When you receive research insights in your context, use them to INFORM your response naturally. Think like a knowledgeable coach explaining something to an athlete, not a scientist reading a paper. The research should guide your advice invisibly - users should feel like they're talking to an expert human coach, not an AI database.

You interpret user logs like "Ran 5K" or "Slept 6 hours" and provide actionable insights.`;

// Health check
app.get('/', (req, res) => {
  res.send('Arlo backend is running ✅');
});

// Send WhatsApp template message (for onboarding)
async function sendWhatsAppTemplate(toPhone, userName) {
  try {
    const message = await twilioClient.messages.create({
      from: formatForWhatsApp(process.env.TWILIO_WHATSAPP_NUMBER),
      to: formatForWhatsApp(toPhone),
      contentSid: process.env.WHATSAPP_TEMPLATE_SID, // Template SID from Meta
      contentVariables: JSON.stringify({
        "1": userName // Variable for {{1}} in template
      })
    });
    console.log(`Template message sent to ${toPhone}: ${message.sid}`);
    return message;
  } catch (error) {
    console.error(`Error sending template to ${toPhone}:`, error);
    throw error;
  }
}

// Endpoint for Zapier to trigger welcome template
app.post('/send-welcome', async (req, res) => {
  const { phone, name } = req.body;
  
  if (!phone || !name) {
    return res.status(400).json({ error: 'Phone and name are required' });
  }

  try {
    await sendWhatsAppTemplate(phone, name);
    res.json({ success: true, message: 'Welcome message sent' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send welcome message' });
  }
});

// Main message handler (works for both SMS and WhatsApp)
async function handleIncomingMessage(req, res) {
  const { From, Body, MessageSid } = req.body;
  const rawPhone = From;
  const userPhone = normalizePhoneNumber(rawPhone); // Store without 'whatsapp:' prefix
  const userMessage = Body;
  const isWhatsApp = rawPhone.includes('whatsapp:');

  console.log(`${isWhatsApp ? 'WhatsApp' : 'SMS'} message from ${userPhone}: ${userMessage}`);

  try {
    // Get user document by phone number
    const userRef = firestore.collection('users').doc(userPhone);
    const userDoc = await userRef.get();

    // Check if user exists
    if (!userDoc.exists) {
      console.log(`User not found: ${userPhone}`);
      const twimlResponse = new twilio.twiml.MessagingResponse();
      twimlResponse.message('Hi! To start using Arlo, please sign up at arlo.coach');
      return res.type('text/xml').send(twimlResponse.toString());
    }

    const userData = userDoc.data();

    // Check if message is a workout log
    const { parseWorkout, generateWorkoutConfirmation } = require('./utils/workoutParser');
    const workout = parseWorkout(userMessage);
    
    if (workout) {
      console.log('🏋️ Workout detected:', workout);
      
      // Get current week start (Monday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysToMonday = (dayOfWeek + 6) % 7;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - daysToMonday);
      weekStart.setHours(0, 0, 0, 0);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      // Store workout in Firebase
    await userRef.update({
  'weeklyActivity.weekStart': weekStartStr,
'weeklyActivity.workoutsLogged': admin.firestore.FieldValue.arrayUnion(workout),
'weeklyActivity.lastMessageDate': admin.firestore.FieldValue.serverTimestamp()
});

      // Send confirmation
      const confirmationMessage = generateWorkoutConfirmation(workout);
      const twilioResponse = new twilio.twiml.MessagingResponse();
      twilioResponse.message(confirmationMessage);
      
      console.log('✅ Workout logged for user:', userPhone);
      return res.type('text/xml').send(twilioResponse.toString());
    }
    // Check subscription status
    if (userData.subscriptionStatus === 'cancelled' || userData.subscriptionStatus === 'inactive') {
      console.log(`Inactive subscription for: ${userPhone}`);
      const twimlResponse = new twilio.twiml.MessagingResponse();
      twimlResponse.message('Your Arlo subscription has ended. Resubscribe at arlo.coach to continue coaching!');
      return res.type('text/xml').send(twimlResponse.toString());
    }

    // Store incoming message
    await firestore.collection('messages').add({
      userId: userPhone,
      direction: 'incoming',
      content: userMessage,
      timestamp: new Date(),
      twilioMessageSid: MessageSid,
      channel: isWhatsApp ? 'whatsapp' : 'sms'
    });

    // Get conversation history (last 10 messages for context)
    const historySnapshot = await firestore
      .collection('messages')
      .where('userId', '==', userPhone)
      .orderBy('timestamp', 'desc')
      .limit(10)
      .get();

    const conversationHistory = [];
    historySnapshot.forEach(doc => {
      const msg = doc.data();
      conversationHistory.push({
        role: msg.direction === 'incoming' ? 'user' : 'assistant',
        content: msg.content
      });
    });
    conversationHistory.reverse();

    // Build context about the user for better personalization
    // Retrieve relevant knowledge insight
const insight = await retrieveInsight(userMessage);

// Add insight to context if found
let knowledgeContext = '';
if (insight) {
  knowledgeContext = `\n\nRelevant research insight:\nTopic: ${insight.topic}\nSource: ${insight.source}\nSummary: ${insight.summary}\nAction: ${insight.action}`;
}
const userContext = `User: ${userData.name}, ${userData.age} years old, ${userData.gender}
Goal: ${userData.mainGoal || 'Not specified'}
Training: ${userData.trainingLevel || 'Unknown'} level, ${userData.trainingFrequency || 'Unknown'}, ${userData.trainingVolume || 'Unknown'} total
Type: ${userData.primaryTrainingType || 'Unknown'}
Sleep: ${userData.averageSleep || 'Unknown'} per night average
Challenge: ${userData.biggestChallenge || 'Not specified'}
Nutrition: ${userData.nutritionApproach || 'Not specified'}
Supplements: ${userData.supplements ? userData.supplements.join(', ') : 'None'}
Wearable: ${userData.wearableDevice || 'None'}
Training time: ${userData.trainingTime || 'Unknown'}${userData.injuryNotes ? `\nInjury notes: ${userData.injuryNotes}` : ''}${knowledgeContext}`;
    // Get AI response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ARLO_SYSTEM_PROMPT },
        { role: 'system', content: userContext },
        ...conversationHistory
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    const arloResponse = completion.choices[0].message.content;

    // Store AI response
    await firestore.collection('messages').add({
      userId: userPhone,
      direction: 'outgoing',
      content: arloResponse,
      timestamp: new Date(),
      model: 'gpt-4o-mini',
      channel: isWhatsApp ? 'whatsapp' : 'sms'
    });

    // Update user stats
    await userRef.update({
      messageCount: (userData.messageCount || 0) + 1,
      lastMessageAt: new Date()
    });

    // Send response via Twilio
    const twimlResponse = new twilio.twiml.MessagingResponse();
    twimlResponse.message(arloResponse);

    res.type('text/xml').send(twimlResponse.toString());

  } catch (error) {
    console.error('Error processing message:', error);
    const twimlResponse = new twilio.twiml.MessagingResponse();
    twimlResponse.message('Sorry, I encountered an error. Please try again in a moment.');
    res.type('text/xml').send(twimlResponse.toString());
  }
}

// Twilio webhook endpoints
app.post('/sms', handleIncomingMessage); // For SMS
app.post('/whatsapp', handleIncomingMessage); // For WhatsApp (same handler)
// Manual trigger for weekly progress (for testing)
app.post('/trigger-weekly-progress', async (req, res) => {
  const { sendWeeklyProgressReports } = require('./cron/weeklyProgressCheck');
  
  try {
    await sendWeeklyProgressReports();
    res.json({ success: true, message: 'Weekly progress reports sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Arlo backend running on port ${PORT}`);
  console.log(`SMS Webhook: https://your-app.up.railway.app/sms`);
  console.log(`WhatsApp Webhook: https://your-app.up.railway.app/whatsapp`);
});
