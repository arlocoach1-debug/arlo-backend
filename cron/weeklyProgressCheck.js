// cron/weeklyProgressCheck.js

const admin = require('firebase-admin');
const twilio = require('twilio');
const { calculateWeeklyStats, generateInsightPrompts } = require('../utils/statsCalculator');
const { generateWeeklyInsights } = require('../utils/insightGenerator');

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Send weekly progress reports to all active users
 */
async function sendWeeklyProgressReports() {
  console.log('🔄 Starting weekly progress check...');

  try {
    const firestore = admin.firestore();
    const usersSnapshot = await firestore.collection('users').get();

    let sentCount = 0;
    let errorCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      try {
        const userData = userDoc.data();
        const userId = userDoc.id;

        // Skip inactive users
        if (userData.subscriptionStatus === 'cancelled' || userData.subscriptionStatus === 'inactive') {
          console.log(`⏭️  Skipping inactive user: ${userId}`);
          continue;
        }
// Skip users who signed up less than 5 days ago
      const createdAt = userData.created_at || userData.createdAt;
      if (createdAt) {
        const daysSinceSignup = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceSignup < 5) {
          console.log(`⏭️  Skipping new user (${daysSinceSignup.toFixed(0)} days old): ${userId}`);
          continue;
        }
      }

      // Skip users with no workouts this week
     
      if (workouts.length === 0) {
        console.log(`⏭️  Skipping user with no workouts this week: ${userId}`);
        continue;
      }
        // Get this week's workouts
    
        const weekStart = userData.weeklyActivity?.weekStart || new Date().toISOString().split('T')[0];

        // Calculate stats
        const stats = calculateWeeklyStats(workouts, userData);
        const prompts = generateInsightPrompts(stats, userData);

        // Generate AI insights
        const insights = await generateWeeklyInsights(stats, userData, prompts);

        // Format week dates
        const weekEnd = new Date();
        const weekStartDate = new Date(weekStart);
        const weekLabel = `${weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}-${weekEnd.toLocaleDateString('en-US', { day: 'numeric' })}`;

        // Send plain WhatsApp message (not template) for now
        await twilioClient.messages.create({
          from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
          to: `whatsapp:${userId}`,
          body: `📊 Week of ${weekLabel}\n\n${insights}\n\nKeep up the momentum! What's your focus for next week?`
        });

        // Archive this week to history
        await firestore.collection('users').doc(userId).update({
          weeklyHistory: admin.firestore.FieldValue.arrayUnion({
            weekStart: weekStart,
            weekEnd: weekEnd.toISOString().split('T')[0],
            totalVolume: stats.totalWorkouts,
            insights: insights,
            stats: stats
          }),
          // Reset for new week
          'weeklyActivity.workoutsLogged': [],
          'weeklyActivity.weekStart': null
        });

        console.log(`✅ Sent weekly report to ${userId}`);
        sentCount++;

      } catch (error) {
        console.error(`❌ Error processing user ${userDoc.id}:`, error.message);
        errorCount++;
      }
    }

    console.log(`✅ Weekly progress check complete. Sent: ${sentCount}, Errors: ${errorCount}`);

  } catch (error) {
    console.error('❌ Fatal error in weekly progress check:', error);
  }
}

module.exports = {
  sendWeeklyProgressReports
};
