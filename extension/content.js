console.log("✅ LectureLens v2.1 (ULTRA FAST) loaded");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "PING") {
    sendResponse({ status: "ok" });
    return true;
  }
  
  if (request.type === "GET_VIDEO_CONTEXT") {
    (async () => {
      try {
        const context = await getVideoContext();
        sendResponse({ success: true, data: context });
      } catch (error) {
        console.error("❌ Error:", error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  
  if (request.type === "SEEK_TO") {
    const video = document.querySelector("video");
    if (video) {
      video.currentTime = request.time;
      console.log(`⏪ Seeked to ${request.time}s`);
    }
    return true;
  }
});

async function getVideoContext() {
  console.log("🔍 Getting video context...");
  
  const video = document.querySelector("video");
  if (!video) {
    throw new Error("No video found on this page");
  }
  
  const currentTime = Math.floor(video.currentTime);
  const duration = Math.floor(video.duration);
  
  const videoTitle = 
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.innerText ||
    document.querySelector("h1.ytd-video-primary-info-renderer")?.innerText ||
    document.title.replace(" - YouTube", "");
  
  const urlParams = new URLSearchParams(window.location.search);
  const videoId = urlParams.get("v");
  
  if (!videoId) {
    throw new Error("Could not find video ID");
  }
  
  console.log(`📹 Video: ${videoTitle}`);
  console.log(`⏱️  Time: ${formatTime(currentTime)}`);
  
  // Fetch transcript and capture frames in PARALLEL for speed
  const [transcript, visualFrames] = await Promise.all([
    fetchTranscript(videoId),
    captureVideoFramesFast(video) // FASTER VERSION - ONLY 1 FRAME
  ]);
  
  return {
    videoId,
    title: videoTitle,
    currentTime,
    duration,
    currentTimeFormatted: formatTime(currentTime),
    transcript,
    visualFrames
  };
}

async function fetchTranscript(videoId) {
  try {
    console.log("📝 Fetching transcript...");
    const response = await fetch(`http://localhost:5001/transcript/${videoId}`);
    const data = await response.json();
    
    if (data.success && data.transcript) {
      console.log("✅ Transcript fetched");
      return data.transcript;
    } else {
      console.log("⚠️ No transcript available");
      return null;
    }
  } catch (error) {
    console.log("⚠️ Transcript fetch failed:", error.message);
    return null;
  }
}

// ULTRA FAST - ONLY CAPTURE CURRENT FRAME (2-3 seconds total)
async function captureVideoFramesFast(video) {
  console.log("📸 Starting ULTRA FAST frame capture (1 frame only)...");
  
  const frames = [];
  
  // Wait briefly for video to be ready
  if (video.readyState < 2 || video.videoWidth === 0) {
    console.log("⏳ Waiting for video...");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    console.error("❌ Canvas failed");
    return frames;
  }
  
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  
  const currentTime = video.currentTime;
  
  try {
    console.log("🎨 Capturing CURRENT frame only...");
    
    // Just capture current frame - NO SEEKING (instant!)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.3); // Even lower quality for speed
    
    frames.push({
      timestamp: formatTime(currentTime),
      timeSeconds: currentTime,
      label: "now",
      image: dataUrl
    });
    
    console.log(`✅ Frame captured: ${(dataUrl.length / 1024).toFixed(0)}KB`);
    
  } catch (error) {
    console.error("❌ Capture failed:", error);
  }
  
  console.log(`📸 Total: ${frames.length} frame (ULTRA FAST)`);
  return frames;
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}