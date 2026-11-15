import { Router } from "express";
import { pool } from "../db/pool.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signAgentToken } from "../utils/token.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();


// ---------------------------------------------------------
// POST /api/auth/setup
// One-time route to create the very first admin account.
// Only works if there are zero agents in the database yet,
// and requires the private SETUP_KEY from your .env file —
// so it can't be abused by anyone who finds the URL.
// ---------------------------------------------------------

authRouter.post("/setup", async (req, res) => {

    try {

        const { name, email, password, setupKey } = req.body || {};

        if (setupKey !== process.env.SETUP_KEY) {

            res.status(403).json({
                success: false,
                message: "Invalid setup key."
            });

            return;

        }

        const existing = await pool.query(
            "SELECT COUNT(*)::int AS count FROM agents"
        );

        if (existing.rows[0].count > 0) {

            res.status(409).json({
                success: false,
                message:
                    "Setup has already been completed. " +
                    "Use the regular login instead."
            });

            return;

        }

        if (!name || !email || !password) {

            res.status(400).json({
                success: false,
                message: "Name, email and password are required."
            });

            return;

        }

        if (String(password).length < 8) {

            res.status(400).json({
                success: false,
                message: "Password must be at least 8 characters."
            });

            return;

        }

        const passwordHash = hashPassword(String(password));

        const result = await pool.query(
            `INSERT INTO agents (name, email, password_hash, role, status)
             VALUES ($1, $2, $3, 'admin', 'offline')
             RETURNING id, name, email, role, status`,
            [name, String(email).toLowerCase().trim(), passwordHash]
        );

        const agent = result.rows[0];

        const token = signAgentToken({
            agentId: agent.id,
            email: agent.email,
            role: agent.role
        });

        res.status(201).json({
            success: true,
            token,
            agent
        });

    } catch (error) {

        console.error("SETUP ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not complete setup."
        });

    }

});


// ---------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------

authRouter.post("/login", async (req, res) => {

    try {

        const { email, password } = req.body || {};

        if (!email || !password) {

            res.status(400).json({
                success: false,
                message: "Email and password are required."
            });

            return;

        }

        const result = await pool.query(
            "SELECT * FROM agents WHERE email = $1",
            [String(email).toLowerCase().trim()]
        );

        const agent = result.rows[0];

        const passwordOk =
            agent &&
            verifyPassword(String(password), agent.password_hash);

        if (!passwordOk) {

            res.status(401).json({
                success: false,
                message: "Invalid email or password."
            });

            return;

        }

        const token = signAgentToken({
            agentId: agent.id,
            email: agent.email,
            role: agent.role
        });

        res.json({
            success: true,
            token,
            agent: {
                id: agent.id,
                name: agent.name,
                email: agent.email,
                role: agent.role,
                status: agent.status
            }
        });

    } catch (error) {

        console.error("LOGIN ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not log in right now."
        });

    }

});


// ---------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------

authRouter.get("/me", requireAuth, async (req, res) => {

    try {

        const result = await pool.query(
            `SELECT id, name, email, role, status, created_at
             FROM agents WHERE id = $1`,
            [req.agent!.agentId]
        );

        const agent = result.rows[0];

        if (!agent) {

            res.status(404).json({
                success: false,
                message: "Agent not found."
            });

            return;

        }

        res.json({ success: true, agent });

    } catch (error) {

        console.error("ME ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not load profile."
        });

    }

});
