import { useState, type FormEvent } from "react";
import { Phone, Loader2 } from "lucide-react";
import { useAuth } from "./AuthContext";
import { Link, Navigate } from "react-router-dom";

export default function LoginPage() {
  const { agent, login } = useAuth();

  // If already logged in, redirect to dashboard
  if (agent) {
    return <Navigate to="/" replace />;
  }
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || "Could not log in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="brand-mark">
            <Phone size={20} />
          </div>
          <div>
            <strong>VoiceAI</strong>
            <span>Call Center</span>
          </div>
        </div>

        <h1>Welcome back</h1>
        <p>Log in to your agent dashboard.</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button
            type="submit"
            className="primary-button auth-submit"
            disabled={loading}
          >
            {loading && <Loader2 size={16} className="spin" />}
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="auth-footnote">
          First time here?{" "}
          <Link to="/setup">Set up the first admin account</Link>
        </p>
      </div>
    </div>
  );
}
