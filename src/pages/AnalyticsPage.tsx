import { useEffect, useState } from "react";
import { Activity, Bot, Clock3, PhoneCall } from "lucide-react";
import { api } from "../api";

type Stats = {
  total_calls: number;
  active_calls: number;
  avg_duration_seconds: number;
  ai_resolution_rate: number;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ stats: Stats }>("/api/calls/stats/summary")
      .then((res) => setStats(res.stats))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="welcome-row">
        <div>
          <h2>Analytics</h2>
          <p>A high-level view of your call center&apos;s performance.</p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon">
              <PhoneCall size={21} />
            </div>
          </div>
          <p>Total Calls (all time)</p>
          <div className="stat-bottom">
            <strong>{loading ? "—" : stats?.total_calls ?? 0}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon">
              <Activity size={21} />
            </div>
          </div>
          <p>Active Calls Right Now</p>
          <div className="stat-bottom">
            <strong>{loading ? "—" : stats?.active_calls ?? 0}</strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon">
              <Clock3 size={21} />
            </div>
          </div>
          <p>Average Call Duration</p>
          <div className="stat-bottom">
            <strong>
              {loading
                ? "—"
                : formatDuration(stats?.avg_duration_seconds ?? 0)}
            </strong>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-top">
            <div className="stat-icon">
              <Bot size={21} />
            </div>
          </div>
          <p>AI Resolution Rate</p>
          <div className="stat-bottom">
            <strong>
              {loading ? "—" : `${stats?.ai_resolution_rate ?? 0}%`}
            </strong>
          </div>
        </div>
      </div>

      <section className="panel empty-panel">
        <Activity size={28} />
        <p>
          More detailed charts (call volume over time, sentiment
          trends, language breakdown) will appear here once the AI
          agent and telephony are wired up.
        </p>
      </section>
    </>
  );
}
