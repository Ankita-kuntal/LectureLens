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
const genAI = GOOGLE_API_KEY ? new GoogleGenerativeAI(GOOGLE_API_KEY) : null;

// Health check
app.get("/", (req, res) => {
  res.json({ 
    status: "LectureLens backend running",
    version: "2.1.0",
    features: ["transcript", "vision", "smart-detection"]
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
// Main Q&A endpoint
app.post("/ask", async (req, res) => {
  const { question, videoInfo, transcript, visualFrames } = req.body;
  
  console.log("\n" + "=".repeat(60));
  console.log("📹 Video:", videoInfo?.title || "Unknown");
  console.log("⏱️  Time:", videoInfo?.timestamp || "Unknown");
  console.log("❓ Question:", question);
  console.log("📝 Has Transcript:", !!transcript);
  console.log("🖼️  Has Frames:", visualFrames?.length || 0);
  
  const questionType = detectQuestionType(question);
  console.log("🧠 Question Type:", questionType);
  console.log("=".repeat(60));
  
  try {
    let answer;
    
    // PRIORITY 1: Use transcript if available (FAST - 2-3 seconds)
    if (transcript && transcript.length > 0) {
      console.log("⚡ FAST MODE: Using transcript (2-3 seconds)");
      answer = await answerWithTranscript(question, videoInfo, transcript, questionType === "origin");
    }
    // PRIORITY 2: Use vision only if NO transcript (SLOW - 10-15 seconds)
    else if (visualFrames && visualFrames.length > 0) {
      console.log("🐌 SLOW MODE: Using vision AI (10-15 seconds)");
      answer = await answerWithVision(question, videoInfo, visualFrames, questionType === "origin");
    }
    // FALLBACK: General knowledge
    else {
      console.log("🧠 FALLBACK: General knowledge");
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

// ===== HELPER FUNCTIONS =====

// Smart question type detection
function detectQuestionType(question) {
  const q = question.toLowerCase();
  
  // Origin keywords (need timeline)
  const originKeywords = [
    'how did', 'where did', 'where does', 'where is this from',
    'came from', 'come from', 'got this', 'get this', 'derived',
    'why this value', 'why is this', 'what happened before',
    'earlier', 'previous', 'mentioned before', 'shown before'
  ];
  
  // Explanation keywords (just need current context)
  const explanationKeywords = [
    'what is', 'what are', 'define', 'explain', 'meaning of',
    'how does', 'how do', 'tell me about', 'describe',
    'difference between', 'example of', 'use of', 'what does'
  ];
  
  // Check for origin indicators
  for (const keyword of originKeywords) {
    if (q.includes(keyword)) {
      return "origin";
    }
  }
  
  // Check for explanation indicators
  for (const keyword of explanationKeywords) {
    if (q.includes(keyword)) {
      return "explanation";
    }
  }
  
  // Default: adaptive (might need some context)
  return "adaptive";
}

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

async function answerWithTranscript(question, videoInfo, transcript, needsTimeline = false) {
  const contextTranscript = transcript.substring(0, 3000);
  
  let prompt;
  
  if (needsTimeline) {
    prompt = `You are a friendly tutor explaining a concept to a confused student. Act like ChatGPT - warm, clear, and educational.

VIDEO: "${videoInfo.title}"
CURRENT TIME: ${videoInfo.timestamp}

TRANSCRIPT:
${contextTranscript}

STUDENT'S CONFUSION: ${question}

YOUR JOB:
- EXPLAIN the concept clearly, don't just describe what's on screen
- Use simple language like talking to a friend
- Include timestamps when referencing earlier moments: "At 2:30"
- Teach the WHY and HOW, not just WHAT

FORMAT:

## Quick Answer
[One sentence that directly answers their confusion]

## Here's What's Happening
[Explain the concept in simple terms - teach it like ChatGPT would]

## Timeline (if relevant)
At 2:30: [what was introduced]
At 3:15: [how it developed]

REMEMBER: You're a TEACHER, not a screen narrator. Help them understand the concept!`;
  } else {
    prompt = `You are a friendly tutor like ChatGPT. Explain concepts clearly and simply.

VIDEO: "${videoInfo.title}"
CURRENT TIME: ${videoInfo.timestamp}

CONTEXT:
${contextTranscript}

STUDENT'S QUESTION: ${question}

YOUR JOB:
- EXPLAIN the concept, don't describe the screen
- Use everyday language
- Give examples if helpful
- Make it easy to understand

FORMAT:

## Quick Answer
[Direct answer in one sentence]

## Let Me Explain
[Teach the concept clearly with examples]

## In Simple Terms
[Break it down even simpler if needed]

Teach like ChatGPT - warm, clear, educational!`;
  }

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
        max_tokens: 1200
      })
    }
  );
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response generated";
}

async function answerWithVision(question, videoInfo, visualFrames, needsTimeline = false) {
  if (!genAI) {
    return "Vision AI is not configured. Please add GOOGLE_API_KEY to enable visual analysis.";
  }
  
  console.log("🔍 Vision AI: Starting...");
  console.log("🔍 Frames:", visualFrames.length);
  console.log("🔍 Timeline mode:", needsTimeline ? "YES" : "NO");
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const imageParts = visualFrames.map((frame) => {
      const base64Data = frame.image 
        ? (frame.image.includes('base64,') ? frame.image.split('base64,')[1] : frame.image)
        : (frame.includes('base64,') ? frame.split('base64,')[1] : frame);
      
      return {
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg'
        }
      };
    });
    
    let prompt;
    
    if (needsTimeline) {
      const frameList = visualFrames.map((f, i) => `- Frame ${i+1}: ${f.timestamp} (${f.label})`).join('\n');
      
      prompt = `You are a friendly tutor like ChatGPT. I'm showing you screenshots from a lecture video.

VIDEO: "${videoInfo.title}"
CURRENT TIME: ${videoInfo.timestamp}

FRAMES:
${frameList}

STUDENT'S CONFUSION: ${question}

CRITICAL INSTRUCTIONS:
- DO NOT just describe what you see on screen
- EXPLAIN the concept that's being taught
- Look at the visuals to understand WHAT concept is being explained, then TEACH that concept
- Use simple language
- Include timestamps: "At 1:30"

FORMAT:

## Quick Answer
[Direct answer to their question]

## Let Me Break This Down
[Explain the concept clearly - TEACH it, don't describe it]

## Timeline
At ${visualFrames[2]?.timestamp || '1:30'}: [when this concept was introduced]
At ${visualFrames[0]?.timestamp || '0:30'}: [how it started]

You're a TEACHER using the visuals to understand what to teach, not a screen narrator!`;
    } else {
      prompt = `You are a friendly tutor like ChatGPT. I'm showing you a screenshot from a lecture.

VIDEO: "${videoInfo.title}"
CURRENT TIME: ${videoInfo.timestamp}

STUDENT'S QUESTION: ${question}

CRITICAL:
- Look at the visual to understand WHAT is being taught
- Then EXPLAIN that concept clearly
- DON'T describe the screen, TEACH the concept
- Use simple language

FORMAT:

## Quick Answer
[One sentence answer]

## Here's the Concept
[Teach the concept based on what you see, but explain it like ChatGPT would]

## Example
[Give a simple example if helpful]

Remember: You're explaining concepts, not describing images!`;
    }
    
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    
    console.log("✅ Vision AI: Success!");
    return response.text();
    
  } catch (error) {
    console.error("❌ Vision AI Error:", error.message);
    return `## I Hit a Technical Issue

I couldn't analyze the video frames right now.

## What You Can Try
1. Rewind 30-60 seconds to see when this concept started
2. Enable captions (CC button) if available
3. Tell me what you see, and I'll explain the concept!`;
  }
}

async function answerWithBoth(question, videoInfo, transcript, visualFrames, needsTimeline = false) {
  if (!genAI) {
    return await answerWithTranscript(question, videoInfo, transcript, needsTimeline);
  }
  
  console.log("🎯 Combined: transcript + vision");
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const contextTranscript = transcript.substring(0, 2500);
    
    const framesToUse = visualFrames.slice(0, 3);
    
    const imageParts = framesToUse.map(frame => {
      const base64Data = frame.image 
        ? (frame.image.includes('base64,') ? frame.image.split('base64,')[1] : frame.image)
        : (frame.includes('base64,') ? frame.split('base64,')[1] : frame);
      
      return {
        inlineData: {
          data: base64Data,
          mimeType: 'image/jpeg'
        }
      };
    });
    
    let prompt;
    
    if (needsTimeline) {
      prompt = `You are a warm, friendly tutor like ChatGPT. I'm giving you both audio transcript and visual screenshots.

VIDEO: "${videoInfo.title}"
TIME: ${videoInfo.timestamp}

TRANSCRIPT: ${contextTranscript}
FRAMES: ${framesToUse.length} screenshots

STUDENT'S CONFUSION: ${question}

CRITICAL:
- Use transcript + visuals to understand WHAT concept is being taught
- Then EXPLAIN that concept clearly like ChatGPT would
- Include timestamps: "At 2:30"
- DON'T describe the screen, TEACH the concept

FORMAT:

## Quick Answer
[One clear sentence]

## Here's What's Happening
[Explain the concept using both audio and visual context]

## Timeline
At 1:30: [when concept introduced]
At 2:15: [how it developed]

You're an EDUCATOR, not a narrator!`;
    } else {
      prompt = `You are a friendly tutor like ChatGPT with transcript + screenshots.

VIDEO: "${videoInfo.title}"
TIME: ${videoInfo.timestamp}

TRANSCRIPT: ${contextTranscript}
VISUALS: ${framesToUse.length} screenshot(s)

STUDENT'S QUESTION: ${question}

INSTRUCTIONS:
- Understand WHAT is being taught from both sources
- EXPLAIN the concept clearly
- Use simple language
- Give examples

FORMAT:

## Quick Answer
[Direct answer]

## Let Me Explain
[Teach the concept clearly]

You're teaching concepts, not describing screens!`;
    }
    
    const result = await model.generateContent([prompt, ...imageParts]);
    return result.response.text();
    
  } catch (error) {
    console.error("❌ Combined error:", error);
    return await answerWithTranscript(question, videoInfo, transcript, needsTimeline);
  }
}

async function answerWithGeneralKnowledge(question, videoInfo) {
  const prompt = `You are a warm, helpful tutor like ChatGPT.

STUDENT is watching: "${videoInfo.title}" at ${videoInfo.timestamp}

STUDENT'S QUESTION: ${question}

Unfortunately, I don't have the transcript or visuals from this specific moment.

YOUR JOB:
- Explain the concept they're asking about based on the video topic
- Use simple, clear language
- Give helpful suggestions for finding the answer in the video

FORMAT:

## Let Me Help With That Concept
[Explain the concept generally based on video title and question]

## What You Can Try
1. Rewind 30-60 seconds to see when this started
2. Enable captions (CC) if available
3. Check the video description

## The Basic Idea
[General educational explanation of the concept]

Be warm and helpful like ChatGPT!`;

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

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 LectureLens Backend v2.1 (FINAL - CHATGPT STYLE)");
  console.log("📡 Server: http://localhost:" + PORT);
  console.log("🤖 AI: Groq + Google Gemini 2.5 Flash");
  console.log("💬 Teaching mode: Explain concepts, not describe screens");
  console.log("=".repeat(60) + "\n");
});