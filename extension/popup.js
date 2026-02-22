const questionInput = document.getElementById("question");
const askBtn = document.getElementById("askBtn");
const responseBox = document.getElementById("response");
const statusBox = document.getElementById("status");
let conversationHistory = [];

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (!tab.url.includes("youtube.com/watch")) {
    statusBox.textContent = "⚠️ Please open a YouTube video first";
    statusBox.style.background = "#fff3cd";
    askBtn.disabled = true;
  }
});

askBtn.addEventListener("click", handleAsk);
questionInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); }
});

async function fetchTranscriptFromPage(tabId) {
  try {
    // Get videoId from tab
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => new URLSearchParams(window.location.search).get('v')
    });
    const videoId = results?.[0]?.result;
    if (!videoId) return null;

    console.log("📝 Fetching transcript from server for:", videoId);
    const resp = await fetch(`http://localhost:5001/transcript/${videoId}`);
    const data = await resp.json();
    
    console.log("📝 Transcript:", data.success ? "✅ got it!" : "❌ failed");
    return data.success ? data.transcript : null;
  } catch(e) {
    console.log("Transcript failed:", e.message);
    return null;
  }
}

async function handleAsk() {
  const question = questionInput.value.trim();
  if (!question) return;

  conversationHistory.push({ role: "user", content: question });

  const startTime = Date.now();
  askBtn.disabled = true;
  askBtn.textContent = "Processing...";
  responseBox.innerHTML = "";
  statusBox.textContent = "Getting context...";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab.url.includes("youtube.com/watch")) throw new Error("Please open a YouTube video");

    await ensureContentScriptLoaded(tab.id);

    // Get video context (frames + metadata)
    const contextResponse = await chrome.tabs.sendMessage(tab.id, { type: "GET_VIDEO_CONTEXT" });
    if (!contextResponse.success) throw new Error(contextResponse.error);
    const videoContext = contextResponse.data;

    // Get transcript from page context
    statusBox.textContent = "Fetching transcript...";
    const transcript = await fetchTranscriptFromPage(tab.id);
    console.log("📝 Transcript:", transcript ? JSON.parse(transcript).length + " chunks" : "NULL");

    if (transcript) {
      statusBox.textContent = "Analyzing (fast mode)...";
      statusBox.style.background = "#d1fae5";
    } else {
      statusBox.textContent = "Analyzing visuals...";
      statusBox.style.background = "#fef3c7";
    }

    const backendResponse = await fetch("http://localhost:5001/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        conversationHistory: conversationHistory.slice(-6),
        videoInfo: {
          title: videoContext.title,
          timestamp: videoContext.currentTimeFormatted,
          videoId: videoContext.videoId
        },
        transcript,
        visualFrames: videoContext.visualFrames
      })
    });

    const data = await backendResponse.json();
    if (!data.success) throw new Error(data.error);

    conversationHistory.push({ role: "assistant", content: data.answer });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    statusBox.textContent = `Answer (${elapsed}s)`;
    statusBox.style.background = "#d1fae5";
    responseBox.innerHTML = formatResponse(data.answer);
    addTimestampClickHandlers(tab.id);
    questionInput.value = "";

  } catch (error) {
    console.error("Error:", error);
    statusBox.textContent = "Error";
    statusBox.style.background = "#fee";
    responseBox.innerHTML = `<p style="color:#d00;padding:20px">${error.message}</p>`;
  } finally {
    askBtn.disabled = false;
    askBtn.textContent = "Ask with Context";
  }
}

async function ensureContentScriptLoaded(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await new Promise(r => setTimeout(r, 300));
  }
}

function formatResponse(text) {
  if (!text) return "";
  let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/^\- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/\b([Aa]t\s+)(\d{1,2}):(\d{2})\b/g, (_, prefix, mins, secs) => {
    const t = parseInt(mins) * 60 + parseInt(secs);
    return `${prefix}<a href="#" class="timestamp-link" data-time="${t}">${mins}:${secs}</a>`;
  });
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  return html;
}

function addTimestampClickHandlers(tabId) {
  responseBox.querySelectorAll('.timestamp-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const time = parseInt(e.target.dataset.time);
      await chrome.tabs.sendMessage(tabId, { type: "SEEK_TO", time });
      statusBox.textContent = `⏪ Jumped to ${e.target.textContent}`;
      setTimeout(() => { statusBox.textContent = "Answer"; }, 2000);
    });
  });
}