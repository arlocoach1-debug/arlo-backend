const fs = require('fs');
const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// List of all dataset files to process
const datasets = [
  'sleep_recovery.json',
  'recovery_regeneration.json',
  'training_methods.json',
  'nutrition_fueling.json',
  'stress_mental_performance.json',
  'breathing_techniques.json',
  'injury_prevention_mobility.json',
  'mindset_motivation.json',
  'performance_optimization.json',
  'productivity_time_management.json',
  'race_competition_prep.json',
  'hyrox_hybrid_training.json'
];

async function generateEmbeddings() {
  try {
    console.log('🚀 Starting embedding generation for all knowledge bases...\n');
    
    for (const datasetFile of datasets) {
      const datasetPath = `./datasets/${datasetFile}`;
      const outputPath = `./datasets/${datasetFile.replace('.json', '_embeddings.json')}`;
      
      // Check if dataset file exists
      if (!fs.existsSync(datasetPath)) {
        console.log(`⚠️ Skipping ${datasetFile} - file not found`);
        continue;
      }
      
      console.log(`📊 Processing: ${datasetFile}`);
      
      // Read the dataset
      const dataset = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
      console.log(`   Found ${dataset.length} entries`);
      
      const results = [];
      
      // Generate embeddings for each entry
      for (const entry of dataset) {
        const text = `${entry.topic} ${entry.summary} ${entry.action}`;
        
        const embedding = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: text,
        });
        
        results.push({
          topic: entry.topic,
          source: entry.source,
          summary: entry.summary,
          action: entry.action,
          vector: embedding.data[0].embedding,
        });
      }
      
      // Save embeddings to file
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`   ✅ Saved ${results.length} embeddings to ${outputPath}\n`);
    }
    
    console.log('🎉 All embeddings generated successfully!\n');
    console.log('📈 Summary:');
    datasets.forEach(dataset => {
      const embeddingFile = `./datasets/${dataset.replace('.json', '_embeddings.json')}`;
      if (fs.existsSync(embeddingFile)) {
        const data = JSON.parse(fs.readFileSync(embeddingFile, 'utf8'));
        console.log(`   ${dataset}: ${data.length} entries`);
      }
    });
    
  } catch (error) {
    console.error('❌ Error generating embeddings:', error.message);
    process.exit(1);
  }
}

generateEmbeddings();
