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
  
  const startTime = Date.now();
  
  askBtn.disabled = true;
  askBtn.textContent = "Processing...";
  responseBox.innerHTML = "";
  statusBox.textContent = "Getting video context...";
  
  try {
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
    
    // UPDATE: Better status messages
    if (videoContext.transcript && videoContext.transcript.length > 0) {
      statusBox.textContent = "Analyzing (fast mode - 3s)...";
      statusBox.style.background = "#d1fae5"; // Green - fast
    } else if (videoContext.visualFrames && videoContext.visualFrames.length > 0) {
      statusBox.textContent = "Analyzing visuals (this may take 15s)...";
      statusBox.style.background = "#fef3c7"; // Yellow - warning slow
    } else {
      statusBox.textContent = "Generating answer...";
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
      throw new Error(data.error || "Backend error");
    }
    
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    statusBox.textContent = `Answer (${elapsedTime}s)`;
    statusBox.style.background = "#d1fae5";
    
    responseBox.innerHTML = formatResponse(data.answer);
    addTimestampClickHandlers(tab.id);
    
    questionInput.value = "";
    
  } catch (error) {
    console.error("Error:", error);
    statusBox.textContent = "Error";
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
  
  // Convert markdown headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  
  // Convert **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Convert bullet points
  html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Convert timestamps to clickable links
  // Matches: "At 2:30", "at 1:45", etc.
  html = html.replace(/([Aa]t |earlier at |later at |shown at )(\d+):(\d+)/g, (match, prefix, mins, secs) => {
    const totalSeconds = parseInt(mins) * 60 + parseInt(secs);
    return `${prefix}<a href="#" class="timestamp-link" data-time="${totalSeconds}">${mins}:${secs}</a>`;
  });
  
  // Match "Frame X" references
  html = html.replace(/Frame (\d+)/gi, '<span class="frame-ref">Frame $1</span>');
  
  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  
  // Code blocks
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  return html;
}

function addTimestampClickHandlers(tabId) {
  const timestampLinks = responseBox.querySelectorAll('.timestamp-link');
  
  timestampLinks.forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const time = parseInt(e.target.dataset.time);
      
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: "SEEK_TO",
          time: time
        });
        
        statusBox.textContent = `⏪ Rewound to ${e.target.textContent}`;
        statusBox.style.background = "#e0e7ff";
        
        setTimeout(() => {
          statusBox.textContent = "✅ Answer:";
          statusBox.style.background = "#d1fae5";
        }, 2000);
        
      } catch (error) {
        console.error("Failed to seek:", error);
      }
    });
  });
}