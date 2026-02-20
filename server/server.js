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
    features: ["transcript", "vision", "combined-analysis"]
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
    
    // BEST: Use BOTH transcript AND vision
    if (transcript && visualFrames && visualFrames.length > 0) {
      console.log("🎯 Using COMBINED transcript + vision...");
      answer = await answerWithBoth(question, videoInfo, transcript, visualFrames);
    }
    // GOOD: Just transcript
    else if (transcript && transcript.length > 0) {
      console.log("📝 Using transcript-based answer...");
      answer = await answerWithTranscript(question, videoInfo, transcript);
    }
    // OK: Just vision
    else if (visualFrames && visualFrames.length > 0) {
      console.log("👁️ Using vision-based answer...");
      answer = await answerWithVision(question, videoInfo, visualFrames);
    }
    // FALLBACK: General knowledge
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

// ===== HELPER FUNCTIONS =====

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
  
  const prompt = `You are a helpful tutor explaining a YouTube lecture to a confused student.

VIDEO: "${videoInfo.title}"
CURRENT TIME: ${videoInfo.timestamp}

TRANSCRIPT CONTEXT (what was said recently):
${contextTranscript}

STUDENT'S CONFUSION: ${question}

The student is confused about something they just saw/heard. Your job is to:
1. Find WHERE in the transcript this concept was introduced or explained
2. Trace back to the ORIGIN of any values/formulas they're asking about
3. Explain the PROGRESSION: "First at [earlier point], then [next step], finally [now]"

Provide a clear, detailed explanation. Reference specific parts of the transcript.

Format with:
- **Bold** for key terms/values
- Clear paragraphs
- Step-by-step breakdown
- Time references when possible (e.g., "Earlier in the video...")`;

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
  if (!genAI) {
    return "Vision AI is not configured. Please add GOOGLE_API_KEY to enable visual analysis.";
  }
  
  console.log("🔍 Vision AI: Starting analysis...");
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    console.log("✅ Using model: gemini-2.5-flash");
    
    const imageParts = visualFrames.map((frame, index) => {
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
    
    console.log("🔍 Vision AI: Image parts created:", imageParts.length);
    
    const timestamps = visualFrames.map(f => f.timestamp || "unknown").join(", ");
    
    const prompt = `You are a helpful tutor analyzing screenshots from a video lecture to help a confused student.

VIDEO: "${videoInfo.title}"
CURRENT TIME: ${videoInfo.timestamp}

I'm providing ${visualFrames.length} screenshots from the video timeline:
${visualFrames.map((f, i) => `- Frame ${i+1}: ${f.timestamp || 'current moment'} (${f.timeSeconds ? Math.floor(f.timeSeconds) + 's' : 'now'})`).join('\n')}

STUDENT'S CONFUSION: ${question}

CRITICAL INSTRUCTIONS:
1. Look at ALL frames in CHRONOLOGICAL order (oldest to newest)
2. Identify what was shown FIRST and how it EVOLVED
3. Track the PROGRESSION: What appeared when?
4. Find the ORIGIN of the confusing element (formula, value, concept)
5. Explain step-by-step: "At [time/Frame X], the instructor first showed... Then at [time/Frame Y], they..."

Analyze what's visible:
- Text, code, formulas, diagrams
- Handwritten notes on board/screen
- Any values, variables, or equations
- How they connect across frames

Provide timestamps/frame references (e.g., "In Frame 3 (20 seconds ago)...") so the student can jump back.

Format with:
- **Bold** for key terms/values
- Clear step-by-step explanation
- Frame/time references
- Direct answer to their confusion`;

    console.log("🔍 Vision AI: Calling Gemini API...");
    
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const text = response.text();
    
    console.log("🔍 Vision AI: Success! Answer length:", text.length);
    
    return text;
    
  } catch (error) {
    console.error("❌ Vision AI Error:", error.message);
    
    // Fallback answer
    return `I tried to analyze the video frames but encountered a technical issue (${error.message}).

Based on the video title "${videoInfo.title}" and your question "${question}", I can provide general guidance, but for the specific answer visible on screen, please try:

1. **Rewinding 30-60 seconds** to see where this concept was introduced
2. **Enabling captions** if available (click CC button)
3. **Checking the video description** for formulas or key values

If you can describe what you see on screen, I can help explain the concept!`;
  }
}

async function answerWithBoth(question, videoInfo, transcript, visualFrames) {
  if (!genAI) {
    return await answerWithTranscript(question, videoInfo, transcript);
  }
  
  console.log("🎯 Combined Analysis: Using transcript + vision together");
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const contextTranscript = transcript.substring(0, 3000);
    
    const imageParts = visualFrames.map(frame => {
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
    
    const prompt = `You are a tutor with BOTH audio transcript AND visual screenshots from a lecture video.

VIDEO: "${videoInfo.title}"
CURRENT TIME: ${videoInfo.timestamp}

TRANSCRIPT (recent spoken words):
${contextTranscript}

VISUAL FRAMES: ${visualFrames.length} screenshots showing timeline progression:
${visualFrames.map((f, i) => `- Frame ${i+1}: ${f.timestamp || 'now'}`).join('\n')}

STUDENT'S CONFUSION: ${question}

Use BOTH sources together:
- TRANSCRIPT = What was SAID (audio)
- IMAGES = What was SHOWN/WRITTEN (visual)

Cross-reference them! For example:
- Transcript says "plugging in these values" → Images show which values and where they came from
- Transcript explains a concept → Images show the formula/diagram
- Images show a result → Transcript explains how it was derived

Find the ORIGIN by checking both audio cues and visual progression.

Provide a complete answer with:
- **Time/frame references** (e.g., "At 2:30, the instructor said... while showing...")
- **Bold** for key terms
- **Step-by-step** explanation
- Both what was SAID and what was SHOWN`;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    
    console.log("✅ Combined analysis complete");
    return response.text();
    
  } catch (error) {
    console.error("❌ Combined analysis error:", error);
    return await answerWithTranscript(question, videoInfo, transcript);
  }
}

async function answerWithGeneralKnowledge(question, videoInfo) {
  const prompt = `You are a helpful tutor. A student is watching "${videoInfo.title}" at ${videoInfo.timestamp} and is confused.

STUDENT'S QUESTION: ${question}

Unfortunately, neither the transcript nor visual frames are available for this video.

Provide:
1. A conceptual explanation based on the video title and question
2. General guidance on the topic
3. Suggestions for the student:
   - Rewind 30-60 seconds to see where this was introduced
   - Enable captions (CC button) if available
   - Check video description for formulas/values
   - Pause and check what's visible on screen

Be helpful but honest that you don't have the specific video context.`;

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
  console.log("🚀 LectureLens Backend v2.1 Started");
  console.log("📡 Server: http://localhost:" + PORT);
  console.log("🤖 AI: Groq + Google Gemini");
  console.log("=".repeat(60) + "\n");
});