// utils/insightGenerator.js

const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Generate personalized weekly insights using AI
 */
async function generateWeeklyInsights(stats, userData, prompts) {
  // Handle no workouts case
  if (stats.noDataThisWeek) {
    const name = userData.name || userData.firstName || 'there';
    return `Hey ${name},

I noticed you didn't log any workouts this week. No judgment - life happens!

Remember: one workout is infinitely better than zero. Even 15 minutes counts.

What's one small thing you can do tomorrow to get back on track?`;
  }

  // Build context for AI - handle missing fields
  const name = userData.name || userData.firstName || 'User';
  const goal = userData.goals || userData.primaryGoal || 'General fitness';
  
  const context = `
User: ${name}
Goal: ${goal}

Week Summary:
- Total workouts: ${stats.totalWorkouts}
- Cardio sessions: ${stats.cardioCount}
- Strength sessions: ${stats.strengthCount}
- Days active: ${stats.consistency.daysActive}/7
${stats.totalDistance > 0 ? `- Total distance: ${stats.totalDistance}km` : ''}
${stats.volumeTrend ? `- Volume trend: ${stats.volumeTrend} (${stats.volumeChange}%)` : ''}

Key points to address:
${prompts.map(p => `- ${p}`).join('\n')}
  `.trim();

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are Arlo, an AI performance coach. Generate a brief, personalized weekly progress summary. Be:
- Encouraging and supportive
- Specific about their data
- Science-based but conversational
- 3-4 sentences max
- End with one actionable tip for next week

Tone: Like a knowledgeable friend, not a corporate bot.`
        },
        {
          role: 'user',
          content: context
        }
      ],
      temperature: 0.7,
      max_tokens: 200
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating insights:', error);
    
    // Fallback insight if AI fails
    return `Great week! You completed ${stats.totalWorkouts} workouts across ${stats.consistency.daysActive} days. ${stats.volumeTrend === 'increasing' ? 'Your volume is trending up - nice progress! 📈' : 'Keep that consistency going! 💪'} 

Focus for next week: ${stats.trainingBalance.cardio > 80 ? 'Add 1-2 strength sessions' : stats.trainingBalance.strength > 80 ? 'Mix in some cardio' : 'Keep the balance going'}`;
  }
}

module.exports = {
  generateWeeklyInsights
};
