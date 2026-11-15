/**
 * Browser WebRTC Supervisor Audio Engine
 * Handles silent call monitoring (Listen), private agent coaching (Whisper),
 * and 3-way conference audio injection (Barge-in).
 * Features off-thread AudioWorklet microphone capture, real-time VU meters for
 * Customer, Agent, and Supervisor, and jitter-free mu-law audio playback.
 */

// G.711 Mu-law decompression table (8-bit mu-law to 16-bit linear PCM)
const MULAW_DECODE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const mu = ~i & 0xff;
  const sign = mu & 0x80 ? -1 : 1;
  const exponent = (mu >> 4) & 0x07;
  const mantissa = mu & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  MULAW_DECODE[i] = sign * sample;
}

// Linear 16-bit PCM to 8-bit mu-law
function linearToMuLaw(pcm: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  let sign = 0;
  if (pcm < 0) {
    pcm = -pcm;
    sign = 0x80;
  }
  if (pcm > CLIP) pcm = CLIP;
  pcm += BIAS;

  let exponent = 7;
  for (let expMask = 0x4000; (pcm & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent--;
  }

  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export type SupervisorCoachingMode = "listen" | "whisper" | "barge";

class SupervisorAudioEngine {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micProcessorNode: ScriptProcessorNode | null = null;
  private micWorkletNode: AudioWorkletNode | null = null;

  private currentMode: SupervisorCoachingMode = "listen";
  private isMicMuted = false;

  // Next scheduled playback times for jitter-free audio
  private nextCallerPlayTime = 0;
  private nextAgentPlayTime = 0;

  // Real-time Audio VU Callbacks
  public onCallerLevel?: (level: number) => void;
  public onAgentLevel?: (level: number) => void;
  public onSupervisorMicLevel?: (level: number) => void;
  public onAudioChunk?: (base64Mulaw: string) => void;

  public async getAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  public setMode(mode: SupervisorCoachingMode): void {
    this.currentMode = mode;
    // In listen mode, supervisor mic is muted automatically
    if (mode === "listen") {
      if (this.onSupervisorMicLevel) this.onSupervisorMicLevel(0);
    }
  }

  public getMode(): SupervisorCoachingMode {
    return this.currentMode;
  }

  public setMicMuted(muted: boolean): void {
    this.isMicMuted = muted;
    if (muted && this.onSupervisorMicLevel) {
      this.onSupervisorMicLevel(0);
    }
  }

  public isMuted(): boolean {
    return this.isMicMuted;
  }

  /**
   * Internal helper to process PCM audio from mic on supervisor's device.
   */
  private processMicBuffer(inputData: Float32Array, sampleRate: number): void {
    if (this.currentMode === "listen" || this.isMicMuted) {
      if (this.onSupervisorMicLevel) this.onSupervisorMicLevel(0);
      return;
    }

    // 1. Calculate RMS Level for Supervisor VU Meter
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);
    const levelPct = Math.min(100, Math.round(rms * 400));
    if (this.onSupervisorMicLevel) this.onSupervisorMicLevel(levelPct);

    // 2. Downsample from AudioContext rate to 8000Hz G.711 mu-law
    const targetRate = 8000;
    const ratio = sampleRate / targetRate;
    const targetLen = Math.floor(inputData.length / ratio);
    if (targetLen <= 0) return;

    const mulawBytes = new Uint8Array(targetLen);
    for (let i = 0; i < targetLen; i++) {
      const origIdx = Math.floor(i * ratio);
      const sampleFloat = inputData[origIdx];
      const samplePcm = Math.max(-32768, Math.min(32767, Math.round(sampleFloat * 32767)));
      mulawBytes[i] = linearToMuLaw(samplePcm);
    }

    // 3. Emit base64 encoded audio frame
    if (this.onAudioChunk) {
      let binary = "";
      for (let i = 0; i < mulawBytes.length; i++) {
        binary += String.fromCharCode(mulawBytes[i]);
      }
      this.onAudioChunk(btoa(binary));
    }
  }

  /**
   * Starts supervisor microphone capture for Whisper and Barge-in modes.
   */
  public async startMicrophone(): Promise<boolean> {
    try {
      const ctx = await this.getAudioContext();
      const constraints: MediaStreamConstraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.micSourceNode = ctx.createMediaStreamSource(this.micStream);

      // Try AudioWorklet
      if (ctx.audioWorklet && typeof ctx.audioWorklet.addModule === "function") {
        try {
          const workletCode = `
            class SupervisorMicProcessor extends AudioWorkletProcessor {
              process(inputs) {
                const input = inputs[0];
                if (input && input[0] && input[0].length > 0) {
                  this.port.postMessage(input[0]);
                }
                return true;
              }
            }
            registerProcessor('supervisor-mic-processor', SupervisorMicProcessor);
          `;
          const blob = new Blob([workletCode], { type: "application/javascript" });
          const url = URL.createObjectURL(blob);
          await ctx.audioWorklet.addModule(url);
          URL.revokeObjectURL(url);

          this.micWorkletNode = new AudioWorkletNode(ctx, "supervisor-mic-processor");
          this.micWorkletNode.port.onmessage = (event) => {
            if (event.data) {
              this.processMicBuffer(event.data, ctx.sampleRate);
            }
          };

          this.micSourceNode.connect(this.micWorkletNode);
          const silentGain = ctx.createGain();
          silentGain.gain.setValueAtTime(0, ctx.currentTime);
          this.micWorkletNode.connect(silentGain);
          silentGain.connect(ctx.destination);
          return true;
        } catch (workletError) {
          console.warn("[Supervisor AudioWorklet fallback]:", workletError);
        }
      }

      // ScriptProcessor fallback
      this.micProcessorNode = ctx.createScriptProcessor(2048, 1, 1);
      this.micProcessorNode.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        this.processMicBuffer(inputData, ctx.sampleRate);
      };
      this.micSourceNode.connect(this.micProcessorNode);
      const silentGain = ctx.createGain();
      silentGain.gain.setValueAtTime(0, ctx.currentTime);
      this.micProcessorNode.connect(silentGain);
      silentGain.connect(ctx.destination);
      return true;
    } catch (err) {
      console.error("[Supervisor Mic Error]:", err);
      return false;
    }
  }

  public stopMicrophone(): void {
    if (this.micWorkletNode) {
      try {
        this.micWorkletNode.port.onmessage = null;
        this.micWorkletNode.disconnect();
      } catch (e) {}
      this.micWorkletNode = null;
    }
    if (this.micProcessorNode) {
      try {
        this.micProcessorNode.disconnect();
      } catch (e) {}
      this.micProcessorNode = null;
    }
    if (this.micSourceNode) {
      try {
        this.micSourceNode.disconnect();
      } catch (e) {}
      this.micSourceNode = null;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.onSupervisorMicLevel) this.onSupervisorMicLevel(0);
  }

  /**
   * Plays an inbound G.711 mu-law chunk from the Customer into supervisor's headphones.
   */
  public async playCallerChunk(base64Payload: string): Promise<void> {
    try {
      const ctx = await this.getAudioContext();
      const binary = atob(base64Payload);
      const len = binary.length;
      if (len === 0) return;

      const pcmFloat = new Float32Array(len);
      let sum = 0;
      for (let i = 0; i < len; i++) {
        const byte = binary.charCodeAt(i);
        const pcm16 = MULAW_DECODE[byte];
        const floatVal = pcm16 / 32768.0;
        pcmFloat[i] = floatVal;
        sum += floatVal * floatVal;
      }

      // Update Caller VU meter
      const rms = Math.sqrt(sum / len);
      const levelPct = Math.min(100, Math.round(rms * 400));
      if (this.onCallerLevel) this.onCallerLevel(levelPct);

      const audioBuffer = ctx.createBuffer(1, len, 8000);
      audioBuffer.copyToChannel(pcmFloat, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, this.nextCallerPlayTime);
      source.start(startTime);
      this.nextCallerPlayTime = startTime + audioBuffer.duration;
    } catch (e) {
      // ignore
    }
  }

  /**
   * Plays an inbound G.711 mu-law chunk from the Agent into supervisor's headphones.
   */
  public async playAgentChunk(base64Payload: string): Promise<void> {
    try {
      const ctx = await this.getAudioContext();
      const binary = atob(base64Payload);
      const len = binary.length;
      if (len === 0) return;

      const pcmFloat = new Float32Array(len);
      let sum = 0;
      for (let i = 0; i < len; i++) {
        const byte = binary.charCodeAt(i);
        const pcm16 = MULAW_DECODE[byte];
        const floatVal = pcm16 / 32768.0;
        pcmFloat[i] = floatVal;
        sum += floatVal * floatVal;
      }

      // Update Agent VU meter
      const rms = Math.sqrt(sum / len);
      const levelPct = Math.min(100, Math.round(rms * 400));
      if (this.onAgentLevel) this.onAgentLevel(levelPct);

      const audioBuffer = ctx.createBuffer(1, len, 8000);
      audioBuffer.copyToChannel(pcmFloat, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, this.nextAgentPlayTime);
      source.start(startTime);
      this.nextAgentPlayTime = startTime + audioBuffer.duration;
    } catch (e) {
      // ignore
    }
  }

  /**
   * Cleanup everything on leave.
   */
  public reset(): void {
    this.stopMicrophone();
    this.nextCallerPlayTime = 0;
    this.nextAgentPlayTime = 0;
    this.currentMode = "listen";
    this.isMicMuted = false;
    if (this.onCallerLevel) this.onCallerLevel(0);
    if (this.onAgentLevel) this.onAgentLevel(0);
    if (this.onSupervisorMicLevel) this.onSupervisorMicLevel(0);
  }
}

export const supervisorAudio = new SupervisorAudioEngine();
