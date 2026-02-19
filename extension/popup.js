const questionInput = document.getElementById("question");
const askBtn = document.getElementById("askBtn");
const responseBox = document.getElementById("response");
const statusBox = document.getElementById("status");

askBtn.addEventListener("click", handleAsk);

async function handleAsk() {
  const userQuestion = questionInput.value.trim();
  
  if (!userQuestion) {
    alert("Please enter a question!");
    return;
  }
  
  askBtn.disabled = true;
  askBtn.textContent = "Loading...";
  responseBox.innerHTML = "";
  statusBox.textContent = "🔍 Getting video context...";
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes("youtube.com/watch")) {
      throw new Error("Please open this extension on a YouTube video page");
    }
    
    await ensureContentScriptLoaded(tab.id);
    
    const response = await chrome.tabs.sendMessage(tab.id, { 
      type: "GET_VIDEO_CONTEXT" 
    });
    
    if (!response.success) {
      throw new Error(response.error || "Failed to get video context");
    }
    
    const videoContext = response.data;
    
    statusBox.textContent = "🤖 Asking AI with video context...";
    
    const fullPrompt = buildSmartPrompt(videoContext, userQuestion);
    
    const aiResponse = await fetch("http://localhost:5000/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        prompt: fullPrompt,
        videoInfo: {
          title: videoContext.title,
          timestamp: videoContext.currentTimeFormatted,
          videoId: videoContext.videoId
        }
      })
    });
    
    const data = await aiResponse.json();
    
    if (!aiResponse.ok) {
      throw new Error(data.message || data.error || "Backend returned error");
    }
    
    statusBox.textContent = `✅ Answer (at ${videoContext.currentTimeFormatted}):`;
    
    // ✅ NEW: Render formatted HTML instead of plain text
    responseBox.innerHTML = formatResponse(data.answer);
    
  } catch (error) {
    console.error("Full error:", error);
    statusBox.textContent = "❌ Error";
    responseBox.textContent = error.message;
  } finally {
    askBtn.disabled = false;
    askBtn.textContent = "Ask with Context";
  }
}

async function ensureContentScriptLoaded(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch (error) {
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// ✅ NEW: Convert markdown-like text to HTML
function formatResponse(text) {
  if (!text) return "";
  
  // Escape HTML first
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Convert headings
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  
  // Convert **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Convert bullet points
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  
  // Convert numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  
  // Convert paragraphs
  html = html.split('\n\n').map(para => {
    if (!para.trim().startsWith('<')) {
      return `<p>${para}</p>`;
    }
    return para;
  }).join('');
  
  return html;
}

function buildSmartPrompt(videoContext, userQuestion) {
  const hasTranscript = videoContext.contextTranscript && 
                        videoContext.contextTranscript !== "No transcript available";
  
  if (hasTranscript) {
    return `You are a helpful tutor. Answer in EXACTLY this format:

# Quick Answer
[One clear sentence answering the question]

## Detailed Explanation
[2-3 short paragraphs with simple words]

## Key Points
- Point 1
- Point 2
- Point 3

VIDEO CONTEXT:
Title: ${videoContext.title}
Timestamp: ${videoContext.currentTimeFormatted}
Transcript: ${videoContext.contextTranscript}

QUESTION: ${userQuestion}

Rules:
- Use emojis naturally (🎯 💡 ✅ 📌)
- Keep under 150 words
- No guessing - only use info from transcript
- Simple 10th-grade language
- Be confident, not uncertain`;
  } else {
    return `You are a helpful tutor. The video has NO captions, but answer based on the topic.

# Quick Answer
[One clear sentence]

## Simple Explanation
[2-3 short paragraphs explaining the concept simply]

## Example
[Give a concrete example]

VIDEO: ${videoContext.title}
QUESTION: ${userQuestion}

Rules:
- Don't say "it seems" or "probably" - be confident
- Use emojis: 🎯 💡 ✅ 📌
- Under 150 words
- 10th-grade language
- Focus on teaching the concept clearly`;
  }
}