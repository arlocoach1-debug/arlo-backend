// ===== VISION ANALYSIS ROUTE =====
const OpenAI = require("openai");
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const ratelimit = require("express-rate-limit");
const { retrieveInsight } = require("../utils/retrieveInsight");
const visionLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5, // Limit each user to 5 uploads per day
  message: {
    error: "You’ve reached your daily upload limit. Try again tomorrow.",
  },
  keyGenerator: (req) => req.body.userId || req.ip, // identify by user or IP
});


const upload = multer({ dest: "uploads/" });
const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// POST /vision/analyze
router.post("/vision/analyze", visionLimiter, upload.single("image"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileData = fs.readFileSync(filePath);
    const base64Image = fileData.toString("base64");
// STEP: Analyze the visual input using Vision + Knowledge Base
const category = req.body.category || "workout_form"; // "nutrition" or "workout_form"

// Step 1: Describe what to analyze
let visualPrompt = 
  category === "nutrition"
    ? "Analyze this image of food. Estimate calories, macros, and balance of nutrients. Keep it friendly and actionable."
    : "Analyze this workout form. Identify posture, alignment, and give quick, encouraging feedback like a human coach.";

// Step 2: Get AI Vision interpretation
const visualResponse = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: visualPrompt },
        { type: "image_url", image_url: `data:image/jpeg;base64,${base64Image}` },
      ],
    },
  ],
});

// Step 3: Extract AI feedback
const visualInsight =
  visualResponse.choices?.[0]?.message?.content ||
  "I couldn’t interpret this image clearly.";

// Step 4: Pull related insight from the knowledge base
const topic =
  category === "nutrition"
    ? "nutrition_fueling"
    : "performance_optimization";

const insight = await retrieveInsight(visualInsight, topic);

// Step 5: Combine both into one natural message
const combinedResponse = `
${category === "nutrition" ? "🥗" : "💪"} Here's what I noticed:
${visualInsight}

${insight ? `Quick research-backed tip: ${insight.action}` : ""}
`;

    // Prompt context for workout form & nutrition
  const context =
  category === "nutrition"
    ? "Analyze the image of food for calorie, macro, and nutrient estimates. Provide clear, concise analysis for athletes."
    : "Analyze the user's workout form in this image or short clip. Identify any mistakes in posture, balance, or movement. Give 1-2 actionable tips to improve.";

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are Arlo, a performance and recovery AI coach.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: context },
            {
              type: "image_url",
              image_url: `data:image/jpeg;base64,${base64Image}`,
            },
          ],
        },
      ],
    });

    fs.unlinkSync(filePath); // delete temp image

    const analysis = response.choices[0].message.content;
 res.json({ success: true, analysis: combinedResponse });
  } catch (err) {
    console.error("Vision error:", err);
    res.status(500).json({ success: false, message: "Vision analysis failed." });
  }
});
// ===== VIDEO ANALYSIS ROUTE =====
import ffmpeg from "fluent-ffmpeg";
import path from "path";

router.post("/analyze-video", visionLimiter, upload.single("video"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const frameDir = "./frames";

    if (!fs.existsSync(frameDir)) fs.mkdirSync(frameDir);

    await new Promise((resolve, reject) => {
      ffmpeg(filePath)
        .on("end", resolve)
        .on("error", reject)
        .screenshots({
          timestamps: ["25%", "50%", "75%"],
          filename: "frame-%i.png",
          folder: frameDir,
        });
    });

    const frameFiles = fs.readdirSync(frameDir).slice(0, 3);
    let insights = [];

    for (const frame of frameFiles) {
      const framePath = path.join(frameDir, frame);
      const base64Image = fs.readFileSync(framePath, { encoding: "base64" });

      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this workout frame for form, balance, or posture issues." },
              { type: "image_url", image_url: `data:image/png;base64,${base64Image}` },
            ],
          },
        ],
      });

      insights.push(response.choices[0].message.content);
      fs.unlinkSync(framePath);
    }

    fs.unlinkSync(filePath);
    res.json({ insights });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error analyzing video" });
  }
});

module.exports = router;
