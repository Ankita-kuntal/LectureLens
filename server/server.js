const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const GROQ_API_KEY = process.env.GROQ_API_KEY;

console.log("🔑 Groq API Key loaded:", GROQ_API_KEY ? "✅ Yes" : "❌ No");

app.get("/", (req, res) => {
  res.json({ 
    status: "LectureLens backend running",
    api: "Groq Llama 3.3 70B"
  });
});

app.post("/ask", async (req, res) => {
  const { prompt, videoInfo } = req.body;
  
  console.log("\n" + "=".repeat(60));
  console.log("📹 Video:", videoInfo?.title || "Unknown");
  console.log("⏱️  Timestamp:", videoInfo?.timestamp || "Unknown");
  console.log("=".repeat(60));
  
  try {
    if (!GROQ_API_KEY) {
      throw new Error("Groq API key not configured");
    }
    
    console.log("🤖 Calling Groq API (Llama 3.3 70B)...");
    
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{
            role: "user",
            content: prompt
          }],
          temperature: 0.7,
          max_tokens: 1000
        })
      }
    );
    
    console.log("📡 Response status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ API error:", errorText);
      throw new Error(`API error: ${errorText}`);
    }
    
    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content || "No response";
    
    console.log("✅ SUCCESS! Answer length:", answer.length, "chars");
    console.log("=".repeat(60) + "\n");
    
    res.json({ answer });
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.log("=".repeat(60) + "\n");
    res.status(500).json({ 
      error: "Server error",
      message: error.message
    });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 LectureLens Backend Started");
  console.log("📡 Server: http://localhost:" + PORT);
  console.log("🤖 AI Model: Llama 3.3 70B (via Groq)");
  console.log("⚡ Response time: 1-2 seconds");
  console.log("=".repeat(60) + "\n");
});