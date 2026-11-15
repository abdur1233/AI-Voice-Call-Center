import { useEffect, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Info,
  LogOut,
  Mail,
  Mic,
  MicOff,
  Phone,
  Play,
  Send,
  Server,
  Shield,
  Sparkles,
  User,
  Volume2,
} from "lucide-react";
import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useLanguage, SUPPORTED_LANGUAGES, type LanguageCode } from "../LanguageContext";

type ConfigStatus = {
  twilioConfigured: boolean;
  openaiConfigured: boolean;
  geminiConfigured?: boolean;
  groqConfigured?: boolean;
  activeAiProvider?: string;
  twilioPhoneNumber: string | null;
  webhooks: {
    voiceIncomingUrl: string;
    voiceStatusUrl: string;
  };
};

export default function SettingsPage() {
  const { agent, logout } = useAuth();
  const { currentLang, setLanguage } = useLanguage();
  const navigate = useNavigate();
  const [config, setConfig] = useState<ConfigStatus | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Playground state
  const [testQuery, setTestQuery] = useState("");
  const [testLang, setTestLang] = useState<string>("auto");
  const [testResult, setTestResult] = useState<{
    replyText: string;
    sentiment: string;
    detectedLanguage: string;
    usedRealLlm: boolean;
  } | null>(null);
  const [testLoading, setTestLoading] = useState(false);
  const [isTestMicActive, setIsTestMicActive] = useState(false);

  useEffect(() => {
    api<{ success: boolean } & ConfigStatus>("/api/twilio/config-status")
      .then((res) => setConfig(res))
      .catch((err) => console.error(err));
  }, []);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  const playSpeech = (text: string, lang: string) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const target = lang.toLowerCase();

    const voice = voices.find((v) => {
      const vl = v.lang.toLowerCase();
      if (target.startsWith("ur")) return vl.includes("ur") || vl.includes("hi");
      if (target.startsWith("hi")) return vl.includes("hi");
      if (target.startsWith("ar")) return vl.includes("ar");
      if (target.startsWith("es")) return vl.includes("es");
      if (target.startsWith("fr")) return vl.includes("fr");
      return vl.startsWith("en");
    });

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  };

  const handleTestAi = async (promptToSend?: string) => {
    const query = (promptToSend || testQuery).trim();
    if (!query || testLoading) return;
    setTestLoading(true);

    try {
      const res = await api<{
        success: boolean;
        replyText: string;
        sentiment: string;
        detectedLanguage: string;
        usedRealLlm: boolean;
      }>("/api/calls/test-ai", {
        method: "POST",
        body: { message: query, language: testLang },
      });

      setTestResult(res);
      playSpeech(res.replyText, res.detectedLanguage || testLang);
    } catch (err) {
      console.error(err);
    } finally {
      setTestLoading(false);
    }
  };

  const toggleTestMic = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Microphone recognition not supported in this browser.");
      return;
    }

    if (isTestMicActive) {
      setIsTestMicActive(false);
    } else {
      const recognition = new SpeechRecognition();
      recognition.lang = testLang === "auto" ? "en-US" : testLang;
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (e: any) => {
        const spoken = e.results[0][0].transcript;
        if (spoken) {
          setTestQuery(spoken);
          handleTestAi(spoken);
        }
        setIsTestMicActive(false);
      };
      recognition.onerror = () => setIsTestMicActive(false);
      recognition.onend = () => setIsTestMicActive(false);

      setIsTestMicActive(true);
      recognition.start();
    }
  };

  return (
    <>
      <div className="welcome-row">
        <div>
          <h2>Settings &amp; Integrations</h2>
          <p>
            Configure Multilingual AI Intelligence, telephony webhooks, and test
            voice answering in real-time.
          </p>
        </div>
      </div>

      <div className="settings-grid-layout">
        {/* ACCOUNT PROFILE */}
        <section className="panel settings-card">
          <div className="settings-card-header">
            <h3>
              <User size={18} /> Admin Profile
            </h3>
          </div>
          <div className="settings-row">
            <User size={18} />
            <div>
              <span>Full name</span>
              <strong>{agent?.name}</strong>
            </div>
          </div>
          <div className="settings-row">
            <Mail size={18} />
            <div>
              <span>Email Address</span>
              <strong>{agent?.email}</strong>
            </div>
          </div>
          <div className="settings-row">
            <Shield size={18} />
            <div>
              <span>Role</span>
              <strong style={{ textTransform: "capitalize" }}>
                {agent?.role}
              </strong>
            </div>
          </div>

          <div className="settings-row">
            <Globe size={18} />
            <div>
              <span>Portal Display Language</span>
              <select
                value={currentLang}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                className="portal-lang-select"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.flag} {l.name} ({l.nativeName})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button className="danger-button" onClick={handleLogout}>
            <LogOut size={17} /> Log out
          </button>
        </section>

        {/* AI LLM & MULTILINGUAL CORE */}
        <section className="panel settings-card">
          <div className="settings-card-header">
            <h3>
              <Sparkles size={18} /> Multilingual AI Voice Core
            </h3>
            <span className="integration-badge connected">
              <span className="dot" />
              Online &amp; Active
            </span>
          </div>

          <p className="settings-card-desc">
            Universal intelligence engine answering customer inquiries across
            any domain in Urdu, English, Hindi, Arabic, Spanish, and French.
          </p>

          <div className="integration-info-box">
            <div className="info-item">
              <span>Active Engine Provider:</span>
              <strong className="engine-name">
                {config?.activeAiProvider ||
                  "Built-in Universal Multilingual Intelligence Engine"}
              </strong>
            </div>
            <div className="info-item">
              <span>Dual-Brain Architecture:</span>
              <strong>Knowledge Base Grounding + Universal World Intelligence</strong>
            </div>
            <div className="info-item">
              <span>Supported Languages:</span>
              <strong>اردو (Urdu), English, हिन्दी (Hindi), العربية (Arabic), Español, Français</strong>
            </div>
          </div>

          <div className="setup-hint">
            <Info size={16} />
            <span>
              Supports <strong>Google Gemini (Free)</strong>, <strong>Groq Llama 3</strong>, and{" "}
              <strong>OpenAI GPT-4o</strong>. Keys can be set in <code>server/.env</code>.
              Even without any API key, the built-in Universal Intelligence Engine will
              accurately answer general questions, science, math, and support in all languages!
            </span>
          </div>
        </section>

        {/* INTERACTIVE VOICE TEST PLAYGROUND */}
        <section className="panel settings-card settings-wide-card playground-card">
          <div className="settings-card-header">
            <h3>
              <Bot size={18} /> Universal AI Voice Answering Playground
            </h3>
            <span className="playground-pill">Test Any Question in Any Language</span>
          </div>
          <p className="settings-card-desc">
            Ask the AI anything — whether written in the Knowledge Base or general
            world knowledge (science, math, history, daily questions, customer care).
            The AI will formulate the exact answer and speak it out in voice!
          </p>

          <div className="playground-quick-chips">
            <span className="chips-label">Sample Questions:</span>
            <button
              type="button"
              className="chip-btn"
              onClick={() => {
                setTestQuery("Aap kis cheez ma madad kar sakte hain?");
                handleTestAi("Aap kis cheez ma madad kar sakte hain?");
              }}
            >
              🇵🇰 Aap kis cheez ma madad kar sakte hain?
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => {
                setTestQuery("Artificial Intelligence kya hota hai?");
                handleTestAi("Artificial Intelligence kya hota hai?");
              }}
            >
              🇵🇰 AI kya hota hai?
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => {
                setTestQuery("What is the capital of Pakistan?");
                handleTestAi("What is the capital of Pakistan?");
              }}
            >
              🇺🇸 What is the capital of Pakistan?
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => {
                setTestQuery("Calculate 50 + 75");
                handleTestAi("Calculate 50 + 75");
              }}
            >
              🔢 Calculate 50 + 75
            </button>
            <button
              type="button"
              className="chip-btn"
              onClick={() => {
                setTestQuery("भारत की राजधानी क्या है?");
                handleTestAi("भारत की राजधानी क्या है?");
              }}
            >
              🇮🇳 भारत की राजधानी क्या है?
            </button>
          </div>

          <div className="playground-input-row">
            <select
              value={testLang}
              onChange={(e) => setTestLang(e.target.value)}
              className="playground-lang-select"
            >
              <option value="auto">🌐 Auto Detect</option>
              <option value="ur-PK">🇵🇰 اردو (Urdu)</option>
              <option value="en-US">🇺🇸 English</option>
              <option value="hi-IN">🇮🇳 हिन्दी (Hindi)</option>
              <option value="ar-SA">🇸🇦 العربية (Arabic)</option>
            </select>

            <button
              type="button"
              className={`playground-mic-btn ${isTestMicActive ? "active" : ""}`}
              onClick={toggleTestMic}
              title={isTestMicActive ? "Listening..." : "Speak via microphone"}
            >
              {isTestMicActive ? <MicOff size={18} /> : <Mic size={18} />}
            </button>

            <input
              type="text"
              placeholder="Ask anything in Urdu, English, Hindi, Arabic (e.g. 'Pakistan ka capital kya hai?', 'What are your hours?')..."
              value={testQuery}
              onChange={(e) => setTestQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTestAi();
              }}
              className="playground-input"
            />

            <button
              type="button"
              className="primary-button playground-send-btn"
              onClick={() => handleTestAi()}
              disabled={!testQuery.trim() || testLoading}
            >
              {testLoading ? "Thinking..." : <><Send size={16} /> Ask AI</>}
            </button>
          </div>

          {testResult && (
            <div className="playground-result-box">
              <div className="result-header">
                <div className="result-badges">
                  <span className="lang-tag">
                    Detected: {testResult.detectedLanguage?.toUpperCase()}
                  </span>
                  <span className={`sentiment-badge ${testResult.sentiment}`}>
                    {testResult.sentiment} sentiment
                  </span>
                  <span className="provider-tag">
                    {testResult.usedRealLlm ? "Cloud LLM" : "Universal Engine"}
                  </span>
                </div>
                <button
                  type="button"
                  className="replay-speech-btn"
                  onClick={() =>
                    playSpeech(testResult.replyText, testResult.detectedLanguage)
                  }
                  title="Replay Voice Speech"
                >
                  <Volume2 size={16} /> Re-Hear Voice
                </button>
              </div>
              <p className="result-reply-text">"{testResult.replyText}"</p>
            </div>
          )}
        </section>

        {/* TWILIO TELEPHONY INTEGRATION */}
        <section className="panel settings-card settings-wide-card">
          <div className="settings-card-header">
            <h3>
              <Phone size={18} /> Cloud Telephony (Twilio Voice)
            </h3>
            <span
              className={`integration-badge ${
                config?.twilioConfigured ? "connected" : "simulator"
              }`}
            >
              <span className="dot" />
              {config?.twilioConfigured
                ? "Live Telephony Active"
                : "Web Audio Simulator Mode"}
            </span>
          </div>

          <p className="settings-card-desc">
            Connect real mobile phones to your AI Voice Call Center via Twilio Voice
            webhooks with multilingual speech recognition and Polly voices.
          </p>

          <div className="webhook-rows">
            <div className="webhook-row">
              <div className="webhook-info">
                <label>Voice Incoming Webhook URL (HTTP POST):</label>
                <code>{config?.webhooks.voiceIncomingUrl || "Loading..."}</code>
              </div>
              <button
                className="secondary-button copy-btn"
                onClick={() =>
                  config &&
                  handleCopy(
                    config.webhooks.voiceIncomingUrl,
                    "voiceIncoming"
                  )
                }
              >
                {copiedKey === "voiceIncoming" ? (
                  <>
                    <CheckCircle2 size={14} color="#16a34a" /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy
                  </>
                )}
              </button>
            </div>

            <div className="webhook-row">
              <div className="webhook-info">
                <label>Status Callback URL (HTTP POST):</label>
                <code>{config?.webhooks.voiceStatusUrl || "Loading..."}</code>
              </div>
              <button
                className="secondary-button copy-btn"
                onClick={() =>
                  config &&
                  handleCopy(
                    config.webhooks.voiceStatusUrl,
                    "voiceStatus"
                  )
                }
              >
                {copiedKey === "voiceStatus" ? (
                  <>
                    <CheckCircle2 size={14} color="#16a34a" /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={14} /> Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="setup-steps-box">
            <strong>How to receive real mobile calls:</strong>
            <ol>
              <li>Get a phone number on <a href="https://twilio.com" target="_blank" rel="noreferrer">Twilio.com <ExternalLink size={12} /></a>.</li>
              <li>Go to <strong>Phone Numbers &gt; Active Numbers</strong> and click your number.</li>
              <li>Under <strong>"A Call Comes In"</strong>, select <strong>Webhook</strong> and paste the <strong>Voice Incoming Webhook URL</strong> above.</li>
              <li>Add your <code>TWILIO_ACCOUNT_SID</code> and <code>TWILIO_AUTH_TOKEN</code> to <code>server/.env</code>.</li>
            </ol>
          </div>
        </section>

        {/* CLOUD HOSTING & DEPLOYMENT */}
        <section className="panel settings-card settings-wide-card">
          <div className="settings-card-header">
            <h3>
              <Globe size={18} /> Cloud Deployment (Render &amp; Vercel)
            </h3>
          </div>

          <p className="settings-card-desc">
            Your project is fully configured for 1-click cloud deployment.
          </p>

          <div className="deployment-badges-grid">
            <div className="deploy-box">
              <Server size={22} className="deploy-icon" />
              <div>
                <strong>Backend Service</strong>
                <span>Node.js / Express &amp; PostgreSQL on Render</span>
              </div>
            </div>

            <div className="deploy-box">
              <Globe size={22} className="deploy-icon" />
              <div>
                <strong>Frontend Application</strong>
                <span>React 19 + TypeScript + Vite on Vercel / Render</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
