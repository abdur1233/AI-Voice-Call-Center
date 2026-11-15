import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

export const customersRouter = Router();

customersRouter.use(requireAuth);


// GET /api/customers — list/search customers
customersRouter.get("/", async (req, res) => {

    try {

        const search = String(req.query.search || "").trim();

        const result = search
            ? await pool.query(
                `SELECT * FROM customers
                 WHERE name ILIKE $1 OR phone ILIKE $1 OR email ILIKE $1
                 ORDER BY created_at DESC
                 LIMIT 100`,
                [`%${search}%`]
            )
            : await pool.query(
                `SELECT * FROM customers
                 ORDER BY created_at DESC
                 LIMIT 100`
            );

        res.json({ success: true, customers: result.rows });

    } catch (error) {

        console.error("LIST CUSTOMERS ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not load customers."
        });

    }

});


// POST /api/customers — create a new customer record
customersRouter.post("/", async (req, res) => {

    try {

        const { name, phone, email, preferred_language } =
            req.body || {};

        if (!phone) {

            res.status(400).json({
                success: false,
                message: "Phone number is required."
            });

            return;

        }

        const result = await pool.query(
            `INSERT INTO customers (name, phone, email, preferred_language)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (phone) DO UPDATE
                SET name = COALESCE(EXCLUDED.name, customers.name),
                    email = COALESCE(EXCLUDED.email, customers.email)
             RETURNING *`,
            [
                name || null,
                phone,
                email || null,
                preferred_language || "en"
            ]
        );

        res.status(201).json({
            success: true,
            customer: result.rows[0]
        });

    } catch (error) {

        console.error("CREATE CUSTOMER ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not save customer."
        });

    }

});
