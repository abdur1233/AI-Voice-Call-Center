import React, { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Delete,
  Headphones,
  Mic,
  MicOff,
  Pause,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneOff,
  Play,
  Radio,
  Settings,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { useSoftphone } from "../context/SoftphoneContext";

export default function SoftphoneDialer() {
  const {
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
  } = useSoftphone();

  const [dialInput, setDialInput] = useState("");
  const [callDuration, setCallDuration] = useState(0);

  // Call duration counter
  useEffect(() => {
    let timer: any;
    if (status === "connected" || status === "on_hold") {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [status]);

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleKeyPress = (digit: string) => {
    dialDigit(digit);
    if (status === "idle") {
      setDialInput((prev) => prev + digit);
    }
  };

  const handleBackspace = () => {
    setDialInput((prev) => prev.slice(0, -1));
  };

  const handleCallNumber = () => {
    if (!dialInput.trim()) return;
    makeOutboundCall(dialInput.trim());
  };

  const keys = [
    { num: "1", sub: "" },
    { num: "2", sub: "ABC" },
    { num: "3", sub: "DEF" },
    { num: "4", sub: "GHI" },
    { num: "5", sub: "JKL" },
    { num: "6", sub: "MNO" },
    { num: "7", sub: "PQRS" },
    { num: "8", sub: "TUV" },
    { num: "9", sub: "WXYZ" },
    { num: "*", sub: "" },
    { num: "0", sub: "+" },
    { num: "#", sub: "" },
  ];

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end">
      {/* 1. COLLAPSED DOCKED PILL */}
      {!isExpanded && (
        <div
          onClick={() => setIsExpanded(true)}
          className={`flex items-center gap-3 px-4 py-2.5 rounded-full shadow-2xl cursor-pointer transition-all duration-200 border ${
            status === "ringing"
              ? "bg-red-950 border-red-500 text-red-200 animate-bounce"
              : status === "connected"
              ? "bg-emerald-950 border-emerald-500 text-emerald-200"
              : "bg-slate-900 border-slate-700 text-slate-200 hover:border-indigo-500"
          }`}
        >
          <div className="relative">
            <Headphones className="w-5 h-5 text-indigo-400" />
            <span
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                !isOnline
                  ? "bg-slate-500"
                  : status === "ringing"
                  ? "bg-red-500 animate-ping"
                  : status === "connected"
                  ? "bg-emerald-400"
                  : "bg-green-500"
              }`}
            />
          </div>

          <div className="flex flex-col text-xs">
            <span className="font-semibold flex items-center gap-1.5">
              Softphone
              {status === "connected" && (
                <span className="text-emerald-400 font-mono">
                  ● {formatSeconds(callDuration)}
                </span>
              )}
            </span>
            <span className="text-[10px] text-slate-400">
              {status === "ringing"
                ? "Incoming Ringing..."
                : status === "connected"
                ? activeCall?.customerPhone || "On Call"
                : isOnline
                ? "Available (Ready)"
                : "Offline"}
            </span>
          </div>

          {/* Quick Accept/Decline in pill if ringing */}
          {status === "ringing" && (
            <div
              className="flex items-center gap-1.5 ml-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => answerCall()}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md text-xs font-semibold flex items-center gap-1 shadow-lg"
              >
                <PhoneCall className="w-3.5 h-3.5" /> Accept
              </button>
              <button
                onClick={() => rejectCall()}
                className="px-2 py-1 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-xs font-semibold"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <ChevronUp className="w-4 h-4 text-slate-400 ml-1" />
        </div>
      )}

      {/* 2. EXPANDED SOFTPHONE WINDOW */}
      {isExpanded && (
        <div className="w-80 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-slate-800/80 border-b border-slate-700/60">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Headphones className="w-4 h-4 text-indigo-400" />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${
                    !isOnline
                      ? "bg-slate-500"
                      : status === "connected"
                      ? "bg-emerald-400"
                      : "bg-green-500"
                  }`}
                />
              </div>
              <span className="text-xs font-semibold tracking-wide">
                WebRTC Softphone
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsOnline(!isOnline)}
                className={`text-[10px] px-2 py-0.5 rounded font-medium border ${
                  isOnline
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : "bg-slate-700 border-slate-600 text-slate-400"
                }`}
              >
                {isOnline ? "Online" : "Offline"}
              </button>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
                title="Minimize"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* INCOMING CALL BANNER (Ringing State) */}
          {status === "ringing" && incomingCall && (
            <div className="p-4 bg-gradient-to-b from-red-950/80 to-slate-900 border-b border-red-500/30 text-center animate-pulse">
              <div className="inline-flex p-3 bg-red-500/20 rounded-full text-red-400 mb-2">
                <PhoneIncoming className="w-6 h-6 animate-bounce" />
              </div>
              <h4 className="font-semibold text-sm text-red-200">
                Incoming Call Ringing...
              </h4>
              <p className="text-xs text-slate-300 mt-0.5 font-mono">
                {incomingCall.customerName || incomingCall.customerPhone}
              </p>
              {incomingCall.reason && (
                <p className="text-[11px] text-amber-300/90 mt-1 line-clamp-1 italic">
                  "{incomingCall.reason}"
                </p>
              )}

              <div className="flex gap-2 mt-3.5">
                <button
                  onClick={() => answerCall()}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-900/40"
                >
                  <PhoneCall className="w-3.5 h-3.5" /> Accept Call
                </button>
                <button
                  onClick={() => rejectCall()}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1"
                >
                  <PhoneOff className="w-3.5 h-3.5" /> Decline
                </button>
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="flex border-b border-slate-800 bg-slate-900/50 text-xs">
            <button
              onClick={() => setActiveTab("dialer")}
              className={`flex-1 py-2 font-medium text-center transition-colors ${
                activeTab === "dialer"
                  ? "text-indigo-400 border-b-2 border-indigo-500"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Keypad
            </button>
            <button
              onClick={() => setActiveTab("call")}
              className={`flex-1 py-2 font-medium text-center relative transition-colors ${
                activeTab === "call"
                  ? "text-indigo-400 border-b-2 border-indigo-500"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Active Call
              {status === "connected" && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block ml-1" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex-1 py-2 font-medium text-center transition-colors ${
                activeTab === "settings"
                  ? "text-indigo-400 border-b-2 border-indigo-500"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Audio
            </button>
          </div>

          {/* TAB 1: KEYPAD / DIALER */}
          {activeTab === "dialer" && (
            <div className="p-4 flex flex-col gap-3">
              {/* Dial Display */}
              <div className="flex items-center justify-between bg-slate-950/80 px-3 py-2 rounded-xl border border-slate-800">
                <input
                  type="text"
                  placeholder="Enter phone number..."
                  value={dialInput}
                  onChange={(e) => setDialInput(e.target.value)}
                  className="bg-transparent text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none w-full"
                />
                {dialInput && (
                  <button
                    onClick={handleBackspace}
                    className="text-slate-500 hover:text-slate-300 ml-1"
                  >
                    <Delete className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* 12 Key Grid */}
              <div className="grid grid-cols-3 gap-2">
                {keys.map((k) => (
                  <button
                    key={k.num}
                    onClick={() => handleKeyPress(k.num)}
                    className="flex flex-col items-center justify-center h-12 bg-slate-800/60 hover:bg-slate-700/70 active:bg-indigo-600/40 rounded-xl transition-all border border-slate-700/40 select-none"
                  >
                    <span className="text-sm font-bold text-slate-200">
                      {k.num}
                    </span>
                    {k.sub ? (
                      <span className="text-[9px] text-slate-400 tracking-wider">
                        {k.sub}
                      </span>
                    ) : (
                      <span className="text-[9px] text-transparent">.</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Call Outbound Button */}
              {status === "idle" && (
                <button
                  onClick={handleCallNumber}
                  disabled={!dialInput.trim()}
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition-all mt-1"
                >
                  <Phone className="w-4 h-4" /> Dial Call
                </button>
              )}
            </div>
          )}

          {/* TAB 2: ACTIVE CALL CONSOLE */}
          {activeTab === "call" && (
            <div className="p-4 flex flex-col gap-3">
              {status === "connected" || status === "on_hold" ? (
                <>
                  {/* Call Header Info */}
                  <div className="text-center py-2 bg-slate-950/60 rounded-xl border border-slate-800/80">
                    <div className="text-xs text-slate-400">Connected With</div>
                    <div className="text-sm font-semibold text-slate-100 font-mono">
                      {activeCall?.customerPhone || "+92 300 0000000"}
                    </div>
                    {activeCall?.customerName && (
                      <div className="text-xs text-indigo-400 font-medium">
                        {activeCall.customerName}
                      </div>
                    )}
                    <div className="text-lg font-bold font-mono text-emerald-400 mt-1">
                      {formatSeconds(callDuration)}
                    </div>
                    {isOnHold && (
                      <span className="inline-block text-[10px] font-semibold text-amber-400 bg-amber-950/50 border border-amber-600/50 px-2 py-0.5 rounded-full mt-1">
                        ⏸️ CALL ON HOLD
                      </span>
                    )}
                  </div>

                  {/* SUPERVISOR LIVE COACHING STATUS BANNER */}
                  {supervisorCoaching && (
                    <div className="bg-purple-950/70 border border-purple-500/60 rounded-xl p-2.5 text-xs text-purple-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-400 animate-ping inline-block" />
                        <div>
                          <strong className="text-purple-300">{supervisorCoaching.supervisorName}</strong> is coaching you
                          <div className="text-[10px] text-purple-400">
                            {supervisorCoaching.mode === "whisper"
                              ? "🎧 Whisper Mode: Only you hear their voice"
                              : "👥 Barge-in Mode: 3-way conference"}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* SUPERVISOR INSTANT HINT / TELEPROMPTER POPUP */}
                  {supervisorHint && (
                    <div className="bg-indigo-950/80 border border-indigo-400/60 rounded-xl p-3 text-xs text-indigo-100 flex flex-col gap-1 shadow-lg shadow-indigo-950/50">
                      <div className="flex items-center justify-between">
                        <span className="font-bold flex items-center gap-1.5 text-indigo-300 text-[11px]">
                          <Zap className="w-3.5 h-3.5 text-amber-400" /> Coaching Tip from {supervisorHint.supervisorName}:
                        </span>
                        <button
                          onClick={clearSupervisorHint}
                          className="text-slate-400 hover:text-white"
                          title="Dismiss"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="italic text-slate-200 mt-0.5 text-xs bg-slate-900/60 p-1.5 rounded-lg border border-indigo-800/40">
                        "{supervisorHint.text}"
                      </p>
                    </div>
                  )}

                  {/* Dual Real-Time Audio Level Meters (VU Meters) */}
                  <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800 flex flex-col gap-2">
                    {/* Agent Mic Meter */}
                    <div className="flex items-center gap-2 text-xs">
                      <Mic
                        className={`w-3.5 h-3.5 ${
                          isMuted ? "text-rose-400" : "text-emerald-400"
                        }`}
                      />
                      <span className="text-[11px] text-slate-400 w-16">
                        {isMuted ? "Muted" : "Your Mic"}:
                      </span>
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all duration-75"
                          style={{ width: `${isMuted ? 0 : micLevel}%` }}
                        />
                      </div>
                    </div>

                    {/* Caller Audio Meter */}
                    <div className="flex items-center gap-2 text-xs">
                      <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-[11px] text-slate-400 w-16">
                        Customer:
                      </span>
                      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-400 transition-all duration-75"
                          style={{ width: `${isOnHold ? 0 : callerLevel}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* In-Call Action Toolbar */}
                  <div className="grid grid-cols-3 gap-2">
                    {/* Mute Button */}
                    <button
                      onClick={toggleMute}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl text-xs font-medium border transition-colors ${
                        isMuted
                          ? "bg-rose-950/80 border-rose-500 text-rose-300"
                          : "bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-700/60"
                      }`}
                    >
                      {isMuted ? (
                        <MicOff className="w-4 h-4 mb-1 text-rose-400" />
                      ) : (
                        <Mic className="w-4 h-4 mb-1 text-slate-300" />
                      )}
                      <span>{isMuted ? "Unmute" : "Mute"}</span>
                    </button>

                    {/* Hold Button */}
                    <button
                      onClick={toggleHold}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl text-xs font-medium border transition-colors ${
                        isOnHold
                          ? "bg-amber-950/80 border-amber-500 text-amber-300"
                          : "bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-700/60"
                      }`}
                    >
                      {isOnHold ? (
                        <Play className="w-4 h-4 mb-1 text-amber-400" />
                      ) : (
                        <Pause className="w-4 h-4 mb-1 text-slate-300" />
                      )}
                      <span>{isOnHold ? "Resume" : "Hold"}</span>
                    </button>

                    {/* End Call Button */}
                    <button
                      onClick={endCall}
                      className="flex flex-col items-center justify-center p-2.5 rounded-xl text-xs font-medium bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40"
                    >
                      <PhoneOff className="w-4 h-4 mb-1" />
                      <span>Hangup</span>
                    </button>
                  </div>

                  {/* Live Transcript Snippet */}
                  <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 max-h-28 overflow-y-auto text-[11px] flex flex-col gap-1">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                      Live Call Transcript
                    </span>
                    {recentTranscriptLines.length === 0 ? (
                      <p className="text-slate-600 italic">Listening...</p>
                    ) : (
                      recentTranscriptLines.map((line, idx) => (
                        <div key={idx} className="leading-relaxed">
                          <span
                            className={
                              line.speaker === "customer"
                                ? "text-cyan-400 font-medium"
                                : line.speaker === "agent"
                                ? "text-emerald-400 font-medium"
                                : "text-indigo-400 font-medium"
                            }
                          >
                            {line.speaker === "customer"
                              ? "Caller: "
                              : line.speaker === "agent"
                              ? "You: "
                              : "AI: "}
                          </span>
                          <span className="text-slate-300">{line.text}</span>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
                  <Headphones className="w-8 h-8 text-slate-600" />
                  <p className="text-xs">No active call connected.</p>
                  <p className="text-[11px] text-slate-600">
                    Use the Keypad tab to place a call or accept incoming handoffs.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: AUDIO SETTINGS */}
          {activeTab === "settings" && (
            <div className="p-4 flex flex-col gap-3 text-xs">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Microphone Device
                </label>
                <select
                  value={selectedMicId}
                  onChange={(e) => setSelectedMicId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:border-indigo-500"
                >
                  {audioDevices.length === 0 ? (
                    <option value="">Default System Microphone</option>
                  ) : (
                    audioDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Microphone ${d.deviceId.slice(0, 5)}`}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Mic Test VU */}
              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-1.5">
                <span className="text-[11px] text-slate-400">
                  Microphone Volume Test:
                </span>
                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-75"
                    style={{ width: `${micLevel}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500">
                  Speak into your headset to see the volume bar react.
                </span>
              </div>

              {/* Protocol info */}
              <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="flex justify-between">
                  <span>Codec:</span>
                  <span className="font-mono text-slate-300">G.711 PCMU 8kHz</span>
                </div>
                <div className="flex justify-between">
                  <span>Transport:</span>
                  <span className="font-mono text-slate-300">WebRTC / WebSocket</span>
                </div>
                <div className="flex justify-between">
                  <span>Echo Cancellation:</span>
                  <span className="font-mono text-emerald-400">Enabled</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
