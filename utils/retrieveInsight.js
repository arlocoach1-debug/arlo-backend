const fs = require('fs');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Calculate cosine similarity between two vectors
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

// Retrieve relevant insights based on user message
async function retrieveInsight(userMessage) {
  try {
    // Load embeddings from file
    const embeddingsPath = './datasets/sleep_recovery_embeddings.json';
    
    if (!fs.existsSync(embeddingsPath)) {
      console.log('⚠️ Embeddings file not found. Using default response.');
      return null;
    }

    const embeddingsData = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));

    // Generate embedding for user's message
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: userMessage,
    });

    const userEmbedding = response.data[0].embedding;

    // Find most similar insight
    let bestMatch = null;
    let highestScore = -1;

    embeddingsData.forEach((item) => {
      const similarity = cosineSimilarity(userEmbedding, item.vector);
      if (similarity > highestScore) {
        highestScore = similarity;
        bestMatch = item;
      }
    });

    // Only return if similarity is above threshold (0.7 = fairly relevant)
    if (highestScore > 0.7) {
      console.log(`✅ Found relevant insight: "${bestMatch.topic}" (similarity: ${highestScore.toFixed(2)})`);
      return {
        topic: bestMatch.topic,
        source: bestMatch.source,
        summary: bestMatch.summary,
        action: bestMatch.action,
        similarity: highestScore,
      };
    }

    console.log(`ℹ️ No highly relevant insights found (best score: ${highestScore.toFixed(2)})`);
    return null;

  } catch (error) {
    console.error('❌ Error retrieving insight:', error.message);
    return null;
  }
}

module.exports = { retrieveInsight };
