import { pool } from "../db/pool.js";
import { Sentiment } from "./aiService.js";

export type EscalationPriority = "low" | "medium" | "high" | "urgent";
export type HandoffStatus =
  | "pending"
  | "assigned"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "completed";

export type HandoffRequestRecord = {
  id: number;
  call_id: number;
  customer_id: number | null;
  reason: string;
  priority: EscalationPriority;
  status: HandoffStatus;
  assigned_agent_id: number | null;
  assigned_agent_name?: string | null;
  waiting_time_seconds: number;
  sentiment: string;
  language: string;
  customer_name: string | null;
  customer_phone: string | null;
  call_duration_seconds: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EscalationDetectionResult = {
  shouldEscalate: boolean;
  reason: string;
  priority: EscalationPriority;
  customerAnnouncement: string;
};

// =========================================================
// ESCALATION DETECTION ENGINE
// =========================================================

/**
 * Analyzes customer speech, conversation turn history, and sentiment
 * to determine if call requires immediate human agent escalation.
 */
export function checkEscalationConditions(
  customerMessage: string,
  history: Array<{ speaker: string; text: string; sentiment?: string }>,
  detectedLang: string = "en",
  consecutiveMisunderstandings: number = 0
): EscalationDetectionResult {
  const lower = customerMessage.toLowerCase().trim();

  // 1. Explicit Human Request
  const explicitHumanKeywords = [
    "human", "agent", "representative", "person", "real person", "operator",
    "manager", "supervisor", "someone real", "speak to someone", "talk to human",
    "insaan", "banda", "admi", "human se baat", "agent se baat", "manager se baat",
    "insaan se baat karwao", "kisi se baat", "rabta karwao",
    "मानव", "एजेंट", "प्रतिनिधि", "बात कराओ",
    "تحدث مع موظف", "خدمة العملاء", "إنسان", "ممثل"
  ];

  for (const kw of explicitHumanKeywords) {
    if (lower.includes(kw)) {
      return {
        shouldEscalate: true,
        reason: "Customer explicitly requested a human specialist",
        priority: "medium",
        customerAnnouncement: getTransferAnnouncement(detectedLang, "request"),
      };
    }
  }

  // 2. Sensitive Issue: Payment Dispute
  const paymentKeywords = [
    "charged twice", "double charge", "wrong amount", "unauthorized charge",
    "dispute payment", "payment failed but deducted", "billing dispute",
    "credit card fraud", "paise kat gaye", "ghalat charge", "payment masla",
    "paise wapas", "galat kata", "dupatta payment"
  ];

  for (const kw of paymentKeywords) {
    if (lower.includes(kw)) {
      return {
        shouldEscalate: true,
        reason: "Payment dispute & unauthorized charge inquiry",
        priority: "urgent",
        customerAnnouncement: getTransferAnnouncement(detectedLang, "payment"),
      };
    }
  }

  // 3. Sensitive Issue: Account & Security Issue
  const securityKeywords = [
    "account hacked", "compromised", "fraud", "stolen", "unauthorized access",
    "identity theft", "security breach", "suspended account", "locked out",
    "hacked", "account block", "chori ho gaya"
  ];

  for (const kw of securityKeywords) {
    if (lower.includes(kw)) {
      return {
        shouldEscalate: true,
        reason: "Critical account security or compromise alert",
        priority: "urgent",
        customerAnnouncement: getTransferAnnouncement(detectedLang, "security"),
      };
    }
  }

  // 4. Sensitive Issue: Refund Escalation
  const refundKeywords = [
    "refund dispute", "refused my refund", "where is my refund", "still no refund",
    "escalate refund", "refund not received", "paisa wapis nahi aya", "refund nahi mila"
  ];

  for (const kw of refundKeywords) {
    if (lower.includes(kw)) {
      return {
        shouldEscalate: true,
        reason: "Disputed or delayed refund escalation",
        priority: "high",
        customerAnnouncement: getTransferAnnouncement(detectedLang, "refund"),
      };
    }
  }

  // 5. Customer Repeatedly Says AI Did Not Understand (Misunderstanding threshold >= 2)
  const misunderstandingKeywords = [
    "you don't understand", "you do not understand", "did not understand",
    "that's not what i asked", "wrong answer", "you are not listening",
    "samajh nahi aa raha", "samajh nahi aayi", "ghalat jawab", "yeh nahi poocha",
    "galat samjha", "aap samajh nahi rahe"
  ];

  const indicatesMisunderstanding = misunderstandingKeywords.some((kw) => lower.includes(kw));
  if (indicatesMisunderstanding || consecutiveMisunderstandings >= 2) {
    return {
      shouldEscalate: true,
      reason: "Repeated customer misunderstanding / comprehension failure",
      priority: "high",
      customerAnnouncement: getTransferAnnouncement(detectedLang, "misunderstanding"),
    };
  }

  // 6. Highly Negative / Furious Customer Sentiment
  const angryKeywords = [
    "furious", "terrible", "worst service", "useless", "garbage", "scam",
    "lawsuit", "sue you", "complaint", "ridiculous", "disgusted", "stupid",
    "bakwas", "ghatiya", "fazool", "pareshan kar diya", "chor company", "dhoka"
  ];

  for (const kw of angryKeywords) {
    if (lower.includes(kw)) {
      return {
        shouldEscalate: true,
        reason: "High customer frustration / negative sentiment threshold exceeded",
        priority: "urgent",
        customerAnnouncement: getTransferAnnouncement(detectedLang, "anger"),
      };
    }
  }

  return {
    shouldEscalate: false,
    reason: "",
    priority: "low",
    customerAnnouncement: "",
  };
}

function getTransferAnnouncement(lang: string, type: string): string {
  const norm = (lang || "").toLowerCase();

  if (norm.startsWith("ur")) {
    if (type === "security" || type === "payment") {
      return "Main samajh sakta hoon ke yeh aik intehai ahem maamla hai. Main aapki call fori tor par hamare senior specialist agent ko transfer kar raha hoon. Barah-e-karam line par rahiye.";
    }
    return "Aapki behtar rehnumai ke liye main aapki call fori tor par hamare human specialist agent ko transfer kar raha hoon. Barah-e-karam line par rahiye ga.";
  }

  if (norm.startsWith("hi")) {
    return "आपकी समस्या के शीघ्र समाधान के लिए मैं आपकी कॉल तुरंत हमारे विशेषज्ञ मानव प्रतिनिधि को ट्रांसफर कर रहा हूँ। कृपया लाइन पर बने रहें।";
  }

  if (norm.startsWith("ar")) {
    return "سأقوم بتحويل مكالمتك فوراً إلى أحد ممثلي خدمة العملاء المتخصصين لمساعدتك. يرجى البقاء على الخط.";
  }

  if (type === "security" || type === "payment") {
    return "I recognize the urgency of this matter. I am connecting you directly with our senior specialist right now. Please hold on the line.";
  }

  return "I am connecting you with the next available human specialist who can assist you directly with this. Please hold the line.";
}

// =========================================================
// HANDOFF QUEUE MANAGEMENT (PostgreSQL)
// =========================================================

/**
 * Creates an escalation handoff request in PostgreSQL.
 */
export async function createHandoffRequest(params: {
  callId: number;
  customerId?: number | null;
  reason: string;
  priority?: EscalationPriority;
  sentiment?: Sentiment | string;
  language?: string;
  notes?: string;
}): Promise<HandoffRequestRecord> {
  const {
    callId,
    customerId = null,
    reason,
    priority = "medium",
    sentiment = "neutral",
    language = "en",
    notes = null,
  } = params;

  // Retrieve customer details and call duration from DB
  const callInfo = await pool.query(
    `SELECT
       calls.duration_seconds,
       calls.language AS call_lang,
       customers.name AS customer_name,
       customers.phone AS customer_phone
     FROM calls
     LEFT JOIN customers ON customers.id = calls.customer_id
     WHERE calls.id = $1`,
    [callId]
  );

  const row = callInfo.rows[0] || {};
  const custName = row.customer_name || "Valued Caller";
  const custPhone = row.customer_phone || "Unknown Phone";
  const duration = row.duration_seconds || 0;
  const effectiveLang = language || row.call_lang || "en";

  // Check if a pending handoff already exists for this call
  const existing = await pool.query(
    `SELECT * FROM handoff_requests
     WHERE call_id = $1 AND status IN ('pending', 'assigned', 'in_progress')
     ORDER BY created_at DESC LIMIT 1`,
    [callId]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    // Update existing request with higher priority or new reason
    const updated = await pool.query(
      `UPDATE handoff_requests
       SET reason = $1, priority = $2, sentiment = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [reason, priority, sentiment, existing.rows[0].id]
    );
    return updated.rows[0];
  }

  // Find an available online agent
  const agentQuery = await pool.query(
    `SELECT id, name FROM agents
     WHERE status = 'online'
     ORDER BY RANDOM() LIMIT 1`
  );
  const assignedAgentId = agentQuery.rows[0]?.id || null;
  const initialStatus: HandoffStatus = assignedAgentId ? "assigned" : "pending";

  const insertResult = await pool.query(
    `INSERT INTO handoff_requests
      (call_id, customer_id, reason, priority, status,
       assigned_agent_id, waiting_time_seconds, sentiment, language,
       customer_name, customer_phone, call_duration_seconds, notes)
     VALUES ($1, $2, $3, $4, $5, $6, 0, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      callId,
      customerId,
      reason,
      priority,
      initialStatus,
      assignedAgentId,
      sentiment,
      effectiveLang,
      custName,
      custPhone,
      duration,
      notes,
    ]
  );

  // Update call handled_by to 'ai_then_human'
  await pool.query(
    `UPDATE calls SET handled_by = 'ai_then_human' WHERE id = $1`,
    [callId]
  );

  return insertResult.rows[0];
}

/**
 * Lists the active handoff queue with live waiting time calculation.
 */
export async function listHandoffQueue(statusFilter?: string): Promise<HandoffRequestRecord[]> {
  const sql = statusFilter
    ? `SELECT
         hr.*,
         agents.name AS assigned_agent_name,
         EXTRACT(EPOCH FROM (NOW() - hr.created_at))::int AS waiting_time_seconds
       FROM handoff_requests hr
       LEFT JOIN agents ON agents.id = hr.assigned_agent_id
       WHERE hr.status = $1
       ORDER BY
         CASE hr.priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           ELSE 4
         END ASC,
         hr.created_at ASC`
    : `SELECT
         hr.*,
         agents.name AS assigned_agent_name,
         EXTRACT(EPOCH FROM (NOW() - hr.created_at))::int AS waiting_time_seconds
       FROM handoff_requests hr
       LEFT JOIN agents ON agents.id = hr.assigned_agent_id
       ORDER BY
         CASE hr.status
           WHEN 'pending' THEN 1
           WHEN 'assigned' THEN 2
           WHEN 'accepted' THEN 3
           WHEN 'in_progress' THEN 4
           ELSE 5
         END ASC,
         CASE hr.priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           ELSE 4
         END ASC,
         hr.created_at ASC`;

  const values = statusFilter ? [statusFilter] : [];
  const result = await pool.query(sql, values);
  return result.rows;
}

/**
 * Agent accepts an escalation handoff call.
 * Performs real Twilio call redirect / transfer if Twilio is active.
 */
export async function acceptHandoffCall(
  handoffId: number,
  agentId: number,
  agentPhoneNumber?: string
): Promise<{
  success: boolean;
  handoff: HandoffRequestRecord;
  twilioTransferred: boolean;
  message: string;
}> {
  const handoffRes = await pool.query(
    `SELECT hr.*, calls.telephony_call_sid
     FROM handoff_requests hr
     JOIN calls ON calls.id = hr.call_id
     WHERE hr.id = $1`,
    [handoffId]
  );

  if (handoffRes.rowCount === 0) {
    throw new Error("Handoff request not found.");
  }

  const handoff = handoffRes.rows[0];

  // Update handoff status to 'accepted' then 'in_progress'
  const updateHandoff = await pool.query(
    `UPDATE handoff_requests
     SET status = 'accepted',
         assigned_agent_id = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [agentId, handoffId]
  );

  // Update call agent_id and handled_by
  await pool.query(
    `UPDATE calls
     SET agent_id = $1, handled_by = 'ai_then_human', status = 'in_progress'
     WHERE id = $2`,
    [agentId, handoff.call_id]
  );

  // Update agent status to 'on_call'
  await pool.query(
    `UPDATE agents SET status = 'on_call' WHERE id = $1`,
    [agentId]
  );

  // Record transfer in transcripts
  await pool.query(
    `INSERT INTO call_transcripts
      (call_id, speaker, original_text, sentiment)
     VALUES ($1, 'agent', 'Human Agent has joined and accepted the call.', 'positive')`,
    [handoff.call_id]
  );

  let twilioTransferred = false;
  let message = "Handoff accepted. Agent assigned to live call session.";

  // If real Twilio call is active, execute real Twilio Transfer
  const callSid = handoff.telephony_call_sid;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const publicUrl = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;

  if (callSid && accountSid && authToken && publicUrl) {
    try {
      const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
      const transferUrl = `${publicUrl}/api/twilio/voice/agent-connect?handoffId=${handoffId}&agentId=${agentId}`;

      const params = new URLSearchParams();
      params.append("Url", transferUrl);
      params.append("Method", "POST");

      const twilioResp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls/${callSid}.json`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
        }
      );

      if (twilioResp.ok) {
        twilioTransferred = true;
        message = "Twilio telephony stream redirected: Human agent successfully bridged.";
      } else {
        const errData: any = await twilioResp.json();
        console.warn("[Twilio Transfer Warning]:", errData);
      }
    } catch (twErr) {
      console.warn("[Twilio Call Transfer Network Error]:", twErr);
    }
  }

  return {
    success: true,
    handoff: updateHandoff.rows[0],
    twilioTransferred,
    message,
  };
}

/**
 * Agent rejects a handoff call; returns it to pending queue or reassigns.
 */
export async function rejectHandoffCall(
  handoffId: number,
  agentId: number,
  reason: string = "Agent unavailable"
): Promise<HandoffRequestRecord> {
  const result = await pool.query(
    `UPDATE handoff_requests
     SET status = 'pending',
         assigned_agent_id = NULL,
         notes = COALESCE(notes || E'\n', '') || $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [`Rejected by agent #${agentId}: ${reason}`, handoffId]
  );

  return result.rows[0];
}

/**
 * Complete a handoff call session.
 */
export async function completeHandoff(
  handoffId: number
): Promise<HandoffRequestRecord> {
  const result = await pool.query(
    `UPDATE handoff_requests
     SET status = 'completed', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [handoffId]
  );

  if (result.rows[0]?.assigned_agent_id) {
    await pool.query(
      `UPDATE agents SET status = 'online' WHERE id = $1`,
      [result.rows[0].assigned_agent_id]
    );
  }

  return result.rows[0];
}
