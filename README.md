# 🎓 LectureLens — Context-Aware YouTube Lecture Assistant

**LectureLens** is a Chrome Extension that lets you ask questions while watching YouTube lectures and get instant AI explanations — without leaving the video.

While watching a lecture, instructors often jump between steps, formulas, or concepts. Many times you pause and think:

> *"Wait… where did this come from?"*

Usually, this means:
- Pausing the video
- Searching online or taking screenshots
- Losing your learning flow

LectureLens solves this by providing **context-aware answers directly inside YouTube**, based on what the lecturer was explaining around your current timestamp.

---

## ✨ Features

- 💬 Ask questions while watching any YouTube lecture
- 🧠 Context-based answers using the lecture transcript
- 🕒 Clickable timestamps that jump the video to relevant moments
- ⚡ Fast responses (2–5 seconds) using Groq — Llama 3.3 70B
- 👁️ Vision fallback — analyzes the video frame if no transcript is available
- 🧵 Conversation memory for natural follow-up questions
- 🎯 Smart context windowing — uses ~3 minutes of transcript around your current position
- 🔍 Question type detection — "where did this come from?" automatically fetches earlier context

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Extension | Chrome Extension (Manifest V3) |
| Backend | Node.js + Express |
| AI — Text | [Groq API](https://console.groq.com) — Llama 3.3 70B Versatile |
| AI — Vision | Google Gemini Flash |
| Transcript | yt-dlp |
| Language | JavaScript |

---

## 📂 Project Structure

```
lecture-lens/
├── extension/
│   ├── manifest.json       # Chrome extension config & permissions
│   ├── popup.html          # Extension UI
│   ├── popup.js            # UI logic, transcript fetching, conversation history
│   ├── popup.css           # Response formatting & styles
│   └── content.js          # YouTube page interaction & frame capture
│
└── server/
    ├── server.js           # Express backend — AI calls & transcript processing
    ├── package.json
    └── .env                # API keys (never commit this)
```

---

## ⚙️ Setup & Installation

### Prerequisites

- Node.js v18+
- Python + pip
- Google Chrome
- API keys for [Groq](https://console.groq.com) and [Google AI Studio](https://aistudio.google.com)

---

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/lecture-lens.git
cd lecture-lens
```

### 2. Install Backend Dependencies

```bash
cd server
npm install
pip install yt-dlp
```

Create a `.env` file inside the `server/` folder:

```env
GROQ_API_KEY=your_groq_api_key
GOOGLE_API_KEY=your_google_api_key
```

Create the temp folder for transcript processing:

```bash
# Windows
mkdir C:\tmp

# Mac / Linux
mkdir /tmp/lecturelens
```

Start the backend server:

```bash
npm start
# Runs at http://localhost:5001
```

### 3. Load the Chrome Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer Mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `extension/` folder

### 4. Use It

1. Open any YouTube lecture
2. Click the 🎓 LectureLens icon in your Chrome toolbar
3. Type your question
4. Get a clear, context-aware explanation with clickable timestamps

---

## 💡 How It Works

```
You ask a question at timestamp 14:32
        ↓
Extension fetches the video transcript via yt-dlp (cached after first fetch)
        ↓
Finds the relevant ~3 minute window around your current position
        ↓
Sends: question + transcript context + video title + timestamp → Groq AI
        ↓
AI returns a clear explanation with references like "At 12:15..."
        ↓
Timestamps become clickable links — click to seek the video instantly
```

If no transcript exists, the extension captures the current video frame and sends it to **Gemini Vision** for visual analysis instead.

---

## ⚠️ Known Limitations

- Requires the local backend server to be running
- First question on a new video takes ~8–10 seconds (yt-dlp fetches transcript). All follow-up questions are 2–3 seconds due to caching
- Works best on videos that have captions or auto-generated subtitles

---

## 🔮 Possible Future Improvements

- [ ] Host the backend so no local server is needed
- [ ] Export Q&A session as study notes
- [ ] Suggested questions based on current lecture segment
- [ ] Support for other platforms (Coursera, university lecture recordings)
- [ ] Support for non-English lectures

---

## 🙋 About

Built by a IT student who kept getting distracted while studying engineering concepts on YouTube at 3am.

This is a personal project built to solve a real problem — not just a tutorial clone.

---

## 📄 License

MIT — free to use, fork, and improve.