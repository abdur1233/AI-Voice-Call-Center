import { useEffect, useState, useRef } from "react";
import {
  Ear,
  Eye,
  Headphones,
  Mic,
  MicOff,
  MessageSquare,
  PhoneCall,
  Radio,
  Send,
  Shield,
  Sparkles,
  Users,
  Volume2,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "../AuthContext";
import {
  supervisorAudio,
  type SupervisorCoachingMode,
} from "../services/supervisorAudioService";

type Props = {
  isOpen: boolean;
  callId: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  handledBy?: string;
  durationSeconds?: number;
  onClose: () => void;
};

type TranscriptLine = {
  speaker: "customer" | "ai" | "agent";
  text: string;
  time?: string;
};

const PRESET_COACHING_HINTS = [
  "Offer 15% retention discount to resolve concern",
  "Aap inko polite tareeqay se refund policy samjhayen",
  "Apologize for delivery delay and create priority ticket",
  "Verify last 4 digits of phone/account before updating details",
  "Customer is expressing frustration — keep calm, empathetic tone",
];

export default function SupervisorCoachingModal({
  isOpen,
  callId,
  customerName,
  customerPhone,
  handledBy = "ai",
  durationSeconds = 0,
  onClose,
}: Props) {
  const { agent } = useAuth();
  const [mode, setMode] = useState<SupervisorCoachingMode>("listen");
  const [isMuted, setIsMuted] = useState(false);
  const [callerLevel, setCallerLevel] = useState(0);
  const [agentLevel, setAgentLevel] = useState(0);
  const [micLevel, setMicLevel] = useState(0);

  const [callDuration, setCallDuration] = useState(durationSeconds);
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  const [customHint, setCustomHint] = useState("");
  const [sentHintNotice, setSentHintNotice] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Timer
  useEffect(() => {
    if (!isOpen) return;
    setCallDuration(durationSeconds);
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isOpen, durationSeconds]);

  // Audio level listeners
  useEffect(() => {
    supervisorAudio.onCallerLevel = (lvl) => setCallerLevel(lvl);
    supervisorAudio.onAgentLevel = (lvl) => setAgentLevel(lvl);
    supervisorAudio.onSupervisorMicLevel = (lvl) => setMicLevel(lvl);

    supervisorAudio.onAudioChunk = (base64) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && callId) {
        wsRef.current.send(
          JSON.stringify({
            type: "supervisor_audio",
            callId,
            payload: base64,
          })
        );
      }
    };

    return () => {
      supervisorAudio.reset();
    };
  }, [callId]);

  // Connect to WebSocket and Join Call
  useEffect(() => {
    if (!isOpen || !callId) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log(`[Supervisor WS Connected] Joining Call #${callId} in Listen mode`);
      // Start microphone for Whisper/Barge readiness
      supervisorAudio.startMicrophone();
      supervisorAudio.setMode("listen");

      ws.send(
        JSON.stringify({
          type: "supervisor_join_call",
          callId,
          mode: "listen",
          supervisorId: agent?.id || 1,
          supervisorName: agent?.name || "Supervisor",
          customerPhone: customerPhone || "Customer",
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Caller audio from Twilio / customer stream
        if (msg.type === "supervisor_caller_audio" && msg.callId === callId) {
          if (msg.payload) supervisorAudio.playCallerChunk(msg.payload);
        }

        // Agent audio from agent browser softphone
        else if (msg.type === "supervisor_agent_audio" && msg.callId === callId) {
          if (msg.payload) supervisorAudio.playAgentChunk(msg.payload);
        }

        // Real-time transcript feed
        else if (msg.type === "transcript_line" && msg.callId === callId) {
          setTranscripts((prev) => [
            ...prev,
            {
              speaker: msg.speaker,
              text: msg.text,
              time: new Date().toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
            },
          ]);
        }
      } catch (e) {
        // ignore
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "supervisor_leave_call",
            callId,
          })
        );
        ws.close();
      }
      supervisorAudio.reset();
    };
  }, [isOpen, callId, agent, customerPhone]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  // Mode changer
  const handleModeChange = (newMode: SupervisorCoachingMode) => {
    setMode(newMode);
    supervisorAudio.setMode(newMode);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && callId) {
      wsRef.current.send(
        JSON.stringify({
          type: "supervisor_set_mode",
          callId,
          mode: newMode,
        })
      );
    }
  };

  const toggleMicMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    supervisorAudio.setMicMuted(nextMute);
  };

  // Send coaching teleprompter hint
  const handleSendHint = (hintText: string) => {
    if (!hintText.trim() || !callId) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "supervisor_send_hint",
          callId,
          hintText,
        })
      );

      setSentHintNotice(`✓ Coaching hint dispatched to agent: "${hintText.slice(0, 45)}..."`);
      setTimeout(() => setSentHintNotice(null), 3000);
    }
    setCustomHint("");
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  if (!isOpen || !callId) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content supervisor-coaching-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "860px", width: "95%" }}
      >
        {/* HEADER */}
        <div className="modal-header" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="modal-title-group">
            <div
              style={{
                width: "42px",
                height: "42px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(168,85,247,0.2))",
                border: "1px solid rgba(139,92,246,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#a855f7",
              }}
            >
              <Shield size={22} />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h3 style={{ margin: 0, fontSize: "1.1rem" }}>Supervisor Coaching Console</h3>
                <span
                  style={{
                    background: "rgba(16,185,129,0.15)",
                    color: "#10b981",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: "20px",
                    border: "1px solid rgba(16,185,129,0.3)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#10b981",
                      display: "inline-block",
                      animation: "pulse 1.5s infinite",
                    }}
                  />
                  LIVE MONITORING
                </span>
              </div>
              <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Call #{callId} • Caller: <strong>{customerName || customerPhone || "Unknown"}</strong> • Duration: {formatTime(callDuration)}
              </p>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* BODY */}
        <div style={{ padding: "20px 24px" }}>
          {/* THREE COACHING MODES */}
          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "0.76rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
                marginBottom: "10px",
              }}
            >
              Select Coaching Mode
            </label>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "12px",
              }}
            >
              {/* 1. LISTEN */}
              <button
                type="button"
                onClick={() => handleModeChange("listen")}
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  textAlign: "left",
                  background:
                    mode === "listen"
                      ? "linear-gradient(145deg, rgba(59,130,246,0.15), rgba(30,58,138,0.25))"
                      : "rgba(255,255,255,0.03)",
                  border:
                    mode === "listen"
                      ? "1.5px solid #3b82f6"
                      : "1px solid rgba(255,255,255,0.08)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  position: "relative",
                  color: "#fff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "0.95rem" }}>
                    <Ear size={18} color={mode === "listen" ? "#60a5fa" : "var(--text-muted)"} />
                    <span>1. Listen (Silent)</span>
                  </div>
                  {mode === "listen" && (
                    <span
                      style={{
                        background: "#3b82f6",
                        color: "#fff",
                        fontSize: "0.68rem",
                        padding: "1px 6px",
                        borderRadius: "10px",
                        fontWeight: 700,
                      }}
                    >
                      ACTIVE
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  Undetected monitoring. Listen to customer & agent without either hearing you.
                </p>
              </button>

              {/* 2. WHISPER */}
              <button
                type="button"
                onClick={() => handleModeChange("whisper")}
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  textAlign: "left",
                  background:
                    mode === "whisper"
                      ? "linear-gradient(145deg, rgba(168,85,247,0.18), rgba(107,33,168,0.25))"
                      : "rgba(255,255,255,0.03)",
                  border:
                    mode === "whisper"
                      ? "1.5px solid #a855f7"
                      : "1px solid rgba(255,255,255,0.08)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  position: "relative",
                  color: "#fff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "0.95rem" }}>
                    <Headphones size={18} color={mode === "whisper" ? "#c084fc" : "var(--text-muted)"} />
                    <span>2. Whisper (Coach)</span>
                  </div>
                  {mode === "whisper" && (
                    <span
                      style={{
                        background: "#a855f7",
                        color: "#fff",
                        fontSize: "0.68rem",
                        padding: "1px 6px",
                        borderRadius: "10px",
                        fontWeight: 700,
                      }}
                    >
                      AGENT ONLY
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  Private coaching. Only the agent hears your voice — customer hears nothing!
                </p>
              </button>

              {/* 3. BARGE-IN */}
              <button
                type="button"
                onClick={() => handleModeChange("barge")}
                style={{
                  padding: "14px",
                  borderRadius: "12px",
                  textAlign: "left",
                  background:
                    mode === "barge"
                      ? "linear-gradient(145deg, rgba(239,68,68,0.18), rgba(153,27,27,0.25))"
                      : "rgba(255,255,255,0.03)",
                  border:
                    mode === "barge"
                      ? "1.5px solid #ef4444"
                      : "1px solid rgba(255,255,255,0.08)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                  position: "relative",
                  color: "#fff",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "0.95rem" }}>
                    <Users size={18} color={mode === "barge" ? "#f87171" : "var(--text-muted)"} />
                    <span>3. Barge-In</span>
                  </div>
                  {mode === "barge" && (
                    <span
                      style={{
                        background: "#ef4444",
                        color: "#fff",
                        fontSize: "0.68rem",
                        padding: "1px 6px",
                        borderRadius: "10px",
                        fontWeight: 700,
                      }}
                    >
                      CONFERENCE
                    </span>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: "0.78rem", color: "var(--text-muted)", lineHeight: 1.4 }}>
                  Full 3-way call takeover. Both customer and agent hear your voice directly.
                </p>
              </button>
            </div>
          </div>

          {/* AUDIO VU METERS ROW */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "12px",
              padding: "14px",
              background: "rgba(0,0,0,0.25)",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.06)",
              marginBottom: "20px",
            }}
          >
            {/* 1. Caller Audio VU */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Volume2 size={13} color="#10b981" /> Caller Audio
                </span>
                <span style={{ fontWeight: 700, color: "#10b981" }}>{callerLevel}%</span>
              </div>
              <div style={{ height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${callerLevel}%`,
                    background: "linear-gradient(90deg, #10b981, #34d399)",
                    transition: "width 0.1s ease",
                  }}
                />
              </div>
            </div>

            {/* 2. Agent Audio VU */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Headphones size={13} color="#3b82f6" /> Agent Audio
                </span>
                <span style={{ fontWeight: 700, color: "#3b82f6" }}>{agentLevel}%</span>
              </div>
              <div style={{ height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${agentLevel}%`,
                    background: "linear-gradient(90deg, #3b82f6, #60a5fa)",
                    transition: "width 0.1s ease",
                  }}
                />
              </div>
            </div>

            {/* 3. Supervisor Mic VU */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "6px" }}>
                <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  {isMuted || mode === "listen" ? (
                    <MicOff size={13} color="#94a3b8" />
                  ) : (
                    <Mic size={13} color="#a855f7" />
                  )}
                  Your Microphone {mode === "listen" && "(Auto Muted)"}
                </span>
                <span style={{ fontWeight: 700, color: "#a855f7" }}>
                  {mode === "listen" || isMuted ? "Muted" : `${micLevel}%`}
                </span>
              </div>
              <div style={{ height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${mode === "listen" || isMuted ? 0 : micLevel}%`,
                    background: "linear-gradient(90deg, #a855f7, #c084fc)",
                    transition: "width 0.1s ease",
                  }}
                />
              </div>
            </div>
          </div>

          {/* TELEPROMPTER COACHING HINTS & DISPATCH */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <label
                style={{
                  fontSize: "0.76rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-muted)",
                }}
              >
                Instant Coaching Prompts (Click to Send to Agent Screen)
              </label>
              {mode !== "listen" && (
                <button
                  type="button"
                  onClick={toggleMicMute}
                  style={{
                    background: isMuted ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.06)",
                    border: isMuted ? "1px solid #ef4444" : "1px solid rgba(255,255,255,0.1)",
                    color: isMuted ? "#f87171" : "#fff",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    fontSize: "0.75rem",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
                  {isMuted ? "Unmute My Mic" : "Mute My Mic"}
                </button>
              )}
            </div>

            {/* Quick Chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
              {PRESET_COACHING_HINTS.map((hint, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendHint(hint)}
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "20px",
                    padding: "5px 12px",
                    fontSize: "0.78rem",
                    color: "var(--text-main)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--primary-color)";
                    e.currentTarget.style.background = "rgba(99,102,241,0.12)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                  }}
                >
                  <Zap size={12} color="#a855f7" />
                  {hint}
                </button>
              ))}
            </div>

            {/* Custom Hint Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendHint(customHint);
              }}
              style={{ display: "flex", gap: "8px" }}
            >
              <input
                type="text"
                placeholder="Type a private coaching instruction to agent (e.g., 'Aap inko 10% concession dein')..."
                value={customHint}
                onChange={(e) => setCustomHint(e.target.value)}
                style={{
                  flex: 1,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: "8px",
                  padding: "9px 12px",
                  color: "#fff",
                  fontSize: "0.84rem",
                }}
              />
              <button
                type="submit"
                className="primary-button"
                style={{ padding: "0 16px", display: "inline-flex", alignItems: "center", gap: "6px" }}
                disabled={!customHint.trim()}
              >
                <Send size={14} /> Send Hint
              </button>
            </form>

            {sentHintNotice && (
              <div
                style={{
                  marginTop: "8px",
                  fontSize: "0.78rem",
                  color: "#10b981",
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <Sparkles size={13} /> {sentHintNotice}
              </div>
            )}
          </div>

          {/* LIVE CALL TRANSCRIPT FEED */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: "0.76rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--text-muted)",
                marginBottom: "8px",
              }}
            >
              Live Conversation Feed
            </label>
            <div
              style={{
                height: "170px",
                overflowY: "auto",
                background: "rgba(0,0,0,0.3)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: "10px",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: "8px",
              }}
            >
              {transcripts.length === 0 ? (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    fontSize: "0.82rem",
                    gap: "6px",
                  }}
                >
                  <Radio size={14} className="live-pulse-icon" /> Audio is streaming. New speech lines will appear here in real time...
                </div>
              ) : (
                transcripts.map((t, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "8px",
                      fontSize: "0.82rem",
                    }}
                  >
                    <span
                      style={{
                        padding: "1px 6px",
                        borderRadius: "4px",
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        background:
                          t.speaker === "customer"
                            ? "rgba(16,185,129,0.15)"
                            : t.speaker === "agent"
                            ? "rgba(59,130,246,0.15)"
                            : "rgba(168,85,247,0.15)",
                        color:
                          t.speaker === "customer"
                            ? "#34d399"
                            : t.speaker === "agent"
                            ? "#60a5fa"
                            : "#c084fc",
                      }}
                    >
                      {t.speaker}
                    </span>
                    <span style={{ color: "var(--text-main)", flex: 1 }}>{t.text}</span>
                    {t.time && <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{t.time}</span>}
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div
          className="modal-footer"
          style={{
            borderTop: "1px solid rgba(255,255,255,0.08)",
            padding: "14px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background:
                  mode === "listen"
                    ? "#3b82f6"
                    : mode === "whisper"
                    ? "#a855f7"
                    : "#ef4444",
                display: "inline-block",
              }}
            />
            Status: Currently monitoring in <strong>{mode.toUpperCase()}</strong> mode
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={onClose}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
          >
            Leave Monitoring
          </button>
        </div>
      </div>
    </div>
  );
}
