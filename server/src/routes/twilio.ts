import { Router } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { generateAiReply, generateCallSummary } from "../services/aiService.js";

export const twilioRouter = Router();

// Helper to escape XML special characters
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

// Helper to map language to Twilio Polly Voice & language tags
export function getPollyVoice(lang?: string | null): { voice: string; language: string } {
  const normalized = (lang || "").toLowerCase();
  if (normalized.startsWith("ur") || normalized.startsWith("hi")) {
    return { voice: "Polly.Aditi", language: "hi-IN" };
  }
  if (normalized.startsWith("ar")) {
    return { voice: "Polly.Zeina", language: "ar-XA" };
  }
  if (normalized.startsWith("es")) {
    return { voice: "Polly.Lucia", language: "es-ES" };
  }
  if (normalized.startsWith("fr")) {
    return { voice: "Polly.Celine", language: "fr-FR" };
  }
  if (normalized.startsWith("de")) {
    return { voice: "Polly.Vicki", language: "de-DE" };
  }
  if (normalized.startsWith("zh")) {
    return { voice: "Polly.Zhiyu", language: "zh-CN" };
  }
  return { voice: "Polly.Joanna", language: "en-US" };
}

// ---------------------------------------------------------
// GET /api/twilio/config-status
// Checks if Twilio and AI keys (Gemini, Groq, OpenAI) are set
// ---------------------------------------------------------
twilioRouter.get("/config-status", (_req, res) => {
  const twilioConfigured = !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_PHONE_NUMBER
  );

  const geminiConfigured = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const groqConfigured = !!process.env.GROQ_API_KEY;
  const openaiConfigured = !!(
    process.env.OPENAI_API_KEY &&
    process.env.OPENAI_API_KEY.startsWith("sk-")
  );

  const activeAiProvider = geminiConfigured
    ? "Google Gemini 2.0 (High Intelligence, Multilingual)"
    : groqConfigured
    ? "Groq Llama 3.3 70B (Ultra-fast, Multilingual)"
    : openaiConfigured
    ? "OpenAI GPT-4o-mini (Multilingual Cloud)"
    : "Built-in Universal Intelligence Engine (Zero Latency, Multilingual Local)";

  const publicUrl =
    process.env.PUBLIC_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    "http://your-server-domain.com";

  res.json({
    success: true,
    twilioConfigured,
    openaiConfigured,
    geminiConfigured,
    groqConfigured,
    activeAiProvider,
    twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || null,
    webhooks: {
      voiceIncomingUrl: `${publicUrl}/api/twilio/voice/incoming`,
      voiceStatusUrl: `${publicUrl}/api/twilio/voice/status`,
    },
  });
});

// ---------------------------------------------------------
// POST /api/twilio/voice/incoming
// Called by Twilio when a customer dials your Twilio phone number
// ---------------------------------------------------------
twilioRouter.post("/voice/incoming", async (req, res) => {
  try {
    const callSid = String(req.body.CallSid || `tw-${Date.now()}`);
    const fromPhone = String(req.body.From || "Unknown Caller");
    const publicUrl =
      process.env.PUBLIC_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      "";

    console.log(`[Twilio Incoming Call] From: ${fromPhone}, CallSid: ${callSid}`);

    // 1. Find or create customer
    const custResult = await pool.query(
      `INSERT INTO customers (name, phone)
       VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE
          SET phone = EXCLUDED.phone
       RETURNING id, name`,
      [`Caller ${fromPhone.slice(-4)}`, fromPhone]
    );

    const customer = custResult.rows[0];

    // 2. Create active call record in PostgreSQL
    const callResult = await pool.query(
      `INSERT INTO calls
          (customer_id, direction, handled_by, status, telephony_call_sid)
       VALUES ($1, 'inbound', 'ai', 'in_progress', $2)
       RETURNING id`,
      [customer.id, callSid]
    );

    const callId = callResult.rows[0].id;

    // Determine WebSocket stream URL (e.g. wss://domain.com/media-stream)
    const host = req.get("host") || "localhost:4000";
    let wsStreamUrl: string;
    if (publicUrl && publicUrl.startsWith("http")) {
      wsStreamUrl = publicUrl.replace(/^https:\/\//i, "wss://").replace(/^http:\/\//i, "ws://") + "/media-stream";
    } else {
      const proto = req.secure || req.get("x-forwarded-proto") === "https" ? "wss" : "ws";
      wsStreamUrl = `${proto}://${host}/media-stream`;
    }

    console.log(`[Twilio Media Stream URL]: ${wsStreamUrl}`);

    // Return Twilio Media Streams TwiML connecting directly to our real-time WebSocket server
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(wsStreamUrl)}">
      <Parameter name="callId" value="${callId}" />
      <Parameter name="customerPhone" value="${escapeXml(fromPhone)}" />
    </Stream>
  </Connect>
</Response>`;

    res.type("text/xml").send(twiml);
  } catch (error) {
    console.error("[Twilio Incoming Call Error]:", error);
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling. Our lines are currently busy. Please try again later.</Say>
  <Hangup/>
</Response>`;
    res.type("text/xml").send(fallbackTwiml);
  }
});

// ---------------------------------------------------------
// GET /api/twilio/voice/token
// Generates Twilio Voice Access Token (JWT) for Browser WebRTC Softphone
// ---------------------------------------------------------
twilioRouter.get("/voice/token", async (req, res) => {
  try {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY || process.env.TWILIO_ACCOUNT_SID;
    const apiSecret = process.env.TWILIO_API_SECRET || process.env.TWILIO_AUTH_TOKEN;
    const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
    const agentId = req.query.agentId ? String(req.query.agentId) : "1";
    const identity = `agent_${agentId}`;

    if (!accountSid || !apiKey || !apiSecret) {
      res.json({
        success: true,
        token: null,
        identity,
        isLiveTwilio: false,
        mode: "webrtc_websocket",
        message: "Twilio API Key not set. Using Native WebRTC/WebSocket audio bridge for in-browser softphone.",
      });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const payload = {
      jti: `${apiKey}-${now}`,
      iss: apiKey,
      sub: accountSid,
      exp: now + 3600 * 4,
      grants: {
        identity,
        voice: {
          incoming: { allow: true },
          outgoing: twimlAppSid ? { application_sid: twimlAppSid } : undefined,
        },
      },
    };

    const token = jwt.sign(payload, apiSecret, {
      algorithm: "HS256",
      header: {
        typ: "JWT",
        alg: "HS256",
        cty: "twilio-fpa;v=1",
      } as any,
    });

    res.json({
      success: true,
      token,
      identity,
      isLiveTwilio: true,
      mode: "twilio_client",
    });
  } catch (err: any) {
    console.error("[Twilio Voice Token Error]:", err);
    res.status(500).json({ success: false, message: err?.message || "Failed to generate voice token." });
  }
});

// ---------------------------------------------------------
// POST /api/twilio/voice/agent-connect
// Called when an agent accepts a handoff call to bridge caller to human
// ---------------------------------------------------------
twilioRouter.post("/voice/agent-connect", async (req, res) => {
  try {
    const handoffId = Number(req.query.handoffId);
    const agentId = Number(req.query.agentId);

    console.log(`[Twilio Agent Connect Webhook]: Handoff #${handoffId}, Agent #${agentId}`);

    // Retrieve agent phone or fallback
    let agentPhone = process.env.AGENT_FORWARD_PHONE_NUMBER || "";

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Transferring you to our human specialist. Please stay on the line.</Say>
  <Dial timeout="30">
    <Client>agent_${agentId}</Client>
    ${agentPhone ? `<Number>${escapeXml(agentPhone)}</Number>` : ""}
  </Dial>
</Response>`;

    res.type("text/xml").send(twiml);
  } catch (err) {
    console.error("[Twilio Agent Connect Error]:", err);
    res.type("text/xml").send("<Response><Hangup/></Response>");
  }
});

// ---------------------------------------------------------
// POST /api/twilio/voice/respond
// Called by Twilio when caller speaks; contains speech recognition result
// ---------------------------------------------------------
twilioRouter.post("/voice/respond", async (req, res) => {
  try {
    const callId = Number(req.query.callId);
    const speechResult = String(req.body.SpeechResult || "").trim();
    const publicUrl =
      process.env.PUBLIC_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      "";

    console.log(`[Twilio Speech Result] Call #${callId}: "${speechResult}"`);

    if (!speechResult) {
      const actionUrl = `${publicUrl}/api/twilio/voice/respond?callId=${callId}`;
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${escapeXml(actionUrl)}" method="POST" timeout="4" speechTimeout="auto">
    <Say voice="Polly.Joanna">I'm sorry, I couldn't hear that. Could you please repeat your question?</Say>
  </Gather>
  <Say voice="Polly.Joanna">Thank you for calling. Goodbye!</Say>
  <Hangup/>
</Response>`;
      res.type("text/xml").send(twiml);
      return;
    }

    // 1. Load knowledge base and current call language
    const [kbResult, callResult] = await Promise.all([
      pool.query("SELECT title, content, category FROM knowledge_base ORDER BY id ASC"),
      pool.query("SELECT language FROM calls WHERE id = $1", [callId])
    ]);

    const callLang = callResult.rows[0]?.language || "auto";

    // 2. Generate AI reply using real LLM or local engine with language adaptability
    const aiResult = await generateAiReply(speechResult, kbResult.rows, callLang);
    const polly = getPollyVoice(aiResult.detectedLanguage);

    // Update call language if detected
    await pool.query("UPDATE calls SET language = $1 WHERE id = $2", [
      aiResult.detectedLanguage,
      callId,
    ]);

    // 3. Save customer transcript
    await pool.query(
      `INSERT INTO call_transcripts (call_id, speaker, original_text, original_language, sentiment)
       VALUES ($1, 'customer', $2, $3, $4)`,
      [callId, speechResult, aiResult.detectedLanguage, aiResult.sentiment]
    );

    // 4. Save AI transcript
    await pool.query(
      `INSERT INTO call_transcripts (call_id, speaker, original_text, original_language, sentiment)
       VALUES ($1, 'ai', $2, $3, 'neutral')`,
      [callId, aiResult.replyText, aiResult.detectedLanguage]
    );

    const lowerSpeech = speechResult.toLowerCase();
    const isEnding =
      lowerSpeech.includes("bye") ||
      lowerSpeech.includes("goodbye") ||
      lowerSpeech.includes("that's all") ||
      lowerSpeech.includes("that is all") ||
      lowerSpeech.includes("shukriya") ||
      lowerSpeech.includes("allah hafiz");

    if (isEnding) {
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${polly.voice}" language="${polly.language}">${escapeXml(aiResult.replyText)}</Say>
  <Hangup/>
</Response>`;
      res.type("text/xml").send(twiml);
      return;
    }

    const nextActionUrl = `${publicUrl}/api/twilio/voice/respond?callId=${callId}`;

    const promptMore =
      aiResult.detectedLanguage === "ur" || aiResult.detectedLanguage === "ur-Latn"
        ? "Kya main aapki mazeed koi madad kar sakta hoon?"
        : aiResult.detectedLanguage === "ar"
        ? "هل هناك أي شيء آخر يمكنني مساعدتك به؟"
        : aiResult.detectedLanguage === "hi"
        ? "क्या मैं आपकी किसी और चीज़ में सहायता कर सकता हूँ?"
        : "Is there anything else I can help you with?";

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${escapeXml(nextActionUrl)}" language="${polly.language}" method="POST" timeout="5" speechTimeout="auto">
    <Say voice="${polly.voice}" language="${polly.language}">${escapeXml(aiResult.replyText)}</Say>
  </Gather>
  <Say voice="${polly.voice}" language="${polly.language}">${escapeXml(promptMore)}</Say>
  <Gather input="speech" action="${escapeXml(nextActionUrl)}" language="${polly.language}" method="POST" timeout="4" speechTimeout="auto" />
  <Say voice="${polly.voice}" language="${polly.language}">Thank you for reaching out to us. Goodbye!</Say>
  <Hangup/>
</Response>`;

    res.type("text/xml").send(twiml);
  } catch (error) {
    console.error("[Twilio Voice Respond Error]:", error);
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">I encountered a temporary problem processing that. Let me connect you with an agent.</Say>
  <Hangup/>
</Response>`;
    res.type("text/xml").send(fallbackTwiml);
  }
});

// ---------------------------------------------------------
// POST /api/twilio/voice/status
// Called by Twilio when call finishes or disconnects
// ---------------------------------------------------------
twilioRouter.post("/voice/status", async (req, res) => {
  try {
    const callSid = String(req.body.CallSid || "");
    const callDuration = Number(req.body.CallDuration || 0);
    const callStatus = String(req.body.CallStatus || "completed");

    console.log(
      `[Twilio Status Webhook] CallSid: ${callSid}, Status: ${callStatus}, Duration: ${callDuration}s`
    );

    if (callSid) {
      // 1. Update call record
      const updateResult = await pool.query(
        `UPDATE calls
         SET status = 'completed',
             ended_at = NOW(),
             duration_seconds = GREATEST($1, duration_seconds)
         WHERE telephony_call_sid = $2
         RETURNING id`,
        [callDuration, callSid]
      );

      if (updateResult.rowCount && updateResult.rowCount > 0) {
        const callId = updateResult.rows[0].id;

        // 2. Fetch transcripts and auto-generate summary
        const transcriptsResult = await pool.query(
          `SELECT speaker, original_text, sentiment
           FROM call_transcripts
           WHERE call_id = $1
           ORDER BY spoken_at ASC`,
          [callId]
        );

        const summary = await generateCallSummary(transcriptsResult.rows);

        await pool.query(
          `INSERT INTO call_summaries (call_id, summary_text, overall_sentiment, key_points)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (call_id) DO UPDATE
              SET summary_text = EXCLUDED.summary_text,
                  overall_sentiment = EXCLUDED.overall_sentiment,
                  key_points = EXCLUDED.key_points`,
          [callId, summary.summaryText, summary.overallSentiment, summary.keyPoints]
        );

        console.log(`[Twilio Call #${callId} finalized and summarized]`);
      }
    }

    res.type("text/xml").send("<Response/>");
  } catch (error) {
    console.error("[Twilio Status Error]:", error);
    res.type("text/xml").send("<Response/>");
  }
});

// ---------------------------------------------------------
// POST /api/twilio/outbound
// Make an outbound phone call to a real mobile number using Twilio REST API
// ---------------------------------------------------------
twilioRouter.post("/outbound", async (req, res) => {
  try {
    const { toPhone, customerName } = req.body || {};

    if (!toPhone) {
      res.status(400).json({ success: false, message: "toPhone is required." });
      return;
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromPhone = process.env.TWILIO_PHONE_NUMBER;
    const publicUrl =
      process.env.PUBLIC_URL ||
      process.env.RENDER_EXTERNAL_URL;

    if (!accountSid || !authToken || !fromPhone || !publicUrl) {
      res.status(400).json({
        success: false,
        message:
          "Twilio is not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER and PUBLIC_URL in server/.env.",
      });
      return;
    }

    // 1. Create or get customer
    const custResult = await pool.query(
      `INSERT INTO customers (name, phone)
       VALUES ($1, $2)
       ON CONFLICT (phone) DO UPDATE
          SET name = COALESCE(EXCLUDED.name, customers.name)
       RETURNING id, name`,
      [customerName || "Customer", toPhone]
    );

    const customer = custResult.rows[0];

    // 2. Call Twilio REST API
    const authHeader = `Basic ${Buffer.from(
      `${accountSid}:${authToken}`
    ).toString("base64")}`;

    const params = new URLSearchParams();
    params.append("To", toPhone);
    params.append("From", fromPhone);
    params.append("Url", `${publicUrl}/api/twilio/voice/incoming`);
    params.append("StatusCallback", `${publicUrl}/api/twilio/voice/status`);
    params.append("StatusCallbackEvent", "completed");

    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const twilioData: any = await twilioResponse.json();

    if (!twilioResponse.ok) {
      res.status(twilioResponse.status).json({
        success: false,
        message: twilioData.message || "Failed to initiate Twilio call.",
      });
      return;
    }

    // 3. Create call record
    const callResult = await pool.query(
      `INSERT INTO calls
          (customer_id, direction, handled_by, status, telephony_call_sid)
       VALUES ($1, 'outbound', 'ai', 'ringing', $2)
       RETURNING *`,
      [customer.id, twilioData.sid]
    );

    res.json({
      success: true,
      call: callResult.rows[0],
      twilioSid: twilioData.sid,
    });
  } catch (error: any) {
    console.error("[Twilio Outbound Call Error]:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Error initiating outbound call.",
    });
  }
});
