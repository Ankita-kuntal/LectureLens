# 🎓 LectureLens

Ask questions about YouTube lectures and get instant, context-aware answers powered by AI!

## ✨ Features

- **📝 Transcript Analysis**: For videos with captions, analyzes the actual spoken content
- **👁️ Vision AI**: For videos without captions, captures and analyzes what's on screen
- **🧠 Smart Fallback**: Even without context, provides helpful conceptual explanations
- **⚡ Fast Responses**: Answers in 2-5 seconds
- **🎯 Context-Aware**: Understands what's happening at your current timestamp

## 🎥 Demo

[Add screenshot or GIF here]

## 🚀 How It Works

1. **Watch any YouTube video**
2. **Pause when confused**
3. **Click the LectureLens extension**
4. **Ask your question**
5. **Get an instant, detailed answer!**

## 🛠️ Tech Stack

- **Frontend**: Chrome Extension (Manifest V3)
- **Backend**: Node.js + Express
- **AI Models**:
  - Groq (Llama 3.3 70B) - Text analysis
  - Google Gemini 2.5 Flash - Vision analysis
- **APIs**: YouTube Data API v3

## 📦 Installation

### For Users (Chrome Web Store)
Coming soon!

### For Developers

1. Clone the repository:
```bash
git clone https://github.com/Ankita-kuntal/LectureLens.git
cd LectureLens
```

2. Set up the backend:
```bash
cd server
npm install
```

3. Create `.env` file with your API keys:
```env
GROQ_API_KEY=your_groq_key
GOOGLE_API_KEY=your_google_ai_key
YOUTUBE_API_KEY=your_youtube_key
PORT=5001
```

4. Start the backend:
```bash
npm start
```

5. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension` folder

## 🔑 Getting API Keys

All keys are **FREE** for personal use:

- **Groq**: https://console.groq.com/keys
- **Google AI Studio**: https://aistudio.google.com/app/apikey
- **YouTube Data API**: https://console.cloud.google.com/apis/credentials

## 📖 Usage Examples

**Question**: "What data structure is this?"
**Answer**: Looking at the code on screen, this is a **Dictionary** in Python. It uses curly braces {} and stores key-value pairs...

**Question**: "How did they get 0.95?"
**Answer**: Based on the formula visible at 3:58, the 0.95 represents the probability of success in this binomial distribution...

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## 📄 License

MIT License

## 👤 Author

**Ankita Kuntal**
- GitHub: [@Ankita-kuntal](https://github.com/Ankita-kuntal)

## 🙏 Acknowledgments

- Groq for lightning-fast AI inference
- Google for Gemini Vision AI
- YouTube for the Data API

---

**Built with ❤️ for students everywhere**