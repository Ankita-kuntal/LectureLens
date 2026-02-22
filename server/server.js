const express = require("express");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const { execSync } = require('child_process');
const fs = require('fs');


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
// app.get("/transcript/:videoId", async (req, res) => {
//   const { videoId } = req.params;
//   try {
//     // Use YouTube Data API to get caption list
//     const listRes = await fetch(
//       `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${YOUTUBE_API_KEY}`
//     );
//     const listData = await listRes.json();
//     console.log("Captions list:", JSON.stringify(listData).substring(0, 200));
    
//     res.json({ success: false, transcript: null, message: "Use browser fetch" });
//   } catch(e) {
//     res.json({ success: false, error: e.message });
//   }
// });

// app.get("/transcript/:videoId", async (req, res) => {
//   res.json({ success: false, transcript: null, message: "Transcript fetched from browser" });
// });



const transcriptCache = {}; // in-memory cache

app.get("/transcript/:videoId", async (req, res) => {
  const { videoId } = req.params;
  
  // Return cached transcript instantly
  if (transcriptCache[videoId]) {
    console.log(`⚡ Transcript from cache: ${videoId}`);
    return res.json({ success: true, transcript: transcriptCache[videoId] });
  }
  
  try {
    console.log(`📝 Getting transcript for: ${videoId}`);
    execSync(
      `yt-dlp --write-auto-sub --sub-lang en --skip-download --sub-format json3 -o "C:/tmp/%(id)s" "https://www.youtube.com/watch?v=${videoId}"`,
      { timeout: 30000, encoding: 'utf8' }
    );
    
    const filePath = `C:/tmp/${videoId}.en.json3`;
    if (!fs.existsSync(filePath)) return res.json({ success: false, transcript: null });
    
    const json3 = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    fs.unlinkSync(filePath);
    
    const segments = (json3.events || [])
      .filter(e => e.segs && e.tStartMs !== undefined)
      .map(e => ({
        time: e.tStartMs / 1000,
        text: e.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim()
      }))
      .filter(s => s.text && s.text.trim());
    
    const chunked = [];
    let cc = { startTime: 0, text: "", label: "0:00" };
    segments.forEach(seg => {
      if (seg.time - cc.startTime > 30) {
        if (cc.text.trim()) chunked.push(cc);
        const m = Math.floor(seg.time/60), s = Math.floor(seg.time%60);
        cc = { startTime: seg.time, text: "", label: `${m}:${String(s).padStart(2,'0')}` };
      }
      cc.text += " " + seg.text;
    });
    chunked.push(cc);
    
    const transcript = JSON.stringify(chunked);
    transcriptCache[videoId] = transcript; // cache it!
    
    console.log(`✅ Chunks: ${chunked.length} (cached for next time)`);
    res.json({ success: true, transcript });
    
  } catch(e) {
    console.error("❌ Transcript error:", e.message);
    res.json({ success: false, transcript: null });
  }
});


// Main Q&A endpoint
// Main Q&A endpoint
app.post("/ask", async (req, res) => {
  const { question, videoInfo, transcript, visualFrames, conversationHistory = [] } = req.body;

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
    // if (transcript && transcript.length > 0) {
    //   console.log("⚡ FAST MODE: Using transcript (2-3 seconds)");
    //   answer = await answerWithTranscript(question, videoInfo, transcript, questionType === "origin");
    // }
    // // PRIORITY 2: Use vision only if NO transcript (SLOW - 10-15 seconds)
    // else if (visualFrames && visualFrames.length > 0) {
    //   console.log("🐌 SLOW MODE: Using vision AI (10-15 seconds)");
    //   answer = await answerWithVision(question, videoInfo, visualFrames, questionType === "origin");
    // }
    // // FALLBACK: General knowledge
    // else {
    //   console.log("🧠 FALLBACK: General knowledge");
    //   answer = await answerWithGeneralKnowledge(question, videoInfo);
    // }

    // Replace your current priority logic with this:

    if (transcript && transcript.length > 0) {
  // Transcript is ALWAYS better and faster - use it exclusively
  console.log("⚡ FAST MODE: Transcript only (2-3 seconds)");
  answer = await answerWithTranscript(question, videoInfo, transcript, questionType === "origin", conversationHistory);
}
else if (visualFrames?.length > 0) {
  // Only use vision if NO transcript exists
  console.log("🐌 VISION MODE: No transcript, using frames");
  answer = await answerWithVision(question, videoInfo, visualFrames, questionType === "origin", conversationHistory);
}
else {
  answer = await answerWithGeneralKnowledge(question, videoInfo, conversationHistory);
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

// const { YoutubeTranscript } = require('youtube-transcript');

// async function fetchTranscript(videoId) {
//   try {
//     console.log("📝 Fetching transcript...");
    
//     // Read ytInitialPlayerResponse via injected script
//     const result = await chrome.scripting.executeScript({
//       target: { tabId: (await chrome.tabs.getCurrent())?.id },
//       world: "MAIN", // runs in page context, can access ytInitialPlayerResponse
//       func: () => {
//         const tracks = window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
//         const en = tracks.find(t => t.languageCode === 'en' && !t.kind) 
//                  || tracks.find(t => t.languageCode === 'en')
//                  || tracks[0];
//         return en?.baseUrl || null;
//       }
//     });
    
//     const captionUrl = result?.[0]?.result;
//     console.log("🔗 URL:", captionUrl?.substring(0, 80));
//     if (!captionUrl) return null;
    
//     const xml = await fetch(captionUrl).then(r => r.text());
//     console.log("📄 XML:", xml.length);
//     if (xml.length < 100) return null;
    
//     const segments = [...xml.matchAll(/<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)]
//       .map(m => ({
//         time: parseFloat(m[1]),
//         text: m[2].replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/\n/g,' ').trim()
//       })).filter(s => s.text);
    
//     console.log(`✅ Segments: ${segments.length}`);
//     if (!segments.length) return null;
    
//     const chunked = [];
//     let cc = { startTime: 0, text: "", label: "0:00" };
//     segments.forEach(seg => {
//       if (seg.time - cc.startTime > 30) {
//         if (cc.text.trim()) chunked.push(cc);
//         const m = Math.floor(seg.time/60), s = Math.floor(seg.time%60);
//         cc = { startTime: seg.time, text: "", label: `${m}:${String(s).padStart(2,'0')}` };
//       }
//       cc.text += " " + seg.text;
//     });
//     chunked.push(cc);
//     return JSON.stringify(chunked);
    
//   } catch(e) {
//     console.log("⚠️ Failed:", e.message);
//     return null;
//   }
// }

function decodeHTML(html) {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

async function answerWithTranscript(question, videoInfo, transcript, needsTimeline, history = []) {
  // const contextTranscript = transcript.substring(0, 3000);

  let contextText = "";

  try {
    const segments = JSON.parse(transcript); // Now it's structured
    const currentSeconds = timeToSeconds(videoInfo.timestamp);

    // Get 3 minutes before current time (where the formula came from)
    // Plus 30 seconds after (current context)
    const relevant = segments.filter(seg =>
      seg.startTime >= currentSeconds - 180 &&
      seg.startTime <= currentSeconds + 30
    );

    // Format with real timestamps the AI can reference
    contextText = relevant
      .map(seg => `[${seg.label}] ${seg.text.trim()}`)
      .join('\n');

    // If question is about origin, also grab the first 2 minutes
    // (many lecturers introduce formulas at the start)
    if (needsTimeline) {
      const intro = segments.slice(0, 4)
        .map(seg => `[${seg.label}] ${seg.text.trim()}`)
        .join('\n');
      contextText = intro + "\n...\n" + contextText;
    }

  } catch {
    // Fallback: old behavior if transcript isn't structured yet
    contextText = transcript.substring(0, 3000);
  }

  // Now pass contextText to Groq prompt instead of raw transcript
  // ...rest of your prompt code unchanged



  let prompt;

  if (needsTimeline) {
    prompt = `You are a friendly tutor explaining a concept to a confused student. Act like ChatGPT - warm, clear, and educational.

VIDEO: "${videoInfo.title}"
CURRENT TIME: ${videoInfo.timestamp}

TRANSCRIPT:
${contextText}

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

// Add at the END of both prompts, before the closing backtick:
IMPORTANT: You MUST reference specific timestamps from the transcript in format "At 2:30" so students can click to jump there. Always include at least 2 timestamps.

- NO LaTeX or math symbols like $F_0$ — write it as "F0" or "F-naught" in plain text

REMEMBER: You're a TEACHER, not a screen narrator. Help them understand the concept!`;
  } else {
    prompt = `You are a friendly tutor like ChatGPT. Explain concepts clearly and simply.

VIDEO: "${videoInfo.title}"
CURRENT TIME: ${videoInfo.timestamp}

TRANSCRIPT CONTEXT:
${contextText}

STUDENT'S QUESTION: ${question}

YOUR JOB:
- EXPLAIN the concept using the transcript, don't be generic
- Use everyday language with real examples
- Reference specific timestamps from the transcript: "At 2:30"
- NO LaTeX or dollar signs like $s$ — write it as plain text
- Use **bold** for key terms

FORMAT:

## Quick Answer
[Direct answer in one sentence]

## Let Me Explain
[Teach the concept clearly with examples from the transcript]

## In Simple Terms
[Break it down even simpler]

IMPORTANT: Always include at least 1 clickable timestamp like "At 15:30" from the transcript!`;
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
        messages: [
    { 
      role: "system", 
      content: "You are a friendly tutor helping a student understand a YouTube lecture. Remember context from previous questions in this conversation." 
    },
    ...history,        // ← spreads the previous Q&A pairs
    { role: "user", content: prompt }  // ← current question with context
  ],
        temperature: 0.7,
        max_tokens: 1200
      })
    }
  );

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "No response generated";
}

function timeToSeconds(timeStr) {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parts[0] * 60 + parts[1];
}

async function answerWithVision(question, videoInfo, visualFrames, needsTimeline, history = []) {
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
      const frameList = visualFrames.map((f, i) => `- Frame ${i + 1}: ${f.timestamp} (${f.label})`).join('\n');

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

async function answerWithBoth(question, videoInfo, transcript, visualFrames, needsTimeline = false, history = []) {
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

async function answerWithGeneralKnowledge(question, videoInfo, history = []) {
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