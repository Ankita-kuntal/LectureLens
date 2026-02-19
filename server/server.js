const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Load API Keys
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

console.log("🔑 API Keys Status:");
console.log("   Groq:", GROQ_API_KEY ? "✅" : "❌");
console.log("   Google AI:", GOOGLE_API_KEY ? "✅" : "❌");
console.log("   YouTube:", YOUTUBE_API_KEY ? "✅" : "❌");

// Initialize Google AI
const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);

// Health check
app.get("/", (req, res) => {
  res.json({ 
    status: "LectureLens backend running",
    version: "2.0.0",
    features: ["transcript", "vision", "audio"]
  });
});

// Fetch transcript
app.get("/transcript/:videoId", async (req, res) => {
  const { videoId } = req.params;
  
  try {
    console.log(`📝 Fetching transcript for: ${videoId}`);
    const transcript = await fetchTranscriptFromYouTube(videoId);
    
    if (!transcript) {
      return res.json({ 
        success: false, 
        transcript: null,
        message: "No captions available"
      });
    }
    
    console.log(`✅ Transcript fetched: ${transcript.length} chars`);
    res.json({ success: true, transcript });
    
  } catch (error) {
    console.error("❌ Transcript error:", error.message);
    res.json({ success: false, transcript: null, error: error.message });
  }
});

// Main Q&A endpoint
app.post("/ask", async (req, res) => {
  const { question, videoInfo, transcript, visualFrames } = req.body;
  
  console.log("\n" + "=".repeat(60));
  console.log("📹 Video:", videoInfo?.title || "Unknown");
  console.log("⏱️  Time:", videoInfo?.timestamp || "Unknown");
  console.log("❓ Question:", question);
  console.log("📝 Has Transcript:", !!transcript);
  console.log("🖼️  Has Frames:", visualFrames?.length || 0);
  console.log("=".repeat(60));
  
  try {
    let answer;
    
    if (transcript && transcript.length > 0) {
      console.log("🎯 Using transcript-based answer...");
      answer = await answerWithTranscript(question, videoInfo, transcript);
    }
    else if (visualFrames && visualFrames.length > 0) {
      console.log("👁️ Using vision-based answer...");
      answer = await answerWithVision(question, videoInfo, visualFrames);
    }
    else {
      console.log("🧠 Using general knowledge fallback...");
      answer = await answerWithGeneralKnowledge(question, videoInfo);
    }
    
    console.log("✅ Answer generated:", answer.substring(0, 100) + "...");
    console.log("=".repeat(60) + "\n");
    
    res.json({ success: true, answer });
    
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.log("=".repeat(60) + "\n");
    res.status(500).json({ 
      success: false,
      error: error.message
    });
  }
});

// Helper: Fetch transcript
async function fetchTranscriptFromYouTube(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();
    
    const captionsRegex = /"captionTracks":\[([^\]]+)\]/;
    const match = html.match(captionsRegex);
    
    if (!match) return null;
    
    const captionsJson = '[' + match[1] + ']';
    const captions = JSON.parse(captionsJson);
    
    if (!captions || captions.length === 0) return null;
    
    const captionUrl = captions[0].baseUrl;
    
    const transcriptRes = await fetch(captionUrl);
    const transcriptXML = await transcriptRes.text();
    
    const textMatches = [...transcriptXML.matchAll(/<text[^>]*>([^<]+)<\/text>/g)];
    const transcript = textMatches
      .map(match => decodeHTML(match[1]))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    return transcript;
    
  } catch (error) {
    console.error("Transcript fetch failed:", error);
    return null;
  }
}

function decodeHTML(html) {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function answerWithTranscript(question, videoInfo, transcript) {
  const contextTranscript = transcript.substring(0, 3000);
  
  const prompt = `You are a helpful tutor explaining a YouTube lecture.

VIDEO: "${videoInfo.title}"
TIME: ${videoInfo.timestamp}

TRANSCRIPT:
${contextTranscript}

STUDENT QUESTION: ${question}

Provide a clear, detailed explanation. Use simple language. Format with:
- **Bold** for key points
- Clear paragraphs
- Examples if relevant`;

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
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1500
      })
    }
  );
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response generated";
}

async function answerWithVision(question, videoInfo, visualFrames) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const imageParts = visualFrames.map(frame => {
    const base64Data = frame.includes('base64,') 
      ? frame.split('base64,')[1] 
      : frame;
    
    return {
      inlineData: {
        data: base64Data,
        mimeType: 'image/jpeg'
      }
    };
  });
  
  const prompt = `You are a helpful tutor. Student is watching: "${videoInfo.title}" at ${videoInfo.timestamp}.

These are screenshots from that moment.

QUESTION: ${question}

Analyze what's visible (text, diagrams, formulas, code) and answer clearly with:
- **Bold** for key points
- Step-by-step explanations`;

  const result = await model.generateContent([prompt, ...imageParts]);
  const response = await result.response;
  return response.text();
}

async function answerWithGeneralKnowledge(question, videoInfo) {
  const prompt = `You are a helpful tutor. Student is watching "${videoInfo.title}" at ${videoInfo.timestamp} and asks:

"${question}"

The transcript is unavailable. Provide a conceptual explanation and suggest:
1. Rewinding to check the specific moment
2. Looking in video description
3. Enabling captions if available`;

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
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1000
      })
    }
  );
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Unable to generate answer";
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 LectureLens Backend v2.0 Started");
  console.log("📡 Server: http://localhost:" + PORT);
  console.log("🤖 AI: Groq + Google Gemini");
  console.log("=".repeat(60) + "\n");
});