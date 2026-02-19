const questionInput = document.getElementById("question");
const askBtn = document.getElementById("askBtn");
const responseBox = document.getElementById("response");
const statusBox = document.getElementById("status");

let currentTabId = null;

// Check if on YouTube
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  currentTabId = tab.id;
  if (!tab.url.includes("youtube.com/watch")) {
    statusBox.textContent = "⚠️ Please open a YouTube video first";
    statusBox.style.background = "#fff3cd";
    askBtn.disabled = true;
  }
});

askBtn.addEventListener("click", handleAsk);

questionInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleAsk();
  }
});

async function handleAsk() {
  const question = questionInput.value.trim();
  
  if (!question) {
    alert("Please enter a question!");
    return;
  }
  
  askBtn.disabled = true;
  askBtn.textContent = "⏳ Processing...";
  responseBox.innerHTML = "";
  statusBox.textContent = "🔍 Analyzing video...";
  statusBox.style.background = "#f0f4ff";
  
  try {
    statusBox.textContent = "📹 Getting video context...";
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes("youtube.com/watch")) {
      throw new Error("Please open this extension on a YouTube video page");
    }
    
    await ensureContentScriptLoaded(tab.id);
    
    const contextResponse = await chrome.tabs.sendMessage(tab.id, { 
      type: "GET_VIDEO_CONTEXT" 
    });
    
    if (!contextResponse.success) {
      throw new Error(contextResponse.error || "Failed to get video context");
    }
    
    const videoContext = contextResponse.data;
    console.log("Video context:", videoContext);
    
    if (videoContext.transcript) {
      statusBox.textContent = "🤖 Asking AI (using transcript)...";
    } else if (videoContext.visualFrames) {
      statusBox.textContent = "👁️ Asking AI (analyzing frames)...";
    } else {
      statusBox.textContent = "🧠 Asking AI (general knowledge)...";
    }
    
    const backendResponse = await fetch("http://localhost:5001/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        videoInfo: {
          title: videoContext.title,
          timestamp: videoContext.currentTimeFormatted,
          videoId: videoContext.videoId
        },
        transcript: videoContext.transcript,
        visualFrames: videoContext.visualFrames
      })
    });
    
    const data = await backendResponse.json();
    
    if (!data.success) {
      throw new Error(data.error || "Backend returned an error");
    }
    
    statusBox.textContent = `✅ Answer (at ${videoContext.currentTimeFormatted}):`;
    statusBox.style.background = "#d1fae5";
    
    responseBox.innerHTML = formatResponse(data.answer);
    
    questionInput.value = "";
    
  } catch (error) {
    console.error("Error:", error);
    statusBox.textContent = "❌ Error";
    statusBox.style.background = "#fee";
    responseBox.innerHTML = `<p style="color: #d00; padding: 20px;">${error.message}</p>`;
  } finally {
    askBtn.disabled = false;
    askBtn.textContent = "Ask with Context";
  }
}

async function ensureContentScriptLoaded(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch (error) {
    console.log("Injecting content script...");
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });
    await new Promise(resolve => setTimeout(resolve, 300));
  }
}

function formatResponse(text) {
  if (!text) return "";
  
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  return html;
}