# 🎙️ OmniCall Pro — Enterprise AI Voice Call Center Platform

**OmniCall Pro** is a modern, production-ready, full-stack AI Voice Call Center solution engineered for sub-second, multilingual customer support automation and seamless human supervisor collaboration. Built with **React 19**, **Node.js/Express**, **WebSockets**, and **PostgreSQL**, it integrates bidirectional telephony audio streaming with low-latency LLM intelligence.

---

## 🌟 Key Highlights & Capabilities

- ⚡ **Real-Time Telephony & Audio Streaming:**
  Bi-directional 8kHz μ-law audio streaming powered by **Twilio Media Streams**, **Deepgram STT**, and **ElevenLabs Turbo / Deepgram Aura** ultra-low-latency TTS (<200ms).
- 🧠 **Multilingual LLM Intelligence:**
  Native multilingual reasoning (Urdu, English, Hindi, Arabic, etc.) with pluggable support for **Google Gemini 2.0 Flash**, **Groq (LLaMA-3.3-70B)**, and **OpenAI GPT-4o**.
- 📚 **Dynamic RAG Knowledge Base:**
  Retrieval-Augmented Generation pipeline indexing internal company policies, FAQs, and product catalogs to provide factual, hallucination-free answers.
- 🔄 **Smart Sentiment & Intent Escalation:**
  Automatic real-time sentiment analysis and intent detection. Calls from frustrated or complex customers are instantly routed to the live **Handoff Queue**.
- 🎧 **Supervisor Live Monitoring & Whisper Coaching:**
  Supervisors can listen in on active calls in real time and whisper live advice directly into the agent's headset without the customer hearing.
- 📊 **Executive Analytics & In-Browser Softphone:**
  Comprehensive real-time KPI metrics (CSAT, AHT, First Call Resolution), detailed call transcripts, and an interactive WebRTC Softphone dialer.

---

## 🛠️ Architecture & Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Web Audio API |
| **Backend** | Node.js, Express, TypeScript, WebSockets (`ws`) |
| **Database** | PostgreSQL (with connection pooling) |
| **Telephony** | Twilio Voice & Bi-directional Media Streams |
| **Speech Engines** | Deepgram STT, ElevenLabs Turbo, OpenAI Audio |
| **LLMs** | Google Gemini 2.0 Flash, Groq LLaMA 3.3, OpenAI GPT-4o |

---

## 📂 Project Structure

```
AI-Voice-Call-Center/
├── server/                    # Node.js backend & WebSocket server
│   ├── src/
│   │   ├── db/                # PostgreSQL schema & pool
│   │   ├── middleware/        # JWT Authentication
│   │   ├── routes/            # REST API (calls, agents, twilio, handoff, docs)
│   │   ├── services/          # AI, AudioStream, RAG, Escalation services
│   │   └── index.ts           # Server entry point
│   ├── .env.example           # Backend environment template
│   └── package.json
├── src/                       # React 19 Frontend
│   ├── components/            # Modals (ActiveCall, Dialer, Coaching)
│   ├── context/               # Softphone & Auth contexts
│   ├── pages/                 # Dashboard, Live Calls, Analytics, Queue, etc.
│   └── App.tsx
├── .env.example               # Frontend environment template
├── .gitignore                 # Strict security ignore rules
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v20+ recommended
- **PostgreSQL**: Local or Cloud instance (Neon, Supabase, Render)
- **Twilio Account** *(Optional for live phone calls)*

### 1. Backend Setup
```bash
cd server
npm install
cp .env.example .env
# Edit .env with your PostgreSQL credentials & API keys
npm run dev
```

### 2. Frontend Setup
```bash
# In the root directory:
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173` to access the dashboard.

---

## 🔒 Security & Privacy
All sensitive API keys and secrets (`.env`) are strictly ignored via `.gitignore`. Always use `.env.example` as a reference when deploying.

---

## 📄 License
This project is licensed under the MIT License.
