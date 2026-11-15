/**
 * Browser WebRTC Softphone Audio Engine
 * Handles microphone capture, G.711 mu-law streaming, caller audio playback,
 * DTMF generation, ringtone synthesis, and real-time audio VU meters.
 */

// Mu-law decompression lookup table (8-bit mu-law to 16-bit linear PCM)
const MULAW_DECODE_TABLE = new Int16Array(256);
for (let i = 0; i < 256; i++) {
  const mu = ~i & 0xff;
  const sign = mu & 0x80 ? -1 : 1;
  const exponent = (mu >> 4) & 0x07;
  const mantissa = mu & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  MULAW_DECODE_TABLE[i] = sign * sample;
}

// Linear 16-bit PCM sample to 8-bit mu-law
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

// DTMF Frequency Pairs (Standard ITU-T)
const DTMF_FREQS: Record<string, [number, number]> = {
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
  "*": [941, 1209],
  "0": [941, 1336],
  "#": [941, 1477],
};

class SoftphoneAudioEngine {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private micProcessorNode: ScriptProcessorNode | null = null;
  private micWorkletNode: AudioWorkletNode | null = null;
  private ringOscillator1: OscillatorNode | null = null;
  private ringOscillator2: OscillatorNode | null = null;
  private ringGain: GainNode | null = null;
  private ringInterval: any = null;

  // Caller playback queue
  private nextPlayTime = 0;
  private isMuted = false;
  private isOnHold = false;

  // Callbacks
  public onMicLevel?: (level: number) => void;
  public onCallerLevel?: (level: number) => void;
  public onAudioChunk?: (base64Mulaw: string) => void;

  /**
   * Initializes or resumes the AudioContext
   */
  public async getAudioContext(): Promise<AudioContext> {
    if (!this.audioCtx) {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass();
    }
    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Plays realistic telephone DTMF touch tone for a given digit
   */
  public async playDtmfTone(digit: string, durationMs = 160): Promise<void> {
    const freqs = DTMF_FREQS[digit];
    if (!freqs) return;

    const ctx = await this.getAudioContext();
    const [f1, f2] = freqs;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(f1, ctx.currentTime);
    osc2.frequency.setValueAtTime(f2, ctx.currentTime);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + durationMs / 1000);
    osc2.stop(ctx.currentTime + durationMs / 1000);
  }

  /**
   * Plays realistic PBX telephone ring tone (440Hz + 480Hz cadence)
   */
  public async startRinging(): Promise<void> {
    if (this.ringInterval) return; // already ringing
    const ctx = await this.getAudioContext();

    const ringCycle = () => {
      try {
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = "sine";
        osc2.type = "sine";
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        // Standard ring cadence: 2 seconds ring, then fade
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.exponentialRampToValueAtTime(0.2, now + 0.1);
        gain.gain.setValueAtTime(0.2, now + 1.8);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);
      } catch (err) {
        console.warn("[Ring Tone Error]:", err);
      }
    };

    ringCycle();
    this.ringInterval = setInterval(ringCycle, 4000); // 2s ring, 2s silence
  }

  /**
   * Stops the ring tone
   */
  public stopRinging(): void {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
  }

  /**
   * Plays a pleasant telephone call connect chime
   */
  public async playConnectChime(): Promise<void> {
    const ctx = await this.getAudioContext();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 major triad

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + idx * 0.1;

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);
      gain.gain.setValueAtTime(0.12, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.25);
    });
  }

  /**
   * Plays a call disconnect descending tone
   */
  public async playDisconnectTone(): Promise<void> {
    const ctx = await this.getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.4);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * Internal helper to process a PCM Float32Array channel buffer,
   * update the VU meter, downsample to 8000Hz G.711 mu-law, and emit base64 audio.
   */
  private processPcmChannel(inputData: Float32Array, sampleRate: number): void {
    if (this.isMuted || this.isOnHold) {
      if (this.onMicLevel) this.onMicLevel(0);
      return;
    }

    // 1. Calculate RMS Level for VU meter
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);
    const levelPct = Math.min(100, Math.round(rms * 400));
    if (this.onMicLevel) this.onMicLevel(levelPct);

    // 2. Downsample from AudioContext sampleRate to 8000Hz telephony
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

    // 3. Base64 encode and emit chunk to WebSocket
    if (this.onAudioChunk) {
      let binary = "";
      for (let i = 0; i < mulawBytes.length; i++) {
        binary += String.fromCharCode(mulawBytes[i]);
      }
      const base64Chunk = btoa(binary);
      this.onAudioChunk(base64Chunk);
    }
  }

  /**
   * Starts capturing agent microphone using modern AudioWorkletNode
   * (runs on a dedicated real-time audio thread for zero UI glitching)
   * with automatic fallback to ScriptProcessorNode.
   */
  public async startMicrophone(deviceId?: string): Promise<boolean> {
    try {
      const ctx = await this.getAudioContext();
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };

      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.micSourceNode = ctx.createMediaStreamSource(this.micStream);

      // 1. Try modern AudioWorklet (runs off-main-thread)
      if (ctx.audioWorklet && typeof ctx.audioWorklet.addModule === "function") {
        try {
          const workletCode = `
            class SoftphoneMicProcessor extends AudioWorkletProcessor {
              process(inputs) {
                const input = inputs[0];
                if (input && input[0] && input[0].length > 0) {
                  this.port.postMessage(input[0]);
                }
                return true;
              }
            }
            registerProcessor('softphone-mic-processor', SoftphoneMicProcessor);
          `;
          const blob = new Blob([workletCode], { type: "application/javascript" });
          const workletUrl = URL.createObjectURL(blob);
          await ctx.audioWorklet.addModule(workletUrl);
          URL.revokeObjectURL(workletUrl);

          this.micWorkletNode = new AudioWorkletNode(ctx, "softphone-mic-processor");
          this.micWorkletNode.port.onmessage = (event) => {
            if (event.data) {
              this.processPcmChannel(event.data, ctx.sampleRate);
            }
          };

          this.micSourceNode.connect(this.micWorkletNode);

          // Zero-gain loop to keep Web Audio graph alive without feedback in headset
          const silentGain = ctx.createGain();
          silentGain.gain.setValueAtTime(0, ctx.currentTime);
          this.micWorkletNode.connect(silentGain);
          silentGain.connect(ctx.destination);

          return true;
        } catch (workletError) {
          console.warn("[AudioWorklet fallback to ScriptProcessor]:", workletError);
        }
      }

      // 2. Fallback to ScriptProcessorNode
      const bufferSize = 2048;
      this.micProcessorNode = ctx.createScriptProcessor(bufferSize, 1, 1);
      this.micProcessorNode.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        this.processPcmChannel(inputData, ctx.sampleRate);
      };

      this.micSourceNode.connect(this.micProcessorNode);
      const silentGain = ctx.createGain();
      silentGain.gain.setValueAtTime(0, ctx.currentTime);
      this.micProcessorNode.connect(silentGain);
      silentGain.connect(ctx.destination);

      return true;
    } catch (err) {
      console.error("[Softphone Mic Capture Error]:", err);
      return false;
    }
  }

  /**
   * Stops agent microphone capture and disconnects worklet/processor nodes.
   */
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
    if (this.onMicLevel) this.onMicLevel(0);
  }

  /**
   * Plays an inbound 8000Hz G.711 mu-law audio chunk from customer through headphones.
   */
  public async playCallerAudioChunk(base64Payload: string): Promise<void> {
    if (this.isOnHold) return;

    try {
      const ctx = await this.getAudioContext();
      const binary = atob(base64Payload);
      const len = binary.length;
      if (len === 0) return;

      const pcmFloat = new Float32Array(len);
      let sum = 0;

      for (let i = 0; i < len; i++) {
        const mulawByte = binary.charCodeAt(i);
        const pcm16 = MULAW_DECODE_TABLE[mulawByte];
        const floatVal = pcm16 / 32768.0;
        pcmFloat[i] = floatVal;
        sum += floatVal * floatVal;
      }

      // Compute caller VU level
      const rms = Math.sqrt(sum / len);
      const levelPct = Math.min(100, Math.round(rms * 400));
      if (this.onCallerLevel) this.onCallerLevel(levelPct);

      // Create audio buffer at 8000Hz
      const audioBuffer = ctx.createBuffer(1, len, 8000);
      audioBuffer.copyToChannel(pcmFloat, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      // Schedule smoothly without pops
      const now = ctx.currentTime;
      const startTime = Math.max(now, this.nextPlayTime);
      source.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;
    } catch (err) {
      console.warn("[Caller Audio Playback Error]:", err);
    }
  }

  /**
   * Plays incoming audio from the Supervisor (Whisper coaching or Barge-in) directly to agent headset.
   */
  public async playSupervisorAudioChunk(base64Payload: string, isWhisper = true): Promise<void> {
    try {
      const ctx = await this.getAudioContext();
      const binary = atob(base64Payload);
      const len = binary.length;
      if (len === 0) return;

      const pcmFloat = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        const mulawByte = binary.charCodeAt(i);
        const pcm16 = MULAW_DECODE_TABLE[mulawByte];
        pcmFloat[i] = pcm16 / 32768.0;
      }

      const audioBuffer = ctx.createBuffer(1, len, 8000);
      audioBuffer.copyToChannel(pcmFloat, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // In whisper mode, add a subtle gain boost so agent hears coaching clearly over caller
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(isWhisper ? 1.25 : 1.0, ctx.currentTime);

      source.connect(gainNode);
      gainNode.connect(ctx.destination);

      const now = ctx.currentTime;
      const startTime = Math.max(now, this.nextPlayTime);
      source.start(startTime);
      this.nextPlayTime = startTime + audioBuffer.duration;
    } catch (err) {
      console.warn("[Supervisor Audio Playback Error]:", err);
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted && this.onMicLevel) this.onMicLevel(0);
  }

  public setHold(onHold: boolean): void {
    this.isOnHold = onHold;
    this.nextPlayTime = 0;
    if (onHold) {
      if (this.onMicLevel) this.onMicLevel(0);
      if (this.onCallerLevel) this.onCallerLevel(0);
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsOnHold(): boolean {
    return this.isOnHold;
  }
}

export const softphoneAudio = new SoftphoneAudioEngine();
