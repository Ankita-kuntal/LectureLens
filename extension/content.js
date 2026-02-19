console.log("✅ LectureLens loaded on YouTube");

// Listen for requests from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_VIDEO_CONTEXT") {
    
    (async () => {
      try {
        const videoInfo = await getVideoContext();
        sendResponse({ success: true, data: videoInfo });
      } catch (error) {
        console.error("Error getting context:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    return true; // Keep channel open for async response
  }
});

async function getVideoContext() {
  // 1. Get basic video info
  const video = document.querySelector("video");
  if (!video) {
    throw new Error("No video found on page");
  }
  
  const currentTime = Math.floor(video.currentTime);
  const videoTitle = document.querySelector("h1.ytd-video-primary-info-renderer")?.innerText 
                     || document.title.replace(" - YouTube", "");
  
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get("v");
  
  if (!videoId) {
    throw new Error("Could not find video ID");
  }
  
  // 2. Fetch transcript using youtube-transcript-api alternative
  const transcript = await fetchYouTubeTranscript(videoId);
  
  // 3. Get relevant context (±2 minutes around current timestamp)
  const contextWindow = 120; // 2 minutes in seconds
  const relevantTranscript = getRelevantTranscript(transcript, currentTime, contextWindow);
  
  return {
    videoId: videoId,
    title: videoTitle,
    currentTime: currentTime,
    currentTimeFormatted: formatTime(currentTime),
    fullTranscript: transcript,
    contextTranscript: relevantTranscript
  };
}

// ✅ FIXED: Proper YouTube transcript fetching
async function fetchYouTubeTranscript(videoId) {
  try {
    // Use YouTube's internal API (more reliable)
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();
    
    // Extract captions from ytInitialPlayerResponse
    const captionsRegex = /"captions":(\{.*?"playerCaptionsTracklistRenderer".*?\})/;
    const match = html.match(captionsRegex);
    
    if (!match) {
      throw new Error("No captions available for this video");
    }
    
    const captionsData = JSON.parse(match[1]);
    const captionTracks = captionsData.playerCaptionsTracklistRenderer.captionTracks;
    
    if (!captionTracks || captionTracks.length === 0) {
      throw new Error("No caption tracks found");
    }
    
    // Get first available caption (usually auto-generated or English)
    const captionUrl = captionTracks[0].baseUrl;
    
    // Fetch the actual transcript
    const transcriptResponse = await fetch(captionUrl);
    const transcriptXML = await transcriptResponse.text();
    
    // Parse XML to extract text
    return parseTranscriptXML(transcriptXML);
    
  } catch (error) {
    console.error("Transcript fetch error:", error);
    return null;
  }
}

function parseTranscriptXML(xml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const textElements = doc.getElementsByTagName("text");
  
  const transcript = [];
  
  for (let elem of textElements) {
    const start = parseFloat(elem.getAttribute("start"));
    const duration = parseFloat(elem.getAttribute("dur"));
    const text = elem.textContent
      .replace(/&amp;#39;/g, "'")
      .replace(/&amp;quot;/g, '"')
      .replace(/&amp;/g, "&");
    
    transcript.push({
      start: start,
      end: start + duration,
      text: text
    });
  }
  
  return transcript;
}

function getRelevantTranscript(transcript, currentTime, windowSize) {
  if (!transcript || transcript.length === 0) {
    return "No transcript available";
  }
  
  const startTime = Math.max(0, currentTime - windowSize);
  const endTime = currentTime + windowSize;
  
  const relevant = transcript.filter(item => 
    item.start >= startTime && item.start <= endTime
  );
  
  return relevant.map(item => 
    `[${formatTime(item.start)}] ${item.text}`
  ).join("\n");
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}