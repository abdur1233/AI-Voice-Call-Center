import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";
import { generateAiReply, generateCallSummary, detectSentiment } from "../services/aiService.js";
import { getGroundedKnowledgeContext } from "../services/ragService.js";
import { checkEscalationConditions, createHandoffRequest } from "../services/escalationService.js";
import { broadcastToDashboards } from "../services/audioStreamService.js";

export const callsRouter = Router();

callsRouter.use(requireAuth);


// GET /api/calls/stats/summary — aggregate numbers for the
// dashboard (total calls, active calls, avg duration, etc.)
callsRouter.get("/stats/summary", async (_req, res) => {

    try {

        const result = await pool.query(`
            SELECT
                COUNT(*)::int AS total_calls,

                COUNT(*) FILTER (
                    WHERE status IN ('ringing', 'in_progress')
                )::int AS active_calls,

                COALESCE(
                    AVG(duration_seconds)
                        FILTER (WHERE status = 'completed'),
                    0
                )::int AS avg_duration_seconds,

                COUNT(*) FILTER (
                    WHERE status = 'completed'
                    AND handled_by = 'ai'
                )::int AS ai_resolved_calls,

                COUNT(*) FILTER (
                    WHERE status = 'completed'
                )::int AS completed_calls

            FROM calls
        `);

        const row = result.rows[0];

        const resolutionRate =
            row.completed_calls > 0
                ? Math.round(
                    (row.ai_resolved_calls / row.completed_calls) * 1000
                ) / 10
                : 0;

        res.json({
            success: true,
            stats: {
                total_calls: row.total_calls,
                active_calls: row.active_calls,
                avg_duration_seconds: row.avg_duration_seconds,
                ai_resolution_rate: resolutionRate
            }
        });

    } catch (error) {

        console.error("CALL STATS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not load stats."
        });

    }

});


// GET /api/calls — list calls (optionally filter by status)
callsRouter.get("/", async (req, res) => {

    try {

        const status = String(req.query.status || "").trim();

        const result = status
            ? await pool.query(
                `SELECT
                    calls.*,
                    customers.name AS customer_name,
                    customers.phone AS customer_phone,
                    agents.name AS agent_name
                 FROM calls
                 LEFT JOIN customers ON customers.id = calls.customer_id
                 LEFT JOIN agents ON agents.id = calls.agent_id
                 WHERE calls.status = $1
                 ORDER BY calls.started_at DESC
                 LIMIT 100`,
                [status]
            )
            : await pool.query(
                `SELECT
                    calls.*,
                    customers.name AS customer_name,
                    customers.phone AS customer_phone,
                    agents.name AS agent_name
                 FROM calls
                 LEFT JOIN customers ON customers.id = calls.customer_id
                 LEFT JOIN agents ON agents.id = calls.agent_id
                 ORDER BY calls.started_at DESC
                 LIMIT 100`
            );

        res.json({ success: true, calls: result.rows });

    } catch (error) {

        console.error("LIST CALLS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not load calls."
        });

    }

});


// GET /api/calls/:id — one call, with its transcript + summary
callsRouter.get("/:id", async (req, res) => {

    try {

        const callId = Number(req.params.id);

        const callResult = await pool.query(
            `SELECT
                calls.*,
                customers.name AS customer_name,
                customers.phone AS customer_phone,
                agents.name AS agent_name
             FROM calls
             LEFT JOIN customers ON customers.id = calls.customer_id
             LEFT JOIN agents ON agents.id = calls.agent_id
             WHERE calls.id = $1`,
            [callId]
        );

        const call = callResult.rows[0];

        if (!call) {

            res.status(404).json({
                success: false,
                message: "Call not found."
            });

            return;

        }

        const transcriptResult = await pool.query(
            `SELECT * FROM call_transcripts
             WHERE call_id = $1
             ORDER BY spoken_at ASC`,
            [callId]
        );

        const summaryResult = await pool.query(
            `SELECT * FROM call_summaries WHERE call_id = $1`,
            [callId]
        );

        res.json({
            success: true,
            call,
            transcript: transcriptResult.rows,
            summary: summaryResult.rows[0] || null
        });

    } catch (error) {

        console.error("GET CALL ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not load call."
        });

    }

});


// POST /api/calls — create a call record
// (In Phase 2, this will instead be created automatically by
//  the Twilio webhook when a real call comes in. For now this
//  lets the dashboard/tests create call records manually.)
callsRouter.post("/", async (req, res) => {

    try {

        const {
            customer_id,
            agent_id,
            direction,
            handled_by,
            language
        } = req.body || {};

        if (!customer_id) {

            res.status(400).json({
                success: false,
                message: "customer_id is required."
            });

            return;

        }

        const result = await pool.query(
            `INSERT INTO calls
                (customer_id, agent_id, direction, handled_by,
                 language, status)
             VALUES ($1, $2, $3, $4, $5, 'ringing')
             RETURNING *`,
            [
                customer_id,
                agent_id || null,
                direction === "outbound" ? "outbound" : "inbound",
                handled_by || "ai",
                language || "en"
            ]
        );

        res.status(201).json({
            success: true,
            call: result.rows[0]
        });

    } catch (error) {

        console.error("CREATE CALL ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not create call."
        });

    }

});


// PATCH /api/calls/:id — update a call's status/agent/etc
callsRouter.patch("/:id", async (req, res) => {

    try {

        const callId = Number(req.params.id);
        const { status, agent_id } = req.body || {};

        const fields: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (status) {

            fields.push(`status = $${paramIndex}`);
            values.push(status);
            paramIndex++;

            if (status === "completed" || status === "missed" ||
                status === "failed") {

                fields.push(
                    `ended_at = NOW(), ` +
                    `duration_seconds = ` +
                    `EXTRACT(EPOCH FROM (NOW() - started_at))::int`
                );

            }

        }

        if (agent_id !== undefined) {

            fields.push(`agent_id = $${paramIndex}`);
            values.push(agent_id);
            paramIndex++;

        }

        if (fields.length === 0) {

            res.status(400).json({
                success: false,
                message: "Nothing to update."
            });

            return;

        }

        values.push(callId);

        const result = await pool.query(
            `UPDATE calls SET ${fields.join(", ")}
             WHERE id = $${paramIndex}
             RETURNING *`,
            values
        );

        if (result.rowCount === 0) {

            res.status(404).json({
                success: false,
                message: "Call not found."
            });

            return;

        }

        res.json({ success: true, call: result.rows[0] });

    } catch (error) {

        console.error("UPDATE CALL ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not update call."
        });

    }

});


// POST /api/calls/:id/transcript — append a transcript line
callsRouter.post("/:id/transcript", async (req, res) => {

    try {

        const callId = Number(req.params.id);

        const {
            speaker,
            original_text,
            original_language,
            translated_text,
            translated_language,
            sentiment
        } = req.body || {};

        if (!speaker || !original_text) {

            res.status(400).json({
                success: false,
                message: "speaker and original_text are required."
            });

            return;

        }

        const result = await pool.query(
            `INSERT INTO call_transcripts
                (call_id, speaker, original_text, original_language,
                 translated_text, translated_language, sentiment)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [
                callId,
                speaker,
                original_text,
                original_language || "en",
                translated_text || null,
                translated_language || null,
                sentiment || null
            ]
        );

        res.status(201).json({
            success: true,
            entry: result.rows[0]
        });

    } catch (error) {

        console.error("ADD TRANSCRIPT ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not save transcript line."
        });

    }

});





// POST /api/calls/:id/ai-respond — customer speech/text in -> AI reply out
callsRouter.post("/:id/ai-respond", async (req, res) => {

    try {

        const callId = Number(req.params.id);
        const { message, language = "en" } = req.body || {};

        if (!message || typeof message !== "string") {
            res.status(400).json({
                success: false,
                message: "A message string is required."
            });
            return;
        }

        // 1. Check call exists and is active
        const callResult = await pool.query(
            "SELECT * FROM calls WHERE id = $1",
            [callId]
        );

        if (callResult.rowCount === 0) {
            res.status(404).json({ success: false, message: "Call not found." });
            return;
        }

        const call = callResult.rows[0];

        // 2. Fetch past transcripts for context & misunderstanding tracking
        const pastTranscriptsResult = await pool.query(
            "SELECT speaker, original_text AS text, sentiment FROM call_transcripts WHERE call_id = $1 ORDER BY spoken_at ASC",
            [callId]
        );
        const history = pastTranscriptsResult.rows;

        // Count misunderstandings in history
        const misunderstandingKeywords = ["don't understand", "not what i asked", "wrong", "samajh nahi"];
        const misCount = history.filter((h) =>
            h.speaker === "customer" && misunderstandingKeywords.some((k) => h.text.toLowerCase().includes(k))
        ).length;

        const effectiveLang = language || call.language || "en";
        const sentiment = detectSentiment(message);

        // 3. Check Escalation Conditions
        const escalation = checkEscalationConditions(message, history, effectiveLang, misCount);

        if (escalation.shouldEscalate) {
            console.log(`[ESCALATION TRIGGERED on Call #${callId}]: ${escalation.reason} (${escalation.priority})`);

            // Save customer transcript
            const customerTranscript = await pool.query(
                `INSERT INTO call_transcripts
                    (call_id, speaker, original_text, original_language, sentiment)
                 VALUES ($1, 'customer', $2, $3, $4)
                 RETURNING *`,
                [callId, message.trim(), effectiveLang, sentiment]
            );

            // Save AI announcement transcript
            const aiTranscript = await pool.query(
                `INSERT INTO call_transcripts
                    (call_id, speaker, original_text, original_language, sentiment)
                 VALUES ($1, 'ai', $2, $3, 'neutral')
                 RETURNING *`,
                [callId, escalation.customerAnnouncement, effectiveLang]
            );

            // Create Handoff Request in PostgreSQL
            const handoff = await createHandoffRequest({
                callId,
                customerId: call.customer_id,
                reason: escalation.reason,
                priority: escalation.priority,
                sentiment,
                language: effectiveLang,
            });

            // Real-time broadcast to all Agent Dashboards
            broadcastToDashboards({
                type: "new_handoff_request",
                handoff,
                callId,
            });

            res.json({
                success: true,
                escalated: true,
                escalationReason: escalation.reason,
                priority: escalation.priority,
                customerEntry: customerTranscript.rows[0],
                aiEntry: aiTranscript.rows[0],
                handoff,
                detectedLanguage: effectiveLang
            });
            return;
        }

        // 4. Retrieve Grounded Context via PostgreSQL Semantic pgvector RAG
        const ragContext = await getGroundedKnowledgeContext(message, 4);

        // Also fetch legacy KB articles for fallback
        const kbResult = await pool.query(
            "SELECT title, content, category FROM knowledge_base ORDER BY id ASC"
        );

        // 5. Generate AI response grounded on retrieved semantic chunks
        const aiResult = await generateAiReply(
            message,
            kbResult.rows,
            language,
            ragContext.groundedText
        );
        const resolvedLang = aiResult.detectedLanguage || effectiveLang;

        // Update call language if call was set to auto or changed
        await pool.query(
            "UPDATE calls SET language = $1 WHERE id = $2 AND (language = 'auto' OR language IS NULL)",
            [resolvedLang, callId]
        );

        // 6. Save customer transcript line
        const customerTranscript = await pool.query(
            `INSERT INTO call_transcripts
                (call_id, speaker, original_text, original_language, sentiment)
             VALUES ($1, 'customer', $2, $3, $4)
             RETURNING *`,
            [callId, message.trim(), resolvedLang, aiResult.sentiment]
        );

        // 7. Save AI transcript line
        const aiTranscript = await pool.query(
            `INSERT INTO call_transcripts
                (call_id, speaker, original_text, original_language, sentiment)
             VALUES ($1, 'ai', $2, $3, 'neutral')
             RETURNING *`,
            [callId, aiResult.replyText, resolvedLang]
        );

        // Broadcast to Dashboards
        broadcastToDashboards({
            type: "transcript_line",
            callId,
            speaker: "customer",
            text: message.trim(),
            language: resolvedLang
        });

        broadcastToDashboards({
            type: "transcript_line",
            callId,
            speaker: "ai",
            text: aiResult.replyText,
            language: resolvedLang
        });

        res.json({
            success: true,
            escalated: false,
            customerEntry: customerTranscript.rows[0],
            aiEntry: aiTranscript.rows[0],
            usedRealLlm: aiResult.usedRealLlm,
            detectedLanguage: resolvedLang,
            retrievedChunks: ragContext.retrievedChunks
        });

    } catch (error) {
        console.error("AI RESPOND ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to generate AI response."
        });
    }

});


// POST /api/calls/test-ai — instant playground to test AI answers in any language
callsRouter.post("/test-ai", async (req, res) => {
    try {
        const { message, language = "auto" } = req.body || {};
        if (!message || typeof message !== "string") {
            res.status(400).json({ success: false, message: "A message string is required." });
            return;
        }

        const kbResult = await pool.query(
            "SELECT title, content, category FROM knowledge_base ORDER BY id ASC"
        );

        const aiResult = await generateAiReply(message, kbResult.rows, language);

        res.json({
            success: true,
            replyText: aiResult.replyText,
            sentiment: aiResult.sentiment,
            detectedLanguage: aiResult.detectedLanguage,
            usedRealLlm: aiResult.usedRealLlm
        });
    } catch (error) {
        console.error("TEST AI ERROR:", error);
        res.status(500).json({ success: false, message: "Failed to test AI response." });
    }
});


// POST /api/calls/:id/complete — finish call, calculate duration, auto-generate summary
callsRouter.post("/:id/complete", async (req, res) => {

    try {

        const callId = Number(req.params.id);

        // Update call status
        const updateResult = await pool.query(
            `UPDATE calls
             SET status = 'completed',
                 ended_at = NOW(),
                 duration_seconds = GREATEST(
                     EXTRACT(EPOCH FROM (NOW() - started_at))::int,
                     COALESCE(duration_seconds, 1)
                 )
             WHERE id = $1
             RETURNING *`,
            [callId]
        );

        if (updateResult.rowCount === 0) {
            res.status(404).json({ success: false, message: "Call not found." });
            return;
        }

        const call = updateResult.rows[0];

        // Fetch transcripts to summarize
        const transcriptsResult = await pool.query(
            `SELECT speaker, original_text, sentiment
             FROM call_transcripts
             WHERE call_id = $1
             ORDER BY spoken_at ASC`,
            [callId]
        );

        // Auto-generate summary using real LLM or structured local engine
        const summary = await generateCallSummary(transcriptsResult.rows);

        // Insert or update call_summaries with enterprise QA & Intelligence
        const summaryResult = await pool.query(
            `INSERT INTO call_summaries
                (call_id, summary_text, overall_sentiment, key_points, qa_score, csat_score, resolution_status, action_items, compliance_checklist, sentiment_trajectory, topics_detected)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (call_id) DO UPDATE
                SET summary_text = EXCLUDED.summary_text,
                    overall_sentiment = EXCLUDED.overall_sentiment,
                    key_points = EXCLUDED.key_points,
                    qa_score = EXCLUDED.qa_score,
                    csat_score = EXCLUDED.csat_score,
                    resolution_status = EXCLUDED.resolution_status,
                    action_items = EXCLUDED.action_items,
                    compliance_checklist = EXCLUDED.compliance_checklist,
                    sentiment_trajectory = EXCLUDED.sentiment_trajectory,
                    topics_detected = EXCLUDED.topics_detected
             RETURNING *`,
            [
                callId,
                summary.summaryText,
                summary.overallSentiment,
                summary.keyPoints,
                summary.qaScore ?? 85,
                summary.csatScore ?? 4,
                summary.resolutionStatus ?? "resolved",
                JSON.stringify(summary.actionItems ?? []),
                JSON.stringify(summary.complianceChecklist ?? {}),
                JSON.stringify(summary.sentimentTrajectory ?? []),
                summary.topicsDetected ?? ["General Support"]
            ]
        );

        res.json({
            success: true,
            call,
            summary: summaryResult.rows[0],
            usedRealLlm: summary.usedRealLlm
        });

    } catch (error) {
        console.error("COMPLETE CALL ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Failed to complete call and generate summary."
        });
    }

});


// POST /api/calls/simulate-incoming — simulate an inbound customer call
callsRouter.post("/simulate-incoming", async (_req, res) => {

    try {

        // 1. Ensure test customer exists
        const custResult = await pool.query(
            `INSERT INTO customers (name, phone, email, preferred_language)
             VALUES ('Alex Rivera', '+1 (555) 349-8291', 'alex.rivera@example.com', 'en')
             ON CONFLICT (phone) DO UPDATE
                SET name = EXCLUDED.name
             RETURNING id, name, phone`
        );

        const customer = custResult.rows[0];

        // 2. Create ringing call
        const callResult = await pool.query(
            `INSERT INTO calls
                (customer_id, direction, handled_by, language, status)
             VALUES ($1, 'inbound', 'ai', 'en', 'ringing')
             RETURNING *`,
            [customer.id]
        );

        res.status(201).json({
            success: true,
            call: {
                ...callResult.rows[0],
                customer_name: customer.name,
                customer_phone: customer.phone
            }
        });

    } catch (error) {
        console.error("SIMULATE INCOMING CALL ERROR:", error);
        res.status(500).json({
            success: false,
            message: "Could not simulate incoming call."
        });
    }

});

