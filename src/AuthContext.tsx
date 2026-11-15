import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { api, getToken, setToken, clearToken } from "./api";

export type Agent = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "agent";
  status: string;
};

type AuthContextValue = {
  agent: Agent | null;
  loading: boolean;
  needsSetup: boolean;
  login: (email: string, password: string) => Promise<void>;
  completeSetup: (
    name: string,
    email: string,
    password: string,
    setupKey: string
  ) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      const token = getToken();

      if (!token) {
        // No token yet — check whether an admin already
        // exists, so we know whether to show Setup or Login.
        try {
          await api("/api/auth/me");
        } catch {
          // expected to fail (401) — that's fine, we just
          // wanted to confirm the API is reachable.
        }
        setLoading(false);
        return;
      }

      try {
        const data = await api<{ success: boolean; agent: Agent }>(
          "/api/auth/me"
        );
        setAgent(data.agent);
      } catch {
        clearToken();
      } finally {
        setLoading(false);
      }
    }

    bootstrap();
  }, []);

  async function login(email: string, password: string) {
    const data = await api<{
      success: boolean;
      token: string;
      agent: Agent;
    }>("/api/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuth: true,
    });

    setToken(data.token);
    setAgent(data.agent);
  }

  async function completeSetup(
    name: string,
    email: string,
    password: string,
    setupKey: string
  ) {
    const data = await api<{
      success: boolean;
      token: string;
      agent: Agent;
    }>("/api/auth/setup", {
      method: "POST",
      body: { name, email, password, setupKey },
      skipAuth: true,
    });

    setToken(data.token);
    setAgent(data.agent);
    setNeedsSetup(false);
  }

  function logout() {
    clearToken();
    setAgent(null);
  }

  return (
    <AuthContext.Provider
      value={{
        agent,
        loading,
        needsSetup,
        login,
        completeSetup,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return ctx;
}
