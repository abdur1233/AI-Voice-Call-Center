import { useEffect, useState, type FormEvent } from "react";
import { Bot, UserPlus } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../AuthContext";

type Agent = {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
};

export default function TeamPage() {
  const { agent: currentAgent } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("agent");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  function load() {
    setLoading(true);
    api<{ agents: Agent[] }>("/api/agents")
      .then((res) => setAgents(res.agents))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAddAgent(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    setSaving(true);

    try {
      await api("/api/agents", {
        method: "POST",
        body: { name, email, password, role },
      });
      setName("");
      setEmail("");
      setPassword("");
      setRole("agent");
      setShowForm(false);
      load();
    } catch (err: any) {
      setFormError(err.message || "Could not add team member.");
    } finally {
      setSaving(false);
    }
  }

  const isAdmin = currentAgent?.role === "admin";

  return (
    <>
      <div className="welcome-row">
        <div>
          <h2>Team</h2>
          <p>Human agents and admins who can log in to this dashboard.</p>
        </div>
        {isAdmin && (
          <button
            className="primary-button"
            onClick={() => setShowForm((v) => !v)}
          >
            <UserPlus size={17} /> Add Team Member
          </button>
        )}
      </div>

      {showForm && (
        <section className="panel form-panel">
          <form onSubmit={handleAddAgent} className="inline-form">
            <input
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              placeholder="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              placeholder="Temporary password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="submit"
              className="primary-button"
              disabled={saving}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </form>
          {formError && <div className="auth-error">{formError}</div>}
        </section>
      )}

      <div className="team-grid">
        {agents.length === 0 && !loading && (
          <section className="panel empty-panel">
            <Bot size={28} />
            <p>No team members yet.</p>
          </section>
        )}
        {agents.map((a) => (
          <section key={a.id} className="panel team-card">
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 14 }}>
              {a.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <strong>{a.name}</strong>
            <span className="team-email">{a.email}</span>
            <div className="team-tags">
              <span className="tag">{a.role}</span>
              <span className={`agent-status ${a.status.replace("_", "-")}`}>
                <span />
                {a.status.replace("_", " ")}
              </span>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
