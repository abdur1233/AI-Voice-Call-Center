import { Router } from "express";
import { pool } from "../db/pool.js";
import { requireAuth } from "../middleware/auth.js";

export const knowledgeBaseRouter = Router();

knowledgeBaseRouter.use(requireAuth);


// GET /api/knowledge-base — list all articles
knowledgeBaseRouter.get("/", async (_req, res) => {

    try {

        const result = await pool.query(
            `SELECT * FROM knowledge_base
             ORDER BY created_at DESC`
        );

        res.json({ success: true, articles: result.rows });

    } catch (error) {

        console.error("LIST KNOWLEDGE BASE ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not load knowledge base."
        });

    }

});


// POST /api/knowledge-base — create an article
knowledgeBaseRouter.post("/", async (req, res) => {

    try {

        const { title, content, category } = req.body || {};

        if (!title || !content) {

            res.status(400).json({
                success: false,
                message: "Title and content are required."
            });

            return;

        }

        const result = await pool.query(
            `INSERT INTO knowledge_base (title, content, category)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [title, content, category || null]
        );

        res.status(201).json({
            success: true,
            article: result.rows[0]
        });

    } catch (error) {

        console.error("CREATE KNOWLEDGE BASE ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not create article."
        });

    }

});


// DELETE /api/knowledge-base/:id
knowledgeBaseRouter.delete("/:id", async (req, res) => {

    try {

        const result = await pool.query(
            "DELETE FROM knowledge_base WHERE id = $1",
            [Number(req.params.id)]
        );

        if (result.rowCount === 0) {

            res.status(404).json({
                success: false,
                message: "Article not found."
            });

            return;

        }

        res.json({ success: true });

    } catch (error) {

        console.error("DELETE KNOWLEDGE BASE ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Could not delete article."
        });

    }

});
