# 🎓 LectureLens — Context-Aware YouTube Lecture Assistant

**LectureLens** is a Chrome Extension that lets you ask questions while watching YouTube lectures and get instant AI explanations — without leaving the video.

While watching a lecture, instructors often jump between steps, formulas, or concepts. Many times you pause and think:

> *“Wait… where did this come from?”*

Usually, this means:
- Pausing the video  
- Searching online or taking screenshots  
- Losing your learning flow  

LectureLens solves this by providing **context-aware answers directly inside YouTube**, based on what the lecturer was explaining around your current timestamp.

---

## ✨ Features

- 💬 Ask questions while watching any YouTube lecture  
- 🧠 Context-based answers using the lecture transcript  
- 🕒 Clickable timestamps to jump to relevant moments  
- ⚡ Fast responses (2–5 seconds) using Groq (Llama 3.3 70B)  
- 👁️ Vision fallback — analyzes video frame if transcript is unavailable  
- 🧵 Conversation memory for follow-up questions  
- 🎯 Smart context windowing (uses ~3 minutes around current time)

---

## 🛠️ Tech Stack

| Layer | Technology |
|------|------------|
| Extension | Chrome Extension (Manifest V3) |
| Backend | Node.js + Express |
| AI (Text) | Groq API — Llama 3.3 70B |
| AI (Vision) | Google Gemini Flash |
| Transcript | yt-dlp |
| Language | JavaScript |

---

## 📂 Project Structure
lecture-lens/
├── extension/
│ ├── manifest.json
│ ├── popup.html
│ ├── popup.js
│ ├── popup.css
│ └── content.js
│
└── server/
├── server.js
├── package.json
└── .env

---

## ⚙️ Setup & Installation

### Prerequisites

- Node.js (v18+)
- Python installed
- Google Chrome
- API keys for:
  - Groq
  - Google AI Studio

---

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/lecture-lens.git
cd lecture-lens

```bash
2. Install Backend Dependencies
cd server
npm install
pip install yt-dlp

Create a .env file inside the server/ folder:

GROQ_API_KEY=your_groq_api_key
GOOGLE_API_KEY=your_google_api_key

Start the backend:

npm start

Server will run at:
http://localhost:5001

3. Load the Chrome Extension

Open Chrome and go to:
chrome://extensions

Enable Developer Mode (top right)

Click Load unpacked

Select the extension/ folder

4. How to Use

Open any YouTube lecture

Click the LectureLens extension icon

Type your question

Get a context-aware explanation with clickable timestamps

