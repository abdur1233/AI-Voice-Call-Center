import { useEffect, useState, useCallback } from "react";
import {
  Bot,
  Clock3,
  Headphones,
  Phone,
  PhoneCall,
  PhoneIncoming,
  Eye,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../AuthContext";
import ActiveCallModal from "../components/ActiveCallModal";
import CallDetailModal from "../components/CallDetailModal";

type Stats = {
  total_calls: number;
  active_calls: number;
  avg_duration_seconds: number;
  ai_resolution_rate: number;
};

type CallRow = {
  id: number;
  customer_name: string | null;
  customer_phone: string | null;
  direction: string;
  status: string;
  handled_by: string;
  duration_seconds: number;
};

type AgentRow = {
  id: number;
  name: string;
  role: string;
  status: string;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function DashboardPage() {
  const { agent } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isCallModalOpen, setIsCallModalOpen] = useState(false);
  const [activeCallId, setActiveCallId] = useState<number | null>(null);
  const [selectedDetailCallId, setSelectedDetailCallId] = useState<number | null>(null);
  const [simulating, setSimulating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [statsRes, callsRes, agentsRes] = await Promise.all([
        api<{ stats: Stats }>("/api/calls/stats/summary"),
        api<{ calls: CallRow[] }>("/api/calls"),
        api<{ agents: AgentRow[] }>("/api/agents"),
      ]);
      setStats(statsRes.stats);
      setCalls(callsRes.calls.slice(0, 6));
      setAgents(agentsRes.agents.slice(0, 3));
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Simulate an incoming call
  const handleSimulateIncoming = async () => {
    setSimulating(true);
    try {
      const res = await api<{ call: { id: number } }>("/api/calls/simulate-incoming", {
        method: "POST",
      });
      setActiveCallId(res.call.id);
      setIsCallModalOpen(true);
      loadData();
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
          <h2>Good day, {agent?.name?.split(" ")[0] || "there"} 👋</h2>
          <p>Here&apos;s what&apos;s happening with your call center today.</p>
        </div>
        <div className="welcome-action-buttons">
          <button
            className="secondary-button simulate-btn"
            onClick={handleSimulateIncoming}
            disabled={simulating}
          >
            <PhoneIncoming size={17} /> Simulate Inbound Call
          </button>
          <button
            className="primary-button"
            onClick={() => {
              setActiveCallId(null);
              setIsCallModalOpen(true);
            }}
          >
            <PhoneCall size={17} /> Start New Call
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          title="Total Calls"
          value={loading ? "—" : String(stats?.total_calls ?? 0)}
          icon={<PhoneCall size={21} />}
        />
        <StatCard
          title="Active Calls"
          value={loading ? "—" : String(stats?.active_calls ?? 0)}
          icon={<Headphones size={21} />}
          live
        />
        <StatCard
          title="Avg. Call Duration"
          value={
            loading
              ? "—"
              : formatDuration(stats?.avg_duration_seconds ?? 0)
          }
          icon={<Clock3 size={21} />}
        />
        <StatCard
          title="AI Resolution Rate"
          value={loading ? "—" : `${stats?.ai_resolution_rate ?? 0}%`}
          icon={<Bot size={21} />}
        />
      </div>

      <div className="dashboard-grid">
        <section className="panel call-panel">
          <div className="panel-header">
            <div>
              <h3>Recent Calls</h3>
              <p>Latest call activity</p>
            </div>
            <span className="live-pill">
              <span /> LIVE
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {calls.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      No calls yet.
                    </td>
                  </tr>
                )}
                {calls.map((call) => (
                  <tr
                    key={call.id}
                    className="clickable-table-row"
                    onClick={() => setSelectedDetailCallId(call.id)}
                    title="Click to view conversation transcript and summary"
                  >
                    <td>
                      <div className="customer-cell">
                        <div className="customer-avatar">
                          {(call.customer_name || "?")
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div>
                          <strong>
                            {call.customer_name || "Unknown"}
                          </strong>
                          <span>{call.customer_phone || "—"}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="call-type">
                        <span
                          className={
                            call.direction === "inbound"
                              ? "in-dot"
                              : "out-dot"
                          }
                        />
                        {call.direction === "inbound"
                          ? "Incoming"
                          : "Outgoing"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`status ${call.status.replace(
                          "_",
                          "-"
                        )}`}
                      >
                        {call.status.replace("_", " ")}
                      </span>
                    </td>
                    <td>{formatDuration(call.duration_seconds)}</td>
                    <td>
                      <button
                        className="row-action"
                        aria-label="View Details"
                        title="View Call Details & Transcript"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDetailCallId(call.id);
                        }}
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel ai-panel">
          <div className="panel-header">
            <div>
              <h3>Team Status</h3>
              <p>Your agents</p>
            </div>
          </div>
          {agents.length === 0 && !loading && (
            <p className="empty-cell">No team members yet.</p>
          )}
          {agents.map((a) => (
            <Agent key={a.id} name={a.name} status={a.status} />
          ))}
        </section>
      </div>

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

      {/* CALL DETAIL & TRANSCRIPT MODAL */}
      <CallDetailModal
        callId={selectedDetailCallId}
        isOpen={!!selectedDetailCallId}
        onClose={() => setSelectedDetailCallId(null)}
      />
    </>
  );
}

function StatCard({
  title,
  value,
  icon,
  live = false,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  live?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <div className="stat-icon">{icon}</div>
        {live && (
          <span className="tiny-live">
            <span /> Live
          </span>
        )}
      </div>
      <p>{title}</p>
      <div className="stat-bottom">
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Agent({ name, status }: { name: string; status: string }) {
  return (
    <div className="agent-row">
      <div className="agent-icon">
        <Bot size={20} />
      </div>
      <div className="agent-info">
        <strong>{name}</strong>
      </div>
      <span className={`agent-status ${status.replace("_", "-")}`}>
        <span />
        {status.replace("_", " ")}
      </span>
    </div>
  );
}
