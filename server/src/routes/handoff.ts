import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import {
  listHandoffQueue,
  acceptHandoffCall,
  rejectHandoffCall,
  completeHandoff,
  createHandoffRequest,
} from "../services/escalationService.js";
import { broadcastToDashboards } from "../services/audioStreamService.js";

export const handoffRouter = Router();

handoffRouter.use(requireAuth);

// ---------------------------------------------------------
// GET /api/handoff/stats — queue statistics for top widgets
// ---------------------------------------------------------
handoffRouter.get("/stats", async (_req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
        COUNT(*) FILTER (WHERE status = 'assigned')::int AS assigned_count,
        COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_count,
        COALESCE(
          AVG(EXTRACT(EPOCH FROM (NOW() - created_at))) FILTER (WHERE status IN ('pending', 'assigned')),
          0
        )::int AS avg_wait_seconds,
        COUNT(*) FILTER (WHERE priority = 'urgent' AND status IN ('pending', 'assigned'))::int AS urgent_pending
      FROM handoff_requests
    `);

    res.json({
      success: true,
      stats: statsResult.rows[0],
    });
  } catch (error: any) {
    console.error("HANDOFF STATS ERROR:", error);
    res.status(500).json({ success: false, message: "Could not load handoff statistics." });
  }
});

// ---------------------------------------------------------
// GET /api/handoff — list handoff queue with filters
// ---------------------------------------------------------
handoffRouter.get("/", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const queue = await listHandoffQueue(status);
    res.json({ success: true, queue });
  } catch (error: any) {
    console.error("LIST HANDOFF QUEUE ERROR:", error);
    res.status(500).json({ success: false, message: "Could not load handoff queue." });
  }
});

// ---------------------------------------------------------
// GET /api/handoff/:id — detail with live transcript & customer info
// ---------------------------------------------------------
handoffRouter.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const handoffResult = await pool.query(
      `SELECT
         hr.*,
         agents.name AS assigned_agent_name,
         calls.direction,
         calls.started_at,
         calls.telephony_call_sid
       FROM handoff_requests hr
       LEFT JOIN agents ON agents.id = hr.assigned_agent_id
       LEFT JOIN calls ON calls.id = hr.call_id
       WHERE hr.id = $1`,
      [id]
    );

    if (handoffResult.rowCount === 0) {
      res.status(404).json({ success: false, message: "Handoff request not found." });
      return;
    }

    const handoff = handoffResult.rows[0];

    // Fetch transcripts
    const transcriptsResult = await pool.query(
      `SELECT * FROM call_transcripts WHERE call_id = $1 ORDER BY spoken_at ASC`,
      [handoff.call_id]
    );

    res.json({
      success: true,
      handoff,
      transcripts: transcriptsResult.rows,
    });
  } catch (error: any) {
    console.error("GET HANDOFF DETAIL ERROR:", error);
    res.status(500).json({ success: false, message: "Could not load handoff detail." });
  }
});

// ---------------------------------------------------------
// POST /api/handoff/:id/accept — agent accepts the escalation call
// ---------------------------------------------------------
handoffRouter.post("/:id/accept", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const agentId = req.agent!.agentId;

    const result = await acceptHandoffCall(id, agentId);

    // Broadcast update to all agent screens
    broadcastToDashboards({
      type: "handoff_status_changed",
      handoffId: id,
      status: "in_progress",
      agentId,
      agentName: req.agent?.email || "Agent",
    });

    res.json({
      success: true,
      handoff: result.handoff,
      twilioTransferred: result.twilioTransferred,
      message: result.message,
    });
  } catch (error: any) {
    console.error("ACCEPT HANDOFF ERROR:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to accept handoff call.",
    });
  }
});

// ---------------------------------------------------------
// POST /api/handoff/:id/reject — agent rejects the call
// ---------------------------------------------------------
handoffRouter.post("/:id/reject", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const agentId = req.agent!.agentId;
    const { reason = "Agent currently handling another priority call" } = req.body || {};

    const updated = await rejectHandoffCall(id, agentId, reason);

    broadcastToDashboards({
      type: "handoff_status_changed",
      handoffId: id,
      status: "pending",
      rejectionReason: reason,
    });

    res.json({ success: true, handoff: updated });
  } catch (error: any) {
    console.error("REJECT HANDOFF ERROR:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to reject handoff.",
    });
  }
});

// ---------------------------------------------------------
// POST /api/handoff/:id/complete — mark escalation completed
// ---------------------------------------------------------
handoffRouter.post("/:id/complete", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const completed = await completeHandoff(id);

    broadcastToDashboards({
      type: "handoff_status_changed",
      handoffId: id,
      status: "completed",
    });

    res.json({ success: true, handoff: completed });
  } catch (error: any) {
    console.error("COMPLETE HANDOFF ERROR:", error);
    res.status(500).json({ success: false, message: "Could not complete handoff." });
  }
});

// ---------------------------------------------------------
// POST /api/handoff/simulate — simulate an escalation for testing
// ---------------------------------------------------------
handoffRouter.post("/simulate", async (req, res) => {
  try {
    const {
      reason = "Customer payment dispute - unauthorized debit detected",
      priority = "urgent",
      sentiment = "negative",
      language = "ur",
    } = req.body || {};

    // 1. Create or get test customer
    const custResult = await pool.query(
      `INSERT INTO customers (name, phone, preferred_language)
       VALUES ('Hamza Rafiq', '+92 301 8847291', $1)
       ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, phone`,
      [language]
    );
    const customer = custResult.rows[0];

    // 2. Create active call
    const callResult = await pool.query(
      `INSERT INTO calls (customer_id, direction, handled_by, status, language)
       VALUES ($1, 'inbound', 'ai_then_human', 'in_progress', $2)
       RETURNING id`,
      [customer.id, language]
    );
    const callId = callResult.rows[0].id;

    // 3. Insert customer angry speech
    await pool.query(
      `INSERT INTO call_transcripts (call_id, speaker, original_text, sentiment)
       VALUES ($1, 'customer', 'Mera account block ho gaya hai aur paise kat gaye hain! Mujhe foran human agent se baat karni hai!', 'negative')`,
      [callId]
    );

    // 4. Create handoff request
    const handoff = await createHandoffRequest({
      callId,
      customerId: customer.id,
      reason,
      priority,
      sentiment,
      language,
      notes: "Triggered from AI Escalation Simulator Console",
    });

    // 5. Broadcast live notification to all agent screens
    broadcastToDashboards({
      type: "new_handoff_request",
      handoff,
      callId,
    });

    res.status(201).json({
      success: true,
      handoff,
      message: "Escalation handoff request created and broadcast to agents.",
    });
  } catch (error: any) {
    console.error("SIMULATE ESCALATION ERROR:", error);
    res.status(500).json({ success: false, message: "Could not simulate escalation." });
  }
});
