console.log("✅ LectureLens v2.1 loaded");

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
  
  let transcript = null;
  try {
    console.log("📝 Fetching transcript...");
    const response = await fetch(`http://localhost:5001/transcript/${videoId}`);
    const data = await response.json();
    if (data.success && data.transcript) {
      transcript = data.transcript;
      console.log("✅ Transcript fetched");
    } else {
      console.log("⚠️ No transcript available");
    }
  } catch (error) {
    console.log("⚠️ Transcript fetch failed:", error.message);
  }
  
  let visualFrames = null;
  
  // ALWAYS capture frames (for combined analysis or fallback)
  console.log("📸 Capturing video frames across timeline...");
  visualFrames = await captureVideoFrames(video);
  console.log(`✅ Captured ${visualFrames.length} frames`);
  
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

async function captureVideoFrames(video) {
  console.log("📸 captureVideoFrames: Starting extended timeline capture...");
  console.log("📸 Video ready state:", video.readyState);
  console.log("📸 Video dimensions:", video.videoWidth, "x", video.videoHeight);
  
  const frames = [];
  
  // Wait for video to be ready
  if (video.readyState < 2 || video.videoWidth === 0) {
    console.log("⏳ Waiting for video to load...");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    console.error("❌ Failed to get canvas context!");
    return frames;
  }
  
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  
  console.log("📸 Canvas size:", canvas.width, "x", canvas.height);
  
  const currentTime = video.currentTime;
  
  // Capture extended timeline: now, 10s, 20s, 30s, 60s ago
  const timesToCapture = [
    { time: currentTime, label: "now" },
    { time: Math.max(0, currentTime - 10), label: "10s ago" },
    { time: Math.max(0, currentTime - 20), label: "20s ago" },
    { time: Math.max(0, currentTime - 30), label: "30s ago" },
    { time: Math.max(0, currentTime - 60), label: "60s ago" }
  ];
  
  console.log("📸 Timeline points:", timesToCapture.map(t => `${formatTime(t.time)} (${t.label})`).join(", "));
  
  for (let i = 0; i < timesToCapture.length; i++) {
    const { time, label } = timesToCapture[i];
    
    try {
      console.log(`📸 Capturing frame ${i + 1}: ${formatTime(time)} (${label})`);
      
      // Seek to time
      video.currentTime = time;
      
      // Wait for seek
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn(`⚠️ Seek timeout for frame ${i + 1}`);
          resolve();
        }, 1000);
        
        video.onseeked = () => {
          clearTimeout(timeout);
          resolve();
        };
      });
      
      // Extra wait for frame to render
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Draw frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
      
      frames.push({
        timestamp: formatTime(time),
        timeSeconds: time,
        label: label,
        image: dataUrl
      });
      
      console.log(`✅ Frame ${i + 1} captured: ${dataUrl.substring(0, 50)}... (${dataUrl.length} chars)`);
      
    } catch (error) {
      console.error(`❌ Failed to capture frame ${i + 1}:`, error);
    }
  }
  
  // Return to original position
  console.log(`↩️ Returning to original time: ${formatTime(currentTime)}`);
  video.currentTime = currentTime;
  
  console.log(`📸 Total frames captured: ${frames.length}`);
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