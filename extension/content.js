console.log("LectureLens content script loaded");

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "GET_VIDEO_INFO") {

        (async () => {
            const video = document.querySelector("video");

            // Get timestamp
            const timestamp = video ? video.currentTime : 0;

            // Get title
            const title = document.title.replace(" - YouTube", "");

            // Get video ID
            const urlParams = new URLSearchParams(window.location.search);
            const videoId = urlParams.get("v");

            // Fetch transcript
            const transcript = await fetchTranscript(videoId);

            sendResponse({
                timestamp: timestamp,
                title: title,
                videoId: videoId,
                transcript: transcript
            });
        })();

        return true; // VERY IMPORTANT for async
    }
});

async function fetchTranscript(videoId) {
    try {
        // Step 1: Get caption list
        const listUrl = `https://video.google.com/timedtext?type=list&v=${videoId}`;
        const listResponse = await fetch(listUrl);
        const listText = await listResponse.text();

        console.log("Caption list:", listText);

        // Step 2: Find language code from list
        const parser = new DOMParser();
        const xml = parser.parseFromString(listText, "text/xml");
        const tracks = xml.getElementsByTagName("track");

        if (tracks.length === 0) {
            return null; // No captions available
        }

        // Take the first available track
        const lang = tracks[0].getAttribute("lang_code");

        // Step 3: Fetch transcript using that language
        const transcriptUrl = `https://video.google.com/timedtext?lang=${lang}&v=${videoId}`;
        const transcriptResponse = await fetch(transcriptUrl);
        const transcriptText = await transcriptResponse.text();

        return transcriptText;

    } catch (error) {
        console.error("Transcript error:", error);
        return null;
    }
}