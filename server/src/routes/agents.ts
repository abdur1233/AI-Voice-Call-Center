import { Router } from "express";
import { pool } from "../db/pool.js";
import { hashPassword } from "../utils/password.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export const agentsRouter = Router();

agentsRouter.use(requireAuth);


// GET /api/agents — list all agents
agentsRouter.get("/", async (_req, res) => {

    try {

        const result = await pool.query(
            `SELECT id, name, email, role, status, created_at
             FROM agents
             ORDER BY created_at DESC`
        );

        res.json({ success: true, agents: result.rows });

    } catch (error) {

        console.error("LIST AGENTS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not load agents."
        });

    }

});


// POST /api/agents — create a new agent (admin only)
agentsRouter.post("/", requireAdmin, async (req, res) => {

    try {

        const { name, email, password, role } = req.body || {};

        if (!name || !email || !password) {

            res.status(400).json({
                success: false,
                message: "Name, email and password are required."
            });

            return;

        }

        const passwordHash = hashPassword(String(password));

        const result = await pool.query(
            `INSERT INTO agents (name, email, password_hash, role)
             VALUES ($1, $2, $3, $4)
             RETURNING id, name, email, role, status, created_at`,
            [
                name,
                String(email).toLowerCase().trim(),
                passwordHash,
                role === "admin" ? "admin" : "agent"
            ]
        );

        res.status(201).json({
            success: true,
            agent: result.rows[0]
        });

    } catch (error: any) {

        if (error?.code === "23505") {

            res.status(409).json({
                success: false,
                message: "An agent with that email already exists."
            });

            return;

        }

        console.error("CREATE AGENT ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not create agent."
        });

    }

});


// PATCH /api/agents/:id/status — update own or (if admin)
// another agent's online/offline/away status
agentsRouter.patch("/:id/status", async (req, res) => {

    try {

        const targetId = Number(req.params.id);
        const { status } = req.body || {};

        const validStatuses = [
            "online", "offline", "on_call", "away"
        ];

        if (!validStatuses.includes(status)) {

            res.status(400).json({
                success: false,
                message: "Invalid status."
            });

            return;

        }

        const isSelf = targetId === req.agent!.agentId;
        const isAdmin = req.agent!.role === "admin";

        if (!isSelf && !isAdmin) {

            res.status(403).json({
                success: false,
                message: "You can only update your own status."
            });

            return;

        }

        const result = await pool.query(
            `UPDATE agents SET status = $1
             WHERE id = $2
             RETURNING id, name, email, role, status`,
            [status, targetId]
        );

        if (result.rowCount === 0) {

            res.status(404).json({
                success: false,
                message: "Agent not found."
            });

            return;

        }

        res.json({ success: true, agent: result.rows[0] });

    } catch (error) {

        console.error("UPDATE AGENT STATUS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not update status."
        });

    }

});
