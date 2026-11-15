import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  Bot,
  BrainCircuit,
  ChevronDown,
  Clock3,
  Globe,
  LayoutDashboard,
  LogOut,
  Menu,
  Phone,
  PhoneCall,
  PhoneForwarded,
  Radio,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { api } from "./api";
import { useAuth } from "./AuthContext";
import { useLanguage, SUPPORTED_LANGUAGES, type LanguageCode } from "./LanguageContext";
import ActiveCallModal from "./components/ActiveCallModal";
import SoftphoneDialer from "./components/SoftphoneDialer";

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [quickCallOpen, setQuickCallOpen] = useState(false);
  const [pendingHandoffs, setPendingHandoffs] = useState(0);
  const { agent, logout } = useAuth();
  const { currentLang, setLanguage, t, isRtl } = useLanguage();
  const navigate = useNavigate();

  useEffect(() => {
    function checkStats() {
      api<{ success: boolean; stats: { pending_count: number } }>("/api/handoff/stats")
        .then((res) => setPendingHandoffs(res.stats?.pending_count || 0))
        .catch(() => {});
    }
    checkStats();
    const interval = setInterval(checkStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const navItems = [
    { label: t("dashboard"), to: "/", icon: LayoutDashboard },
    { label: t("liveCalls"), to: "/live-calls", icon: PhoneCall },
    { label: "Agent Escalations", to: "/handoff-queue", icon: PhoneForwarded, badge: pendingHandoffs },
    { label: t("callHistory"), to: "/call-history", icon: Clock3 },
    { label: t("customers"), to: "/customers", icon: Users },
    { label: t("team"), to: "/team", icon: Bot },
    { label: t("knowledgeBase"), to: "/knowledge-base", icon: BrainCircuit },
    { label: t("analytics"), to: "/analytics", icon: Activity },
    { label: t("settings"), to: "/settings", icon: Settings },
  ];

  const initials = (agent?.name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className={`app-shell ${isRtl ? "rtl-mode" : ""}`}>
      {sidebarOpen && (
        <button
          className="overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        />
      )}

      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <Phone size={20} />
          </div>
          <div>
            <strong>VoiceAI</strong>
            <span>OmniCall Pro</span>
          </div>
          <button
            className="mobile-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="nav-list">
          <p className="nav-label">MAIN NAVIGATION</p>
          {navItems.map(({ label, to, icon: Icon, badge }: any) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="nav-badge-pill">{badge}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="security-card">
            <ShieldCheck size={20} />
            <div>
              <strong>{t("systemSecure")}</strong>
              <span>{t("allServicesOperational")}</span>
            </div>
          </div>

          <div className="profile-wrap">
            <button
              className="profile"
              onClick={() => setProfileOpen((v) => !v)}
            >
              <div className="avatar">{initials}</div>
              <div className="profile-text">
                <strong>{agent?.name || "Admin"}</strong>
                <span>
                  {agent?.role === "admin" ? "Administrator" : "Agent"}
                </span>
              </div>
              <ChevronDown size={16} />
            </button>

            {profileOpen && (
              <div className="profile-menu">
                <button onClick={handleLogout}>
                  <LogOut size={15} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            <div className="topbar-ai-status">
              <span className="live-pulse-dot" />
              <span className="ai-status-text">
                <Sparkles size={14} className="sparkle-icon" /> AI Voice Core:{" "}
                <strong>Multilingual &amp; Universal</strong>
              </span>
            </div>
          </div>

          <div className="topbar-right">
            {/* GLOBAL LANGUAGE SWITCHER */}
            <div className="language-selector-wrapper">
              <Globe size={16} className="lang-icon" />
              <select
                value={currentLang}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                className="topbar-lang-select"
                title="Change Platform Language"
              >
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.flag} {lang.nativeName}
                  </option>
                ))}
              </select>
            </div>

            {/* INSTANT VOICE CALL TRIGGER */}
            <button
              className="primary-button topbar-call-btn"
              onClick={() => setQuickCallOpen(true)}
            >
              <PhoneCall size={16} />
              <span>{t("startCall")}</span>
            </button>
          </div>
        </header>

        <section className="content">
          <Outlet />
        </section>
      </main>

      {/* QUICK VOICE CALL MODAL */}
      <ActiveCallModal
        isOpen={quickCallOpen}
        onClose={() => setQuickCallOpen(false)}
      />

      {/* IN-DASHBOARD WEBRTC SOFTPHONE */}
      <SoftphoneDialer />
    </div>
  );
}
