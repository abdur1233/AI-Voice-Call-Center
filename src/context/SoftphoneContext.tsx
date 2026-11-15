import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useAuth } from "../AuthContext";
import { api } from "../api";
import { softphoneAudio } from "../services/softphoneAudioService";

export type SoftphoneCallStatus = "idle" | "ringing" | "connected" | "on_hold";

export type SoftphoneCallDetails = {
  callId: number;
  handoffId?: number | null;
  customerName?: string;
  customerPhone: string;
  reason?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  language?: string;
  startedAt?: Date;
  transcripts?: Array<{ speaker: string; text: string }>;
};

type SoftphoneContextType = {
  isOnline: boolean;
  setIsOnline: (online: boolean) => void;
  status: SoftphoneCallStatus;
  activeCall: SoftphoneCallDetails | null;
  incomingCall: SoftphoneCallDetails | null;
  isMuted: boolean;
  isOnHold: boolean;
  micLevel: number;
  callerLevel: number;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
  activeTab: "dialer" | "call" | "settings";
  setActiveTab: (tab: "dialer" | "call" | "settings") => void;
  answerCall: (callDetails?: SoftphoneCallDetails) => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleHold: () => void;
  dialDigit: (digit: string) => void;
  makeOutboundCall: (phone: string, name?: string) => Promise<void>;
  audioDevices: MediaDeviceInfo[];
  selectedMicId: string;
  setSelectedMicId: (id: string) => void;
  recentTranscriptLines: Array<{ speaker: string; text: string }>;
  supervisorCoaching: { mode: string; supervisorName: string } | null;
  supervisorHint: { text: string; supervisorName: string; time: Date } | null;
  clearSupervisorHint: () => void;
};

const SoftphoneContext = createContext<SoftphoneContextType | undefined>(undefined);

export function SoftphoneProvider({ children }: { children: React.ReactNode }) {
  const { agent } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [status, setStatus] = useState<SoftphoneCallStatus>("idle");
  const [activeCall, setActiveCall] = useState<SoftphoneCallDetails | null>(null);
  const [incomingCall, setIncomingCall] = useState<SoftphoneCallDetails | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [callerLevel, setCallerLevel] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"dialer" | "call" | "settings">("dialer");
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>("");
  const [recentTranscriptLines, setRecentTranscriptLines] = useState<
    Array<{ speaker: string; text: string }>
  >([]);
  const [supervisorCoaching, setSupervisorCoaching] = useState<{
    mode: string;
    supervisorName: string;
  } | null>(null);
  const [supervisorHint, setSupervisorHint] = useState<{
    text: string;
    supervisorName: string;
    time: Date;
  } | null>(null);

  const clearSupervisorHint = () => setSupervisorHint(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Bind audio levels
  useEffect(() => {
    softphoneAudio.onMicLevel = (lvl) => setMicLevel(lvl);
    softphoneAudio.onCallerLevel = (lvl) => setCallerLevel(lvl);
  }, []);

  // Enumerate audio input devices
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const audioInputs = devices.filter((d) => d.kind === "audioinput");
          setAudioDevices(audioInputs);
          if (audioInputs.length > 0 && !selectedMicId) {
            setSelectedMicId(audioInputs[0].deviceId);
          }
        })
        .catch((err) => console.warn("[Audio Devices Error]:", err));
    }
  }, [selectedMicId]);

  // Connect WebSocket to /ws
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    let ws: WebSocket;
    let reconnectTimeout: any;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("[Softphone WS Connected]");
          if (agent) {
            ws.send(
              JSON.stringify({
                type: "agent_register",
                agentId: agent.id,
                agentName: agent.name || agent.email,
              })
            );
          }
        };

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);

            switch (data.type) {
              case "new_handoff_request": {
                if (!isOnline) return;
                const handoff = data.handoff || {};
                const newIncoming: SoftphoneCallDetails = {
                  callId: data.callId || handoff.call_id,
                  handoffId: handoff.id,
                  customerName: handoff.customer_name || "Valued Customer",
                  customerPhone: handoff.customer_phone || "+92 300 0000000",
                  reason: handoff.reason || "Customer requested human specialist",
                  priority: handoff.priority || "high",
                  language: handoff.language || "en",
                  startedAt: new Date(),
                };
                setIncomingCall(newIncoming);
                setStatus("ringing");
                setIsExpanded(true);
                softphoneAudio.startRinging();
                break;
              }

              case "caller_audio": {
                // Play audio packet through agent headphones
                if (data.payload) {
                  softphoneAudio.playCallerAudioChunk(data.payload);
                }
                break;
              }

              case "supervisor_whisper_audio": {
                if (data.payload) {
                  softphoneAudio.playSupervisorAudioChunk(data.payload, true);
                }
                break;
              }

              case "supervisor_barge_audio": {
                if (data.payload) {
                  softphoneAudio.playSupervisorAudioChunk(data.payload, false);
                }
                break;
              }

              case "supervisor_coaching_status": {
                if (data.mode === "disconnected") {
                  setSupervisorCoaching(null);
                } else {
                  setSupervisorCoaching({
                    mode: data.mode,
                    supervisorName: data.supervisorName || "Supervisor",
                  });
                }
                break;
              }

              case "supervisor_text_hint": {
                setSupervisorHint({
                  text: data.hintText,
                  supervisorName: data.supervisorName || "Supervisor",
                  time: new Date(),
                });
                break;
              }

              case "call_bridged": {
                console.log("[Softphone Call Bridged]:", data);
                setStatus("connected");
                setActiveTab("call");
                softphoneAudio.stopRinging();
                softphoneAudio.playConnectChime();
                break;
              }

              case "call_hold_status": {
                setIsOnHold(!!data.isOnHold);
                softphoneAudio.setHold(!!data.isOnHold);
                setStatus(data.isOnHold ? "on_hold" : "connected");
                break;
              }

              case "call_ended": {
                console.log("[Softphone Call Ended]");
                softphoneAudio.stopRinging();
                softphoneAudio.stopMicrophone();
                softphoneAudio.playDisconnectTone();
                setStatus("idle");
                setActiveCall(null);
                setIncomingCall(null);
                setIsMuted(false);
                setIsOnHold(false);
                break;
              }

              case "transcript_line": {
                if (data.speaker && data.text) {
                  setRecentTranscriptLines((prev) => [
                    ...prev.slice(-15),
                    { speaker: data.speaker, text: data.text },
                  ]);
                }
                break;
              }
            }
          } catch (err) {
            console.error("[Softphone WS Parse Error]:", err);
          }
        };

        ws.onclose = () => {
          console.warn("[Softphone WS Closed. Reconnecting in 3s...]");
          reconnectTimeout = setTimeout(connectWs, 3000);
        };

        ws.onerror = (err) => {
          console.error("[Softphone WS Error]:", err);
          ws.close();
        };
      } catch (err) {
        console.error("[Softphone WS Setup Error]:", err);
      }
    };

    connectWs();

    return () => {
      clearTimeout(reconnectTimeout);
      softphoneAudio.stopRinging();
      softphoneAudio.stopMicrophone();
      if (ws) ws.close();
    };
  }, [agent, isOnline]);

  // Stream microphone chunks to WebSocket
  useEffect(() => {
    softphoneAudio.onAudioChunk = (base64Mulaw) => {
      if (
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN &&
        activeCall?.callId &&
        status === "connected" &&
        !isMuted &&
        !isOnHold
      ) {
        wsRef.current.send(
          JSON.stringify({
            type: "agent_audio",
            callId: activeCall.callId,
            payload: base64Mulaw,
          })
        );
      }
    };
  }, [activeCall, status, isMuted, isOnHold]);

  // Answer an incoming call or take over handoff
  const answerCall = useCallback(
    async (callDetails?: SoftphoneCallDetails) => {
      const target = callDetails || incomingCall;
      if (!target) return;

      softphoneAudio.stopRinging();

      // 1. If associated with a handoff ID, mark accepted in PostgreSQL
      if (target.handoffId) {
        try {
          await api(`/api/handoff/${target.handoffId}/accept`, {
            method: "POST",
          });
        } catch (err) {
          console.warn("[Handoff DB Accept Warning]:", err);
        }
      }

      // 2. Start agent microphone capture
      await softphoneAudio.startMicrophone(selectedMicId || undefined);

      // 3. Send join call message to WebSocket server
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "agent_join_call",
            callId: target.callId,
            agentId: agent?.id || 1,
            customerPhone: target.customerPhone,
          })
        );
      }

      setActiveCall({
        ...target,
        startedAt: new Date(),
      });
      setIncomingCall(null);
      setStatus("connected");
      setActiveTab("call");
      setIsExpanded(true);
      await softphoneAudio.playConnectChime();
    },
    [incomingCall, agent, selectedMicId]
  );

  // Reject an incoming call
  const rejectCall = useCallback(async () => {
    softphoneAudio.stopRinging();
    if (incomingCall?.handoffId) {
      try {
        await api(`/api/handoff/${incomingCall.handoffId}/reject`, {
          method: "POST",
          body: { reason: "Agent declined via softphone" },
        });
      } catch (err) {
        console.warn("[Handoff Reject Warning]:", err);
      }
    }
    setIncomingCall(null);
    setStatus("idle");
  }, [incomingCall]);

  // End active call
  const endCall = useCallback(async () => {
    softphoneAudio.stopMicrophone();
    await softphoneAudio.playDisconnectTone();

    if (activeCall?.callId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "agent_hangup",
          callId: activeCall.callId,
        })
      );
    }

    if (activeCall?.handoffId) {
      try {
        await api(`/api/handoff/${activeCall.handoffId}/complete`, {
          method: "POST",
        });
      } catch (err) {
        console.warn("[Complete Handoff Warning]:", err);
      }
    }

    setStatus("idle");
    setActiveCall(null);
    setIncomingCall(null);
    setIsMuted(false);
    setIsOnHold(false);
  }, [activeCall]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    const next = !isMuted;
    setIsMuted(next);
    softphoneAudio.setMuted(next);
  }, [isMuted]);

  // Toggle Hold
  const toggleHold = useCallback(() => {
    const next = !isOnHold;
    setIsOnHold(next);
    softphoneAudio.setHold(next);

    if (activeCall?.callId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: next ? "agent_hold" : "agent_unhold",
          callId: activeCall.callId,
        })
      );
    }
  }, [isOnHold, activeCall]);

  // Dial DTMF touch tone digit
  const dialDigit = useCallback(
    (digit: string) => {
      softphoneAudio.playDtmfTone(digit);
      if (activeCall?.callId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "agent_dtmf",
            callId: activeCall.callId,
            digit,
          })
        );
      }
    },
    [activeCall]
  );

  // Make an outbound call directly from softphone dialer
  const makeOutboundCall = useCallback(
    async (phone: string, name?: string) => {
      try {
        setStatus("ringing");
        setIsExpanded(true);
        setActiveTab("call");

        const res = await api<{
          success: boolean;
          call: { id: number };
          twilioSid?: string;
        }>("/api/twilio/outbound", {
          method: "POST",
          body: {
            toPhone: phone,
            customerName: name || `Customer ${phone.slice(-4)}`,
          },
        });

        const newCall: SoftphoneCallDetails = {
          callId: res.call.id,
          customerName: name || `Customer ${phone.slice(-4)}`,
          customerPhone: phone,
          reason: "Outbound agent call",
          priority: "medium",
          language: "en",
          startedAt: new Date(),
        };

        await answerCall(newCall);
      } catch (err: any) {
        alert(err?.message || "Outbound call failed.");
        setStatus("idle");
      }
    },
    [answerCall]
  );

  return (
    <SoftphoneContext.Provider
      value={{
        isOnline,
        setIsOnline,
        status,
        activeCall,
        incomingCall,
        isMuted,
        isOnHold,
        micLevel,
        callerLevel,
        isExpanded,
        setIsExpanded,
        activeTab,
        setActiveTab,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        toggleHold,
        dialDigit,
        makeOutboundCall,
        audioDevices,
        selectedMicId,
        setSelectedMicId,
        recentTranscriptLines,
        supervisorCoaching,
        supervisorHint,
        clearSupervisorHint,
      }}
    >
      {children}
    </SoftphoneContext.Provider>
  );
}

export function useSoftphone() {
  const ctx = useContext(SoftphoneContext);
  if (!ctx) {
    throw new Error("useSoftphone must be used within a SoftphoneProvider");
  }
  return ctx;
}
