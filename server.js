const express = require('express');
const twilio = require('twilio');
const { Firestore } = require('@google-cloud/firestore');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Initialize Firestore with service account from environment variable
let firestoreConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID
};

// If service account JSON is provided as env var, parse and use it
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  firestoreConfig.credentials = serviceAccount;
}

const firestore = new Firestore(firestoreConfig);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// System prompt for Arlo
const ARLO_SYSTEM_PROMPT = `You are Arlo, an AI performance and lifestyle coach. You communicate via text message with athletes and high performers.

Your coaching style:
- Calm, confident, and motivational (think Huberman meets Olympic coach)
- Science-based but conversational
- Ask clarifying questions when needed
- Keep responses concise (2-3 sentences max for text)
- Focus on: workouts, recovery, sleep, nutrition, performance optimization

You interpret user logs like "Ran 5K" or "Slept 6 hours" and provide actionable insights.`;

// Health check
app.get('/', (req, res) => {
  res.send('Arlo backend is running ✅');
});

// Twilio webhook for incoming SMS (and future Apple Messages via Twilio)
app.post('/sms', async (req, res) => {
  const { From, Body, MessageSid } = req.body;
  const userPhone = From;
  const userMessage = Body;

  console.log(`Message from ${userPhone}: ${userMessage}`);

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
      twilioMessageSid: MessageSid
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
    const userContext = `User info: ${userData.name}, ${userData.age} years old, ${userData.gender}. Goals: ${userData.mainGoal || 'Not specified yet'}.`;

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
      model: 'gpt-4o-mini'
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
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Arlo backend running on port ${PORT}`);
  console.log(`Webhook URL: https://your-app.up.railway.app/sms`);
});
