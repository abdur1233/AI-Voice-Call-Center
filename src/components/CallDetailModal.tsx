import { useEffect, useState } from "react";
import {
  Bot,
  Calendar,
  Clock,
  Phone,
  PhoneForwarded,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { api } from "../api";

type CallDetail = {
  id: number;
  customer_name: string | null;
  customer_phone: string | null;
  agent_name: string | null;
  direction: string;
  status: string;
  handled_by: string;
  language: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
};

type Transcript = {
  id: number;
  speaker: string;
  original_text: string;
  sentiment?: string;
  spoken_at?: string;
};

type Summary = {
  summary_text: string;
  overall_sentiment: string;
  key_points: string;
};

type Props = {
  callId: number | null;
  isOpen: boolean;
  onClose: () => void;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function CallDetailModal({ callId, isOpen, onClose }: Props) {
  const [call, setCall] = useState<CallDetail | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && callId) {
      setLoading(true);
      api<{
        call: CallDetail;
        transcript: Transcript[];
        summary: Summary | null;
      }>(`/api/calls/${callId}`)
        .then((res) => {
          setCall(res.call);
          setTranscripts(res.transcript || []);
          setSummary(res.summary);
        })
        .catch((err) => console.error("Failed to load call detail:", err))
        .finally(() => setLoading(false));
    } else {
      setCall(null);
      setTranscripts([]);
      setSummary(null);
    }
  }, [isOpen, callId]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content call-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title-group">
            <h3>Call Record #{callId}</h3>
            {call && (
              <div className="modal-meta-tags">
                <span className={`status-pill ${call.status}`}>
                  {call.status.replace("_", " ")}
                </span>
                <span className="call-direction-badge">
                  {call.direction === "inbound" ? "Incoming" : "Outgoing"}
                </span>
                <span className="handled-by-badge">
                  Handled by: {call.handled_by.replace("_", " + ")}
                </span>
              </div>
            )}
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="modal-loading-state">
            <p>Loading call details...</p>
          </div>
        ) : !call ? (
          <div className="modal-loading-state">
            <p>Call record not found.</p>
          </div>
        ) : (
          <div className="call-detail-body">
            {/* CALL OVERVIEW CARDS */}
            <div className="detail-meta-grid">
              <div className="meta-card">
                <div className="meta-card-label">
                  <User size={14} /> Customer
                </div>
                <strong>{call.customer_name || "Unknown Caller"}</strong>
                <span>{call.customer_phone || "—"}</span>
              </div>

              <div className="meta-card">
                <div className="meta-card-label">
                  <Clock size={14} /> Duration
                </div>
                <strong>{formatDuration(call.duration_seconds)}</strong>
                <span>{call.duration_seconds}s total</span>
              </div>

              <div className="meta-card">
                <div className="meta-card-label">
                  <Calendar size={14} /> Started At
                </div>
                <strong>{formatDate(call.started_at)}</strong>
                <span>{call.agent_name ? `Agent: ${call.agent_name}` : "Automated Bot"}</span>
              </div>
            </div>

            {/* AI SUMMARY CARD */}
            {summary && (
              <div className="ai-summary-card">
                <div className="summary-card-header">
                  <div className="title-with-icon">
                    <Sparkles size={18} className="sparkle-icon" />
                    <strong>AI Executive Summary &amp; Analysis</strong>
                  </div>
                  <span className={`sentiment-badge ${summary.overall_sentiment}`}>
                    {summary.overall_sentiment} sentiment
                  </span>
                </div>
                <p className="summary-paragraph">{summary.summary_text}</p>
                {summary.key_points && (
                  <div className="key-points-section">
                    <strong>Key Points:</strong>
                    <pre className="key-points-text">{summary.key_points}</pre>
                  </div>
                )}
              </div>
            )}

            {/* CONVERSATION TRANSCRIPT */}
            <div className="detail-transcript-section">
              <h4>Conversation Transcript ({transcripts.length} entries)</h4>
              <div className="detail-transcript-feed">
                {transcripts.length === 0 ? (
                  <p className="empty-feed-hint">No transcript recorded for this call.</p>
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
                              <User size={13} /> Customer
                            </>
                          ) : t.speaker === "ai" ? (
                            <>
                              <Bot size={13} /> AI Voice Assistant
                            </>
                          ) : (
                            <>
                              <PhoneForwarded size={13} /> Human Agent
                            </>
                          )}
                        </span>
                        {t.sentiment && (
                          <span className={`sentiment-badge ${t.sentiment}`}>
                            {t.sentiment}
                          </span>
                        )}
                      </div>
                      <p className="bubble-text">{t.original_text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="modal-actions">
              <button className="primary-button" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
