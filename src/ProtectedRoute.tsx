import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const { agent, loading } = useAuth();

  if (loading) {
    return (
      <div className="full-page-loader">
        <Loader2 size={28} className="spin" />
      </div>
    );
  }

  if (!agent) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
