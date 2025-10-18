const fs = require('fs');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// List of all embedding files
const embeddingFiles = [
  './datasets/sleep_recovery_embeddings.json',
  './datasets/recovery_regeneration_embeddings.json',
  './datasets/training_methods_embeddings.json',
  './datasets/nutrition_fueling_embeddings.json',
  './datasets/stress_mental_performance_embeddings.json',
  './datasets/breathing_techniques_embeddings.json',
  './datasets/injury_prevention_mobility_embeddings.json',
  './datasets/mindset_motivation_embeddings.json',
  './datasets/performance_optimization_embeddings.json',
  './datasets/productivity_time_management_embeddings.json',
  './datasets/race_competition_prep_embeddings.json',
  './datasets/hyrox_hybrid_training_embeddings.json'
];

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
    // Load all embeddings from all files
    let allEmbeddings = [];
    
    for (const embeddingFile of embeddingFiles) {
      if (fs.existsSync(embeddingFile)) {
        const data = JSON.parse(fs.readFileSync(embeddingFile, 'utf8'));
        allEmbeddings = allEmbeddings.concat(data);
      }
    }
    
    if (allEmbeddings.length === 0) {
      console.log('⚠️ No embedding files found. Generate embeddings first.');
      return null;
    }

    // Generate embedding for user's message
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: userMessage,
    });

    const userEmbedding = response.data[0].embedding;

    // Find most similar insight across all knowledge bases
    let bestMatch = null;
    let highestScore = -1;

    allEmbeddings.forEach((item) => {
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
