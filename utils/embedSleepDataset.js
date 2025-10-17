const fs = require("fs");
const OpenAI = require("openai");
require("dotenv").config();

// Create OpenAI client using your API key from Railway environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Step 1: Read your dataset file
const dataset = JSON.parse(
  fs.readFileSync("./datasets/sleep_recovery.json", "utf8")
);

// Step 2: Generate embeddings for each insight
async function generateEmbeddings() {
  const results = [];

  for (const entry of dataset) {
    const text = `${entry.topic}. ${entry.summary}. ${entry.action}`;
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    results.push({
      topic: entry.topic,
      vector: embedding.data[0].embedding,
      source: entry.source,
      summary: entry.summary,
      action: entry.action,
    });
  }

  // Step 3: Save these embeddings locally for now
  fs.writeFileSync(
    "./datasets/sleep_recovery_embeddings.json",
    JSON.stringify(results, null, 2)
  );

  console.log("✅ Embeddings generated and saved!");
}

generateEmbeddings();
