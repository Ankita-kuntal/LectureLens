console.log("✅ LectureLens loaded");

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
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }
  if (request.type === "SEEK_TO") {
    const video = document.querySelector("video");
    if (video) video.currentTime = request.time;
    return true;
  }
});

async function getVideoContext() {
  const video = document.querySelector("video");
  if (!video) throw new Error("No video found");

  const currentTime = Math.floor(video.currentTime);
  const videoTitle = document.querySelector("h1.ytd-watch-metadata yt-formatted-string")?.innerText || document.title.replace(" - YouTube", "");
  const videoId = new URLSearchParams(window.location.search).get("v");
  if (!videoId) throw new Error("No video ID");

  const visualFrames = await captureFrame(video);

  return {
    videoId,
    title: videoTitle,
    currentTime,
    currentTimeFormatted: formatTime(currentTime),
    transcript: null, // popup.js handles transcript now
    visualFrames
  };
}

async function captureFrame(video) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(video.videoWidth || 1280, 1280);
  canvas.height = Math.min(video.videoHeight || 720, 720);
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return [{
    timestamp: formatTime(Math.floor(video.currentTime)),
    timeSeconds: video.currentTime,
    label: "now",
    image: canvas.toDataURL('image/jpeg', 0.4)
  }];
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}