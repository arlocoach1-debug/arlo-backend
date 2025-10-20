// ===== VISION ANALYSIS ROUTE =====
import OpenAI from "openai";
import express from "express";
import multer from "multer";
import fs from "fs";
import rateLimit from "express-rate-limit";
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

    // Prompt context for workout form & nutrition
    const category = req.body.category || "workout_form"; // or 'nutrition'
    const context =
      category === "nutrition"
        ? "Analyze the image of food for calorie, macro, and nutrient estimates. Provide clear, concise analysis for athletes."
        : "Analyze the user’s workout form in this image or short clip. Identify any mistakes in posture, balance, or movement. Give 1–2 actionable tips to improve.";

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
    res.json({ success: true, analysis });
  } catch (err) {
    console.error("Vision error:", err);
    res.status(500).json({ success: false, message: "Vision analysis failed." });
  }
});

export default router;
