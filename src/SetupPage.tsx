import { useState, type FormEvent } from "react";
import { Phone, Loader2 } from "lucide-react";
import { useAuth } from "./AuthContext";
import { Link } from "react-router-dom";

export default function SetupPage() {
  const { completeSetup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await completeSetup(name, email, password, setupKey);
    } catch (err: any) {
      setError(err.message || "Could not complete setup.");
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

        <h1>Create your admin account</h1>
        <p>
          This only works once — it creates the very first
          account for your call center.
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Full name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Admin User"
              required
              autoFocus
            />
          </label>

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </label>

          <label>
            Setup key
            <input
              value={setupKey}
              onChange={(e) => setSetupKey(e.target.value)}
              placeholder="From your server's .env file"
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
            {loading ? "Creating account..." : "Create admin account"}
          </button>
        </form>

        <p className="auth-footnote">
          Already set up? <Link to="/login">Log in instead</Link>
        </p>
      </div>
    </div>
  );
}
