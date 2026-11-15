import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Copy,
  Globe,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneOff,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  User,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { api } from "../api";

type Customer = {
  id: number;
  name: string | null;
  phone: string;
};

type Transcript = {
  id: number;
  speaker: string;
  original_text: string;
  original_language?: string;
  sentiment?: string;
  spoken_at?: string;
};

type CallSummary = {
  summary_text: string;
  overall_sentiment: string;
  key_points: string;
};

export type LanguageCode =
  | "auto"
  | "ur-PK"
  | "en-US"
  | "hi-IN"
  | "ar-SA"
  | "es-ES"
  | "fr-FR"
  | "de-DE"
  | "zh-CN";

const LANGUAGE_OPTIONS: { code: LanguageCode; label: string; flag: string }[] = [
  { code: "auto", label: "Auto Detect (خودکار شناخت)", flag: "🌐" },
  { code: "ur-PK", label: "اردو (Urdu / Roman Urdu)", flag: "🇵🇰" },
  { code: "en-US", label: "English (US / Global)", flag: "🇺🇸" },
  { code: "hi-IN", label: "हिन्दी (Hindi)", flag: "🇮🇳" },
  { code: "ar-SA", label: "العربية (Arabic)", flag: "🇸🇦" },
  { code: "es-ES", label: "Español (Spanish)", flag: "🇪🇸" },
  { code: "fr-FR", label: "Français (French)", flag: "🇫🇷" },
  { code: "de-DE", label: "Deutsch (German)", flag: "🇩🇪" },
  { code: "zh-CN", label: "中文 (Chinese)", flag: "🇨🇳" },
];

const MULTILINGUAL_SAMPLE_QUERIES: Record<string, string[]> = {
  "ur-PK": [
    "Aap kis cheez ma madad kar sakte hain?",
    "Artificial Intelligence kya hota hai?",
    "Pakistan ka dar-ul-hukoomat kya hai?",
    "Pani kis temperature par ubalta hai?",
    "50 jama 25 kitne hote hain?",
    "Mujhe human agent se baat karni hai",
  ],
  "en-US": [
    "What are your business hours?",
    "What is Artificial Intelligence?",
    "What is the capital of France?",
    "Calculate 25 multiplied by 4",
    "How do I track my order?",
    "Transfer me to a human representative",
  ],
  "hi-IN": [
    "आप क्या सेवाएं प्रदान करते हैं?",
    "आर्टिफिशियल इंटेलिजेंस क्या है?",
    "भारत की राजधानी क्या है?",
    "मानव विशेषज्ञ से बात कराएं",
  ],
  "ar-SA": [
    "ما هي ساعات العمل لديكم؟",
    "ما هو الذكاء الاصطناعي؟",
    "ما هي عاصمة المملكة العربية السعودية؟",
    "تحويل إلى ممثل خدمة العملاء",
  ],
  auto: [
    "Aap kis cheez ma madad kar sakte hain?",
    "What are your business hours?",
    "Artificial Intelligence kya hai?",
    "What is the capital of Pakistan?",
    "Calculate 100 divided by 5",
    "Transfer to human representative",
  ],
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  initialCallId?: number | null;
  onCallCompleted?: () => void;
};

export default function ActiveCallModal({
  isOpen,
  onClose,
  initialCallId = null,
  onCallCompleted,
}: Props) {
  // Step navigation
  const [step, setStep] = useState<"setup" | "calling" | "completed">(
    initialCallId ? "calling" : "setup"
  );
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | "new">("new");
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [callDirection, setCallDirection] = useState<"inbound" | "outbound">("inbound");
  const [handledBy, setHandledBy] = useState<"ai" | "human">("ai");

  // Multilingual voice selection
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>("auto");

  // Call runtime state
  const [callId, setCallId] = useState<number | null>(initialCallId);
  const [callStatus, setCallStatus] = useState<
    "ringing" | "in_progress" | "on_hold" | "completed"
  >("ringing");
  const [duration, setDuration] = useState(0);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [inputText, setInputText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // Audio / Speech settings
  const [isMicActive, setIsMicActive] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);

  // Barge-in & RAG grounding states
  const [bargeInNotice, setBargeInNotice] = useState<string | null>(null);
  const [escalationAlert, setEscalationAlert] = useState<{ reason: string; priority: string } | null>(null);
  const [lastGroundedSource, setLastGroundedSource] = useState<string | null>(null);

  // Post-call summary
  const [summary, setSummary] = useState<CallSummary | null>(null);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const speechRecognitionRef = useRef<any>(null);

  // Load customer list on setup
  useEffect(() => {
    if (isOpen && step === "setup") {
      api<{ customers: Customer[] }>("/api/customers")
        .then((res) => {
          setCustomers(res.customers);
          if (res.customers.length > 0) {
            setSelectedCustomerId(res.customers[0].id);
          }
        })
        .catch(() => {});
    }
  }, [isOpen, step]);

  // Load existing call data if initialCallId provided
  useEffect(() => {
    if (isOpen && initialCallId) {
      setStep("calling");
      setCallId(initialCallId);
      api<{ call: any; transcript: Transcript[]; summary: CallSummary | null }>(
        `/api/calls/${initialCallId}`
      )
        .then((res) => {
          setCallStatus(res.call.status || "in_progress");
          setTranscripts(res.transcript || []);
          if (res.call.language && res.call.language !== "en") {
            const matched = LANGUAGE_OPTIONS.find((l) =>
              l.code.startsWith(res.call.language)
            );
            if (matched) setSelectedLanguage(matched.code);
          }
          if (res.call.status === "completed") {
            setStep("completed");
            setSummary(res.summary);
          }
        })
        .catch((err) => console.error(err));
    }
  }, [isOpen, initialCallId]);

  // Duration Timer
  useEffect(() => {
    let timer: any;
    if (callStatus === "in_progress") {
      timer = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [callStatus]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts, isProcessing]);

  // Browser Speech Recognition (STT) setup with Multilingual Dynamic Lang Switching
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;

      // Set recognition language according to selection
      if (selectedLanguage === "auto") {
        recognition.lang = "en-US";
      } else {
        recognition.lang = selectedLanguage;
      }

      recognition.onresult = (event: any) => {
        const spoken = event.results[0][0].transcript;
        if (spoken) {
          setInputText(spoken);
          handleSendCustomerMessage(spoken);
        }
        setIsMicActive(false);
      };

      recognition.onerror = () => {
        setIsMicActive(false);
      };

      recognition.onend = () => {
        setIsMicActive(false);
      };

      speechRecognitionRef.current = recognition;
    }
  }, [callId, callStatus, selectedLanguage]);

  // Helper: Speak AI responses via Browser SpeechSynthesis (TTS) with Language Matching
  const speakAI = (text: string, langHint?: string) => {
    if (!isTtsEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const targetLang = (langHint || selectedLanguage || "en").toLowerCase();

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      // Find matching voice by language code
      let matchedVoice = voices.find((v) => {
        const vl = v.lang.toLowerCase();
        if (targetLang.startsWith("ur")) return vl.includes("ur") || vl.includes("hi");
        if (targetLang.startsWith("hi")) return vl.includes("hi");
        if (targetLang.startsWith("ar")) return vl.includes("ar");
        if (targetLang.startsWith("es")) return vl.includes("es");
        if (targetLang.startsWith("fr")) return vl.includes("fr");
        if (targetLang.startsWith("de")) return vl.includes("de");
        if (targetLang.startsWith("zh")) return vl.includes("zh");
        return vl.startsWith("en");
      });

      if (!matchedVoice) {
        matchedVoice = voices.find((v) => v.lang.startsWith("en")) || voices[0];
      }

      if (matchedVoice) {
        utterance.voice = matchedVoice;
        utterance.lang = matchedVoice.lang;
      }
    }

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onstart = () => setIsAiSpeaking(true);
    utterance.onend = () => setIsAiSpeaking(false);
    utterance.onerror = () => setIsAiSpeaking(false);

    window.speechSynthesis.speak(utterance);
  };

  const toggleMic = () => {
    if (!speechRecognitionRef.current) {
      alert(
        "Speech Recognition is not supported by your current browser. You can type in any language directly!"
      );
      return;
    }
    if (isMicActive) {
      speechRecognitionRef.current.stop();
      setIsMicActive(false);
    } else {
      setIsMicActive(true);
      try {
        speechRecognitionRef.current.start();
      } catch {
        setIsMicActive(false);
      }
    }
  };

  // Start Call Handler
  const handleStartCall = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    try {
      let custId = selectedCustomerId;

      if (selectedCustomerId === "new") {
        if (!newCustPhone.trim()) {
          setErrorMsg("Customer phone number is required.");
          return;
        }
        const custRes = await api<{ customer: Customer }>("/api/customers", {
          method: "POST",
          body: {
            name: newCustName.trim() || "Guest Caller",
            phone: newCustPhone.trim(),
            preferred_language: selectedLanguage === "auto" ? "en" : selectedLanguage.split("-")[0],
          },
        });
        custId = custRes.customer.id;
      }

      const callRes = await api<{ call: { id: number } }>("/api/calls", {
        method: "POST",
        body: {
          customer_id: custId,
          direction: callDirection,
          handled_by: handledBy,
          language: selectedLanguage,
        },
      });

      setCallId(callRes.call.id);
      setStep("calling");
      setCallStatus("ringing");

      // Auto-answer simulation after 1.2 seconds
      setTimeout(async () => {
        await api(`/api/calls/${callRes.call.id}`, {
          method: "PATCH",
          body: { status: "in_progress" },
        });
        setCallStatus("in_progress");

        // Multilingual Initial Greeting
        let greeting =
          "Hello! Thank you for calling our AI support center. How can I assist you today?";
        if (selectedLanguage === "ur-PK") {
          greeting =
            "Assalam-o-Alaikum! AI Voice Support Center mein khushamdeed. Main aaj aapki kya madad kar sakta hoon?";
        } else if (selectedLanguage === "hi-IN") {
          greeting =
            "नमस्ते! हमारे AI वॉयस सपोर्ट सेंटर में आपका स्वागत है। मैं आज आपकी क्या सहायता कर सकता हूँ?";
        } else if (selectedLanguage === "ar-SA") {
          greeting =
            "أهلاً وسهلاً بك في مركز الدعم الصوتي الذكي. كيف يمكنني مساعدتك اليوم؟";
        } else if (selectedLanguage === "es-ES") {
          greeting =
            "¡Hola! Gracias por llamar a nuestro centro de atención telefónica con IA. ¿En qué puedo ayudarle hoy?";
        }

        const greetRes = await api<{ entry: Transcript }>(
          `/api/calls/${callRes.call.id}/transcript`,
          {
            method: "POST",
            body: {
              speaker: "ai",
              original_text: greeting,
              original_language: selectedLanguage,
              sentiment: "positive",
            },
          }
        );
        setTranscripts([greetRes.entry]);
        speakAI(greeting, selectedLanguage);
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to initiate call.");
    }
  };

  // Immediate Barge-in Interruption
  const handleInterruptAi = () => {
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsAiSpeaking(false);
    setBargeInNotice("⚡ Barge-in triggered: Previous AI response stopped. Ready for your input.");
    setTimeout(() => setBargeInNotice(null), 3500);
  };

  // Customer speech/message submission
  const handleSendCustomerMessage = async (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!text || !callId || isProcessing) return;

    // BARGE-IN INTERRUPTION: If AI was speaking, cut off previous AI speech immediately!
    if (isAiSpeaking) {
      handleInterruptAi();
    }

    setInputText("");
    setIsProcessing(true);

    try {
      const res = await api<{
        customerEntry: Transcript;
        aiEntry: Transcript;
        detectedLanguage?: string;
        usedRealLlm?: boolean;
        escalated?: boolean;
        escalationReason?: string;
        priority?: string;
        retrievedChunks?: any[];
      }>(`/api/calls/${callId}/ai-respond`, {
        method: "POST",
        body: {
          message: text,
          language: selectedLanguage,
        },
      });

      if (res.escalated) {
        setEscalationAlert({
          reason: res.escalationReason || "Escalation rule triggered",
          priority: res.priority || "high",
        });
      }

      if (res.retrievedChunks && res.retrievedChunks.length > 0) {
        const topChunk = res.retrievedChunks[0];
        setLastGroundedSource(
          `Grounded via PostgreSQL RAG: "${topChunk.document_title}" (${Math.round((topChunk.similarity || 0) * 100)}% Match)`
        );
      }

      setTranscripts((prev) => [...prev, res.customerEntry, res.aiEntry]);
      speakAI(res.aiEntry.original_text, res.detectedLanguage || selectedLanguage);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  // Hold / Resume
  const handleToggleHold = async () => {
    if (!callId) return;
    const newStatus = callStatus === "on_hold" ? "in_progress" : "on_hold";
    try {
      await api(`/api/calls/${callId}`, {
        method: "PATCH",
        body: { status: newStatus },
      });
      setCallStatus(newStatus);
    } catch (err) {
      console.error(err);
    }
  };

  // Transfer to Human Agent
  const handleTransferToHuman = async () => {
    if (!callId) return;
    try {
      const isUrdu = selectedLanguage === "ur-PK";
      const transferMsg = isUrdu
        ? "Aapki call hamare human agent ko transfer ki ja rahi hai. Barah-e-karam line par rahiye..."
        : "Transferring call to the next available human agent. Please hold...";

      const res = await api<{ entry: Transcript }>(
        `/api/calls/${callId}/transcript`,
        {
          method: "POST",
          body: {
            speaker: "agent",
            original_text: transferMsg,
            original_language: selectedLanguage,
            sentiment: "neutral",
          },
        }
      );
      setTranscripts((prev) => [...prev, res.entry]);
      speakAI(transferMsg, selectedLanguage);
    } catch (err) {
      console.error(err);
    }
  };

  // Complete / Hang Up Call
  const handleEndCall = async () => {
    if (!callId) {
      onClose();
      return;
    }
    window.speechSynthesis?.cancel();
    try {
      const res = await api<{ call: any; summary: CallSummary }>(
        `/api/calls/${callId}/complete`,
        {
          method: "POST",
        }
      );
      setCallStatus("completed");
      setSummary(res.summary);
      setStep("completed");
      if (onCallCompleted) onCallCompleted();
    } catch (err) {
      console.error(err);
      onClose();
    }
  };

  const copyTranscriptText = () => {
    const text = transcripts
      .map((t) => `[${t.speaker.toUpperCase()}]: ${t.original_text}`)
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopiedTranscript(true);
    setTimeout(() => setCopiedTranscript(false), 2000);
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const activeSampleQueries =
    MULTILINGUAL_SAMPLE_QUERIES[selectedLanguage] ||
    MULTILINGUAL_SAMPLE_QUERIES["auto"];

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content active-call-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="modal-header">
          <div className="modal-title-group">
            <span
              className={`call-indicator-dot ${
                callStatus === "in_progress"
                  ? "live"
                  : callStatus === "ringing"
                  ? "ringing"
                  : "idle"
              }`}
            />
            <div>
              <h3>
                {step === "setup"
                  ? "Start Intelligent Voice Call"
                  : step === "calling"
                  ? "Active AI Voice Session"
                  : "Call Completed & AI Insights"}
              </h3>
              <p>
                {step === "setup"
                  ? "Universal Multilingual Voice Agent (English, اردو, हिन्दी, العربية)"
                  : step === "calling"
                  ? `Call #${callId} • Status: ${callStatus.replace("_", " ")}`
                  : `Call #${callId} finalized`}
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* STEP 1: SETUP / DIALER */}
        {step === "setup" && (
          <form onSubmit={handleStartCall} className="call-setup-form">
            {errorMsg && (
              <div className="error-banner">
                <AlertCircle size={16} /> {errorMsg}
              </div>
            )}

            {/* LANGUAGE SELECTOR */}
            <div className="form-group highlight-form-group">
              <label className="flex-label">
                <span>
                  <Globe size={16} /> Caller Language / زبان کا انتخاب
                </span>
                <span className="lang-tag">Multilingual Core Active</span>
              </label>
              <select
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value as LanguageCode)}
                className="language-select-input"
              >
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.flag} {opt.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                AI will seamlessly converse, comprehend and speak back in this language.
              </span>
            </div>

            <div className="form-group">
              <label>Select Customer</label>
              <select
                value={selectedCustomerId}
                onChange={(e) =>
                  setSelectedCustomerId(
                    e.target.value === "new" ? "new" : Number(e.target.value)
                  )
                }
              >
                <option value="new">+ Enter New Customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ? `${c.name} (${c.phone})` : c.phone}
                  </option>
                ))}
              </select>
            </div>

            {selectedCustomerId === "new" && (
              <div className="two-col-inputs">
                <div className="form-group">
                  <label>Customer Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Tariq Mehmood / Sarah Jenkins"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    placeholder="e.g. +92 300 1234567 / +1 555 923 4411"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <div className="two-col-inputs">
              <div className="form-group">
                <label>Call Direction</label>
                <select
                  value={callDirection}
                  onChange={(e: any) => setCallDirection(e.target.value)}
                >
                  <option value="inbound">Incoming (Inbound)</option>
                  <option value="outbound">Outgoing (Outbound)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Handled By</label>
                <select
                  value={handledBy}
                  onChange={(e: any) => setHandledBy(e.target.value)}
                >
                  <option value="ai">AI Voice Bot (Multilingual Universal)</option>
                  <option value="human">Human Agent</option>
                </select>
              </div>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={onClose}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button connect-call-btn">
                <PhoneCall size={18} /> Connect Voice Call Now
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: ACTIVE CALL INTERFACE */}
        {step === "calling" && (
          <div className="active-call-body">
            {/* CALL STATUS BANNER */}
            <div className="call-status-bar">
              <div className="timer-badge">
                <span className="timer-text">{formatTimer(duration)}</span>
                <span className={`status-pill ${callStatus}`}>
                  {callStatus.replace("_", " ")}
                </span>
              </div>

              {/* WAVEFORM VISUALIZER */}
              <div className="audio-waveform-container">
                <div
                  className={`waveform-bars ${
                    callStatus === "in_progress"
                      ? isAiSpeaking
                        ? "active speaking"
                        : isMicActive
                        ? "active listening"
                        : "active standby"
                      : ""
                  }`}
                >
                  {[...Array(16)].map((_, i) => (
                    <span key={i} className="bar" />
                  ))}
                </div>
                <span className="waveform-label">
                  {callStatus === "ringing"
                    ? "Ringing line..."
                    : callStatus === "on_hold"
                    ? "Call On Hold"
                    : isAiSpeaking
                    ? "AI Speaking in Natural Voice..."
                    : isMicActive
                    ? "Listening to your voice..."
                    : "Live Audio Connected"}
                </span>
              </div>

              {/* AUDIO & LANGUAGE CONTROLS */}
              <div className="audio-toggle-controls">
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value as LanguageCode)}
                  className="quick-lang-dropdown"
                  title="Switch Voice Language"
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.flag} {opt.code.toUpperCase()}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  title={
                    isTtsEnabled ? "Mute AI Voice (TTS)" : "Enable AI Voice (TTS)"
                  }
                  className={`icon-toggle-btn ${!isTtsEnabled ? "muted" : ""}`}
                  onClick={() => {
                    setIsTtsEnabled(!isTtsEnabled);
                    if (isTtsEnabled) window.speechSynthesis?.cancel();
                  }}
                >
                  {isTtsEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
              </div>
            </div>

            {/* REAL-TIME BARGE-IN NOTIFICATION */}
            {bargeInNotice && (
              <div className="barge-in-notice-banner">
                <Sparkles size={16} />
                <span>{bargeInNotice}</span>
              </div>
            )}

            {/* REAL-TIME ESCALATION ALERT */}
            {escalationAlert && (
              <div className="active-call-escalation-alert">
                <AlertCircle size={16} />
                <div>
                  <strong>ESCALATED TO HUMAN QUEUE:</strong> {escalationAlert.reason}
                  <span className="priority-tag">{escalationAlert.priority.toUpperCase()} PRIORITY</span>
                </div>
              </div>
            )}

            {/* RAG GROUNDING BADGE */}
            {lastGroundedSource && (
              <div className="call-rag-grounding-tag">
                <CheckCircle2 size={13} color="#16a34a" />
                <span>{lastGroundedSource}</span>
              </div>
            )}

            {/* LIVE TRANSCRIPT STREAM */}
            <div className="live-transcript-feed">
              {transcripts.length === 0 ? (
                <div className="empty-transcript-hint">
                  <Bot size={32} />
                  <p>
                    Voice connection established. Speak into your microphone or type
                    any question below in Urdu, English, Hindi, or Arabic!
                  </p>
                </div>
              ) : (
                transcripts.map((t) => (
                  <div
                    key={t.id}
                    className={`transcript-bubble ${
                      t.speaker === "customer"
                        ? "customer-bubble"
                        : t.speaker === "ai"
                        ? "ai-bubble"
                        : "agent-bubble"
                    }`}
                  >
                    <div className="bubble-header">
                      <span className="speaker-name">
                        {t.speaker === "customer" ? (
                          <>
                            <User size={14} /> Customer
                          </>
                        ) : t.speaker === "ai" ? (
                          <>
                            <Bot size={14} /> AI Voice Assistant
                          </>
                        ) : (
                          <>
                            <PhoneForwarded size={14} /> Human Agent
                          </>
                        )}
                      </span>

                      <div className="bubble-meta-badges">
                        {t.original_language && (
                          <span className="lang-mini-badge">
                            {t.original_language.toUpperCase()}
                          </span>
                        )}
                        {t.sentiment && (
                          <span className={`sentiment-badge ${t.sentiment}`}>
                            {t.sentiment}
                          </span>
                        )}
                        {t.speaker === "ai" && (
                          <button
                            type="button"
                            className="replay-voice-btn"
                            title="Hear voice playback"
                            onClick={() => speakAI(t.original_text, t.original_language)}
                          >
                            <Volume2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="bubble-text">{t.original_text}</p>
                  </div>
                ))
              )}

              {isProcessing && (
                <div className="transcript-bubble ai-bubble thinking-bubble">
                  <Bot size={15} className="spin-slow" />
                  <span>AI Voice Specialist is formulating accurate answer...</span>
                </div>
              )}
              <div ref={transcriptEndRef} />
            </div>

            {/* QUICK MULTILINGUAL PROMPTS */}
            <div className="quick-prompts-bar">
              <span className="quick-prompts-title">
                {selectedLanguage.startsWith("ur") ? "آزمائشی سوالات:" : "Try Sample Query:"}
              </span>
              <div className="quick-prompts-scroll">
                {activeSampleQueries.map((queryText, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="chip-button"
                    onClick={() => handleSendCustomerMessage(queryText)}
                  >
                    {queryText}
                  </button>
                ))}
              </div>
            </div>

            {/* INPUT CONTROLS: MIC + TEXT */}
            <div className="speech-input-bar">
              <button
                type="button"
                className={`mic-btn ${isMicActive ? "listening" : ""}`}
                title={
                  isMicActive
                    ? "Listening... click to stop"
                    : `Speak in ${selectedLanguage === "auto" ? "any language" : selectedLanguage}`
                }
                onClick={toggleMic}
              >
                {isMicActive ? <MicOff size={20} /> : <Mic size={20} />}
              </button>

              <input
                type="text"
                placeholder={
                  isMicActive
                    ? "Listening to your voice... Speak clearly"
                    : "Type or speak any question in Urdu, English, Hindi, Arabic..."
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendCustomerMessage();
                  }
                }}
                disabled={callStatus !== "in_progress"}
              />

              <button
                type="button"
                className="send-btn"
                onClick={() => handleSendCustomerMessage()}
                disabled={!inputText.trim() || isProcessing}
                title="Send inquiry"
              >
                <Send size={18} />
              </button>
            </div>

            {/* CALL ACTION CONTROLS */}
            <div className="call-actions-footer">
              {isAiSpeaking && (
                <button
                  type="button"
                  className="call-action-btn barge-in-btn animate-pulse"
                  onClick={handleInterruptAi}
                  title="Immediately stop and interrupt AI voice (Barge-in)"
                >
                  ⚡ Interrupt AI (Barge-in)
                </button>
              )}

              <button
                type="button"
                className={`call-action-btn ${
                  callStatus === "on_hold" ? "active-hold" : ""
                }`}
                onClick={handleToggleHold}
              >
                {callStatus === "on_hold" ? (
                  <>
                    <Play size={16} /> Resume Call
                  </>
                ) : (
                  <>
                    <Pause size={16} /> Hold Call
                  </>
                )}
              </button>

              <button
                type="button"
                className="call-action-btn"
                onClick={handleTransferToHuman}
              >
                <PhoneForwarded size={16} /> Transfer Agent
              </button>

              <button
                type="button"
                className="call-action-btn copy-transcript-btn"
                onClick={copyTranscriptText}
                title="Copy live transcript"
              >
                {copiedTranscript ? <CheckCircle2 size={16} color="#16a34a" /> : <Copy size={16} />}
                <span>{copiedTranscript ? "Copied" : "Copy"}</span>
              </button>

              <button
                type="button"
                className="call-action-btn hangup-btn"
                onClick={handleEndCall}
              >
                <PhoneOff size={18} /> End Call
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CALL COMPLETED & AI SUMMARY */}
        {step === "completed" && (
          <div className="call-completed-view">
            <div className="completion-hero">
              <CheckCircle2 size={44} className="success-icon" />
              <h4>Voice Call Concluded &amp; Analyzed</h4>
              <p>Duration: {formatTimer(duration)} • {transcripts.length} exchanges handled</p>
            </div>

            {summary && (
              <div className="ai-summary-card">
                <div className="summary-card-header">
                  <div className="title-with-icon">
                    <Sparkles size={18} className="sparkle-icon" />
                    <strong>AI Executive Dialogue Analysis</strong>
                  </div>
                  <span className={`sentiment-badge ${summary.overall_sentiment}`}>
                    {summary.overall_sentiment} sentiment
                  </span>
                </div>
                <p className="summary-paragraph">{summary.summary_text}</p>

                <div className="key-points-section">
                  <strong>Key Takeaways:</strong>
                  <pre className="key-points-text">{summary.key_points}</pre>
                </div>
              </div>
            )}

            <div className="modal-actions completed-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setStep("setup");
                  setCallId(null);
                  setTranscripts([]);
                  setSummary(null);
                  setDuration(0);
                }}
              >
                <RotateCcw size={16} /> Start Another Call
              </button>
              <button type="button" className="primary-button" onClick={onClose}>
                Done &amp; Return to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
