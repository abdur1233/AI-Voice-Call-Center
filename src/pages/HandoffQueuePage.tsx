import { useEffect, useState, useCallback, useRef } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Eye,
  Headphones,
  Info,
  MessageSquare,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneOff,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  User,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import { useSoftphone } from "../context/SoftphoneContext";
import ActiveCallModal from "../components/ActiveCallModal";

export type HandoffItem = {
  id: number;
  call_id: number;
  customer_id: number | null;
  reason: string;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "assigned" | "accepted" | "rejected" | "in_progress" | "completed";
  assigned_agent_id: number | null;
  assigned_agent_name?: string | null;
  waiting_time_seconds: number;
  sentiment: string;
  language: string;
  customer_name: string | null;
  customer_phone: string | null;
  call_duration_seconds: number;
  notes: string | null;
  created_at: string;
};

type HandoffStats = {
  pending_count: number;
  assigned_count: number;
  in_progress_count: number;
  completed_count: number;
  avg_wait_seconds: number;
  urgent_pending: number;
};

export default function HandoffQueuePage() {
  const { agent } = useAuth();
  const { answerCall, setIsExpanded, setActiveTab } = useSoftphone();
  const [queue, setQueue] = useState<HandoffItem[]>([]);
  const [stats, setStats] = useState<HandoffStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);

  // Active call modal for taking over a call
  const [activeCallId, setActiveCallId] = useState<number | null>(null);
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);

  // Transcript view modal
  const [viewTranscriptHandoff, setViewTranscriptHandoff] = useState<HandoffItem | null>(null);
  const [transcriptLines, setTranscriptLines] = useState<any[]>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);

  // Customer view modal
  const [viewCustomerHandoff, setViewCustomerHandoff] = useState<HandoffItem | null>(null);

  // Real-time alert banner
  const [recentAlert, setRecentAlert] = useState<HandoffItem | null>(null);

  // Load Queue & Stats
  const loadData = useCallback(async () => {
    try {
      const filterParam = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      const [queueRes, statsRes] = await Promise.all([
        api<{ success: boolean; queue: HandoffItem[] }>(`/api/handoff${filterParam}`),
        api<{ success: boolean; stats: HandoffStats }>("/api/handoff/stats"),
      ]);
      setQueue(queueRes.queue);
      setStats(statsRes.stats);
    } catch (err) {
      console.error("[Load Handoff Queue Error]:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000);
    return () => clearInterval(interval);
  }, [loadData]);

  // WebSocket real-time alerts
  useEffect(() => {
    let ws: WebSocket | null = null;
    try {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.hostname;
      const port = 4000; // backend port
      ws = new WebSocket(`${proto}//${host}:${port}/ws`);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "new_handoff_request") {
            setRecentAlert(data.handoff);
            loadData();
          } else if (data.type === "handoff_status_changed") {
            loadData();
          }
        } catch (e) {
          // ignore
        }
      };
    } catch (e) {
      // ignore
    }

    return () => {
      if (ws) ws.close();
    };
  }, [loadData]);

  // Handle Accept Call
  const handleAcceptCall = async (item: HandoffItem) => {
    setActionLoadingId(item.id);
    try {
      // 1. Connect agent browser WebRTC softphone headset and mic directly
      await answerCall({
        callId: item.call_id,
        handoffId: item.id,
        customerName: item.customer_name || undefined,
        customerPhone: item.customer_phone || "+92 300 0000000",
        reason: item.reason,
        priority: item.priority,
        language: item.language,
      });

      // 2. Open softphone audio console & active call monitor
      setIsExpanded(true);
      setActiveTab("call");
      setActiveCallId(item.call_id);
      setIsCallModalOpen(true);
      loadData();
    } catch (err: any) {
      alert(err?.message || "Failed to accept handoff.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handle Reject Call
  const handleRejectCall = async (item: HandoffItem) => {
    if (!confirm(`Reject escalation for customer ${item.customer_name || item.customer_phone}? It will be returned to the queue.`)) {
      return;
    }
    setActionLoadingId(item.id);
    try {
      await api(`/api/handoff/${item.id}/reject`, {
        method: "POST",
        body: { reason: "Agent declined or unavailable" },
      });
      loadData();
    } catch (err: any) {
      alert(err?.message || "Failed to reject handoff.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Transcript Modal
  const handleOpenTranscript = async (item: HandoffItem) => {
    setViewTranscriptHandoff(item);
    setLoadingTranscript(true);
    try {
      const res = await api<{ success: boolean; transcripts: any[] }>(
        `/api/handoff/${item.id}`
      );
      setTranscriptLines(res.transcripts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTranscript(false);
    }
  };

  // Simulate Escalation
  const handleSimulateEscalation = async () => {
    try {
      await api("/api/handoff/simulate", {
        method: "POST",
        body: {
          reason: "Payment dispute - customer billed twice & demands supervisor",
          priority: "urgent",
          sentiment: "negative",
          language: "ur",
        },
      });
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const formatWaitTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  return (
    <>
      {/* REAL-TIME NOTIFICATION BANNER */}
      {recentAlert && (
        <div className="escalation-alert-banner">
          <div className="alert-badge-pulse">
            <Bell size={18} className="shake-bell" />
          </div>
          <div className="alert-content">
            <strong>URGENT ESCALATION REQUEST</strong>
            <p>
              New handoff from customer <strong>{recentAlert.customer_phone}</strong> ({recentAlert.customer_name || "Caller"}) —{" "}
              <em>"{recentAlert.reason}"</em>
            </p>
          </div>
          <div className="alert-actions">
            <button
              className="primary-button alert-accept-btn"
              onClick={() => {
                handleAcceptCall(recentAlert);
                setRecentAlert(null);
              }}
            >
              <PhoneForwarded size={14} /> Accept Call Now
            </button>
            <button
              className="secondary-button"
              onClick={() => setRecentAlert(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="welcome-row">
        <div>
          <h2>Human Agent Escalation &amp; Handoff Queue</h2>
          <p>
            Real-time queue of customer calls escalated from AI to human specialists.
          </p>
        </div>
        <div className="welcome-action-buttons">
          <button className="secondary-button" onClick={loadData} title="Refresh Queue">
            <RefreshCw size={15} /> Refresh
          </button>
          <button
            className="secondary-button simulate-btn"
            onClick={handleSimulateEscalation}
            title="Simulate an escalation"
          >
            <ShieldAlert size={16} /> Simulate Escalation Request
          </button>
        </div>
      </div>

      {/* TOP SUMMARY STATS */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Pending In Queue</span>
            <span className="stat-icon alert-icon">
              <Clock size={18} />
            </span>
          </div>
          <div className="stat-bottom">
            <strong>{stats?.pending_count || 0}</strong>
            {stats && stats.urgent_pending > 0 && (
              <span className="priority-pill urgent">
                {stats.urgent_pending} Urgent
              </span>
            )}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Assigned to Agents</span>
            <span className="stat-icon">
              <Users size={18} />
            </span>
          </div>
          <div className="stat-bottom">
            <strong>{stats?.assigned_count || 0}</strong>
            <span className="status-note">Waiting agent response</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">In Progress (Active)</span>
            <span className="stat-icon live-icon">
              <Headphones size={18} />
            </span>
          </div>
          <div className="stat-bottom">
            <strong>{stats?.in_progress_count || 0}</strong>
            <span className="tiny-live">
              <span /> Agent Speaking
            </span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <span className="stat-label">Avg. Queue Wait Time</span>
            <span className="stat-icon">
              <Clock size={18} />
            </span>
          </div>
          <div className="stat-bottom">
            <strong>{formatWaitTime(stats?.avg_wait_seconds || 0)}</strong>
            <span className="status-note">Target &lt; 45s</span>
          </div>
        </div>
      </div>

      {/* STATUS FILTER TABS */}
      <div className="handoff-tabs-row">
        {[
          { key: "all", label: "All Escalations" },
          { key: "pending", label: "Pending" },
          { key: "assigned", label: "Assigned" },
          { key: "in_progress", label: "In Progress" },
          { key: "completed", label: "Completed" },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`tab-btn ${statusFilter === tab.key ? "active" : ""}`}
            onClick={() => setStatusFilter(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* QUEUE TABLE */}
      <section className="panel table-panel">
        <div className="panel-header">
          <div>
            <h3>Active Escalation Requests</h3>
            <p>Calls routed to human specialists based on urgency and rules.</p>
          </div>
          <span className="live-pill">
            <span /> Real-Time Auto-Dispatch
          </span>
        </div>

        {!loading && queue.length === 0 ? (
          <div className="empty-panel">
            <CheckCircle2 size={36} color="#16a34a" />
            <h4>Escalation Queue is Empty</h4>
            <p>
              All customer calls are currently resolved by the AI Voice Specialist or
              active agents. Click "Simulate Escalation Request" to test.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="handoff-table">
              <thead>
                <tr>
                  <th>CUSTOMER</th>
                  <th>CALL ID</th>
                  <th>REASON &amp; CONTEXT</th>
                  <th>PRIORITY</th>
                  <th>SENTIMENT</th>
                  <th>WAITING</th>
                  <th>ASSIGNED TO</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.id} className={`queue-row priority-${item.priority}`}>
                    <td>
                      <div className="customer-cell">
                        <div className="customer-avatar">
                          {(item.customer_name || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <strong>{item.customer_name || "Valued Caller"}</strong>
                          <span>{item.customer_phone || "—"}</span>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="call-id-badge">#{item.call_id}</span>
                      <span className="lang-tag-tiny">{item.language.toUpperCase()}</span>
                    </td>

                    <td>
                      <div className="reason-cell">
                        <strong>{item.reason}</strong>
                        {item.notes && <span className="notes-text">{item.notes}</span>}
                      </div>
                    </td>

                    <td>
                      <span className={`priority-pill ${item.priority}`}>
                        {item.priority}
                      </span>
                    </td>

                    <td>
                      <span className={`sentiment-badge ${item.sentiment}`}>
                        {item.sentiment}
                      </span>
                    </td>

                    <td>
                      <span className="wait-time-tag">
                        <Clock size={12} /> {formatWaitTime(item.waiting_time_seconds || 0)}
                      </span>
                    </td>

                    <td>
                      <span className="assigned-agent-tag">
                        {item.assigned_agent_name ? (
                          <>
                            <User size={12} /> {item.assigned_agent_name}
                          </>
                        ) : (
                          <span className="unassigned-text">Unassigned</span>
                        )}
                      </span>
                    </td>

                    <td>
                      <span className={`status-pill ${item.status}`}>
                        {item.status.replace("_", " ")}
                      </span>
                    </td>

                    <td>
                      <div className="action-buttons-cell">
                        {item.status !== "completed" && item.status !== "in_progress" && (
                          <button
                            type="button"
                            className="primary-button accept-btn-sm"
                            title="Accept call and bridge audio"
                            disabled={actionLoadingId === item.id}
                            onClick={() => handleAcceptCall(item)}
                          >
                            <PhoneForwarded size={13} /> Accept
                          </button>
                        )}

                        {item.status === "in_progress" && (
                          <button
                            type="button"
                            className="primary-button monitor-btn-sm"
                            onClick={() => {
                              setActiveCallId(item.call_id);
                              setIsCallModalOpen(true);
                            }}
                          >
                            <Headphones size={13} /> Speak
                          </button>
                        )}

                        {item.status !== "completed" && item.status !== "in_progress" && (
                          <button
                            type="button"
                            className="secondary-button reject-btn-sm"
                            title="Reject call"
                            disabled={actionLoadingId === item.id}
                            onClick={() => handleRejectCall(item)}
                          >
                            <X size={13} />
                          </button>
                        )}

                        <button
                          type="button"
                          className="secondary-button transcript-btn-sm"
                          title="View Live Transcript"
                          onClick={() => handleOpenTranscript(item)}
                        >
                          <MessageSquare size={13} />
                        </button>

                        <button
                          type="button"
                          className="secondary-button info-btn-sm"
                          title="Customer Details"
                          onClick={() => setViewCustomerHandoff(item)}
                        >
                          <Eye size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* TRANSCRIPT MODAL */}
      {viewTranscriptHandoff && (
        <div className="modal-overlay" onClick={() => setViewTranscriptHandoff(null)}>
          <div className="modal-content transcript-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Call #{viewTranscriptHandoff.call_id} Live Transcript</h3>
                <p>
                  Customer: {viewTranscriptHandoff.customer_name} ({viewTranscriptHandoff.customer_phone}) • Reason: {viewTranscriptHandoff.reason}
                </p>
              </div>
              <button className="modal-close-btn" onClick={() => setViewTranscriptHandoff(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="transcript-modal-body">
              {loadingTranscript ? (
                <p>Loading transcripts...</p>
              ) : transcriptLines.length === 0 ? (
                <p>No dialogue recorded yet.</p>
              ) : (
                transcriptLines.map((line) => (
                  <div
                    key={line.id}
                    className={`transcript-bubble ${
                      line.speaker === "customer"
                        ? "customer-bubble"
                        : line.speaker === "ai"
                        ? "ai-bubble"
                        : "agent-bubble"
                    }`}
                  >
                    <div className="bubble-header">
                      <span className="speaker-name">
                        {line.speaker === "customer" ? "Customer" : line.speaker === "ai" ? "AI Voice Bot" : "Human Agent"}
                      </span>
                      {line.sentiment && (
                        <span className={`sentiment-badge ${line.sentiment}`}>
                          {line.sentiment}
                        </span>
                      )}
                    </div>
                    <p className="bubble-text">{line.original_text}</p>
                  </div>
                ))
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  handleAcceptCall(viewTranscriptHandoff);
                  setViewTranscriptHandoff(null);
                }}
              >
                <PhoneForwarded size={16} /> Take Over &amp; Connect Voice
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setViewTranscriptHandoff(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOMER DETAILS MODAL */}
      {viewCustomerHandoff && (
        <div className="modal-overlay" onClick={() => setViewCustomerHandoff(null)}>
          <div className="modal-content customer-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Customer Escalation Profile</h3>
              <button className="modal-close-btn" onClick={() => setViewCustomerHandoff(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="customer-modal-body">
              <div className="detail-row">
                <span>Name:</span>
                <strong>{viewCustomerHandoff.customer_name || "Valued Caller"}</strong>
              </div>
              <div className="detail-row">
                <span>Phone:</span>
                <strong>{viewCustomerHandoff.customer_phone || "—"}</strong>
              </div>
              <div className="detail-row">
                <span>Language:</span>
                <strong>{viewCustomerHandoff.language.toUpperCase()}</strong>
              </div>
              <div className="detail-row">
                <span>Escalation Reason:</span>
                <strong style={{ color: "#e11d48" }}>{viewCustomerHandoff.reason}</strong>
              </div>
              <div className="detail-row">
                <span>Priority:</span>
                <span className={`priority-pill ${viewCustomerHandoff.priority}`}>
                  {viewCustomerHandoff.priority.toUpperCase()}
                </span>
              </div>
              <div className="detail-row">
                <span>Sentiment:</span>
                <span className={`sentiment-badge ${viewCustomerHandoff.sentiment}`}>
                  {viewCustomerHandoff.sentiment}
                </span>
              </div>
              <div className="detail-row">
                <span>Call Duration so far:</span>
                <strong>{viewCustomerHandoff.call_duration_seconds} seconds</strong>
              </div>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  handleAcceptCall(viewCustomerHandoff);
                  setViewCustomerHandoff(null);
                }}
              >
                <PhoneForwarded size={16} /> Accept Call
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setViewCustomerHandoff(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE CALL CONSOLE MODAL */}
      <ActiveCallModal
        isOpen={isCallModalOpen}
        onClose={() => {
          setIsCallModalOpen(false);
          setActiveCallId(null);
          loadData();
        }}
        initialCallId={activeCallId}
        onCallCompleted={loadData}
      />
    </>
  );
}
