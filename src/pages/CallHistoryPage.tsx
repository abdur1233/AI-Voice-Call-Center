import { useEffect, useState, useMemo } from "react";
import { Clock3, Eye, Filter, PhoneCall, Search } from "lucide-react";
import { api } from "../api";
import CallDetailModal from "../components/CallDetailModal";
import ActiveCallModal from "../components/ActiveCallModal";

type CallRow = {
  id: number;
  customer_name: string | null;
  customer_phone: string | null;
  agent_name: string | null;
  direction: string;
  status: string;
  handled_by: string;
  duration_seconds: number;
  started_at: string;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function CallHistoryPage() {
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCallId, setSelectedCallId] = useState<number | null>(null);
  const [isDialerOpen, setIsDialerOpen] = useState(false);

  const loadCalls = () => {
    setLoading(true);
    api<{ calls: CallRow[] }>("/api/calls")
      .then((res) => setCalls(res.calls))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadCalls();
  }, []);

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      const matchSearch =
        !searchQuery.trim() ||
        (call.customer_name &&
          call.customer_name
            .toLowerCase()
            .includes(searchQuery.toLowerCase())) ||
        (call.customer_phone &&
          call.customer_phone.includes(searchQuery.trim()));

      const matchStatus =
        statusFilter === "all" || call.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [calls, searchQuery, statusFilter]);

  return (
    <>
      <div className="welcome-row">
        <div>
          <h2>Call History &amp; Transcripts</h2>
          <p>Full archive of customer conversations, AI transcripts, and summaries.</p>
        </div>
        <button
          className="primary-button"
          onClick={() => setIsDialerOpen(true)}
        >
          <PhoneCall size={16} /> Start New Call
        </button>
      </div>

      <section className="panel">
        <div className="panel-header table-filter-header">
          <div>
            <h3>
              <Clock3 size={16} style={{ verticalAlign: "-3px" }} /> All
              Calls
            </h3>
            <p>
              Showing {filteredCalls.length} of {calls.length} total records
            </p>
          </div>

          <div className="table-controls-row">
            <div className="search-box-input">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search by customer or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="status-select-wrap">
              <Filter size={15} />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">All Statuses</option>
                <option value="completed">Completed</option>
                <option value="in_progress">In Progress</option>
                <option value="ringing">Ringing</option>
                <option value="on_hold">On Hold</option>
                <option value="missed">Missed</option>
              </select>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Agent</th>
                <th>Type</th>
                <th>Handled by</th>
                <th>Status</th>
                <th>Duration</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredCalls.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="empty-cell">
                    {calls.length === 0
                      ? "No calls yet."
                      : "No calls matched your filter criteria."}
                  </td>
                </tr>
              )}
              {filteredCalls.map((call) => (
                <tr
                  key={call.id}
                  className="clickable-table-row"
                  onClick={() => setSelectedCallId(call.id)}
                  title="Click to view conversation transcript and AI summary"
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
                        <strong>{call.customer_name || "Unknown"}</strong>
                        <span>{call.customer_phone || "—"}</span>
                      </div>
                    </div>
                  </td>
                  <td>{call.agent_name || "AI Voice Bot"}</td>
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
                  <td style={{ textTransform: "capitalize" }}>
                    {call.handled_by.replace("_", " + ")}
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
                      title="View Transcript & AI Summary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCallId(call.id);
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

      {/* CALL DETAIL & TRANSCRIPT MODAL */}
      <CallDetailModal
        callId={selectedCallId}
        isOpen={!!selectedCallId}
        onClose={() => setSelectedCallId(null)}
      />

      {/* DIALER MODAL */}
      <ActiveCallModal
        isOpen={isDialerOpen}
        onClose={() => {
          setIsDialerOpen(false);
          loadCalls();
        }}
        onCallCompleted={loadCalls}
      />
    </>
  );
}
