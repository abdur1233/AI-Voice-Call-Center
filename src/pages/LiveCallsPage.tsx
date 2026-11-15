import { useEffect, useState, useCallback } from "react";
import {
  Eye,
  Headphones,
  PhoneCall,
  PhoneIncoming,
  Radio,
  RefreshCw,
  Shield,
} from "lucide-react";
import { api } from "../api";
import ActiveCallModal from "../components/ActiveCallModal";
import CallDetailModal from "../components/CallDetailModal";
import SupervisorCoachingModal from "../components/SupervisorCoachingModal";

type CallRow = {
  id: number;
  customer_name: string | null;
  customer_phone: string | null;
  direction: string;
  status: string;
  handled_by: string;
  duration_seconds: number;
};

export default function LiveCallsPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCallId, setActiveCallId] = useState<number | null>(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [detailCallId, setDetailCallId] = useState<number | null>(null);
  const [coachingCall, setCoachingCall] = useState<CallRow | null>(null);
  const [simulating, setSimulating] = useState(false);

  const loadCalls = useCallback(async () => {
    try {
      const [ringing, inProgress] = await Promise.all([
        api<{ calls: CallRow[] }>("/api/calls?status=ringing"),
        api<{ calls: CallRow[] }>("/api/calls?status=in_progress"),
      ]);
      setCalls([...inProgress.calls, ...ringing.calls]);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCalls();
    // Auto-refresh live calls every 4 seconds
    const interval = setInterval(loadCalls, 4000);
    return () => clearInterval(interval);
  }, [loadCalls]);

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      const res = await api<{ call: { id: number } }>(
        "/api/calls/simulate-incoming",
        { method: "POST" }
      );
      setActiveCallId(res.call.id);
      setIsCallModalOpen(true);
      loadCalls();
    } catch (err) {
      console.error(err);
    } finally {
      setSimulating(false);
    }
  };

  return (
    <>
      <div className="welcome-row">
        <div>
          <h2>Live Calls</h2>
          <p>Calls that are ringing or currently in progress with AI or Agents.</p>
        </div>
        <div className="welcome-action-buttons">
          <button
            className="secondary-button"
            onClick={loadCalls}
            title="Refresh list"
          >
            <RefreshCw size={15} />
          </button>
          <button
            className="secondary-button simulate-btn"
            onClick={handleSimulate}
            disabled={simulating}
          >
            <PhoneIncoming size={16} /> Simulate Inbound Call
          </button>
          <button
            className="primary-button"
            onClick={() => {
              setActiveCallId(null);
              setIsCallModalOpen(true);
            }}
          >
            <PhoneCall size={16} /> Start New Call
          </button>
        </div>
      </div>

      <div className="live-pill-row">
        <span className="live-pill">
          <span /> {calls.length} ACTIVE NOW
        </span>
        <span className="live-auto-refresh-text">
          <Radio size={14} className="live-pulse-icon" /> Live Feed (Auto-updating)
        </span>
      </div>

      {!loading && calls.length === 0 && (
        <section className="panel empty-panel">
          <PhoneCall size={32} />
          <h4>No live calls right now</h4>
          <p>
            Start an outbound call or simulate an incoming call using the buttons
            above.
          </p>
        </section>
      )}

      <div className="live-calls-grid">
        {calls.map((call) => (
          <section
            key={call.id}
            className="panel live-call-card"
            onClick={() => {
              setActiveCallId(call.id);
              setIsCallModalOpen(true);
            }}
            title="Click to monitor or join call"
          >
            <div className="live-card-top">
              <div className="customer-cell">
                <div className="customer-avatar">
                  {(call.customer_name || "?")
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </div>
                <div>
                  <strong>{call.customer_name || "Unknown Caller"}</strong>
                  <span>{call.customer_phone || "—"}</span>
                </div>
              </div>
              <span className={`status ${call.status.replace("_", "-")}`}>
                {call.status.replace("_", " ")}
              </span>
            </div>

            <div className="live-card-meta">
              <span className="direction-tag">
                {call.direction === "inbound" ? "Incoming Call" : "Outgoing Call"}
              </span>
              <span className="agent-status online">
                <span />
                Handled by {call.handled_by.replace("_", " + ")}
              </span>
            </div>

            <div className="live-card-actions">
              <button
                className="secondary-button card-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setDetailCallId(call.id);
                }}
              >
                <Eye size={14} /> Record
              </button>
              <button
                className="primary-button card-action-btn"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  border: "none",
                  boxShadow: "0 2px 8px rgba(124, 58, 237, 0.3)",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setCoachingCall(call);
                }}
                title="Open Supervisor Coaching Console: Listen, Whisper or Barge"
              >
                <Shield size={14} /> Coach (Listen/Whisper)
              </button>
            </div>
          </section>
        ))}
      </div>

      {/* SUPERVISOR COACHING CONSOLE MODAL */}
      <SupervisorCoachingModal
        isOpen={!!coachingCall}
        callId={coachingCall?.id || null}
        customerName={coachingCall?.customer_name}
        customerPhone={coachingCall?.customer_phone}
        handledBy={coachingCall?.handled_by}
        durationSeconds={coachingCall?.duration_seconds || 0}
        onClose={() => {
          setCoachingCall(null);
          loadCalls();
        }}
      />

      {/* ACTIVE CALL CONSOLE */}
      <ActiveCallModal
        isOpen={isCallModalOpen}
        onClose={() => {
          setIsCallModalOpen(false);
          setActiveCallId(null);
          loadCalls();
        }}
        initialCallId={activeCallId}
        onCallCompleted={loadCalls}
      />

      {/* CALL DETAIL MODAL */}
      <CallDetailModal
        isOpen={!!detailCallId}
        callId={detailCallId}
        onClose={() => setDetailCallId(null)}
      />
    </>
  );
}
