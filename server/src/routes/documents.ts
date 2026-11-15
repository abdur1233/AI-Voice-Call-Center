import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth.js";
import {
  createDocumentWithChunks,
  listDocuments,
  getDocumentById,
  updateDocument,
  deleteDocument,
  searchSemanticChunks,
  extractTextFromFile,
  DocumentCategory,
  DocumentStatus,
} from "../services/ragService.js";

export const documentsRouter = Router();

// Configure Multer for file uploads (max 15MB, PDF / TXT / MD / JSON)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

documentsRouter.use(requireAuth);

// ---------------------------------------------------------
// GET /api/documents — list all documents
// ---------------------------------------------------------
documentsRouter.get("/", async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const docs = await listDocuments(status);
    res.json({ success: true, documents: docs });
  } catch (error: any) {
    console.error("LIST DOCUMENTS ERROR:", error);
    res.status(500).json({ success: false, message: "Could not load documents." });
  }
});

// ---------------------------------------------------------
// GET /api/documents/:id — get document with chunks preview
// ---------------------------------------------------------
documentsRouter.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await getDocumentById(id);
    if (!result) {
      res.status(404).json({ success: false, message: "Document not found." });
      return;
    }
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("GET DOCUMENT ERROR:", error);
    res.status(500).json({ success: false, message: "Could not load document." });
  }
});

// ---------------------------------------------------------
// POST /api/documents/upload — upload file (PDF, TXT, MD) & ingest
// ---------------------------------------------------------
documentsRouter.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, message: "Please provide a file to upload." });
      return;
    }

    const {
      title,
      description,
      category = "General",
      language = "en",
      tags,
      status = "published",
    } = req.body || {};

    const fileName = file.originalname;
    const fileExt = fileName.split(".").pop()?.toLowerCase() || "txt";

    // Extract text from uploaded buffer
    const rawContent = await extractTextFromFile(file.buffer, fileExt);

    if (!rawContent || rawContent.trim().length < 20) {
      res.status(400).json({
        success: false,
        message: "Could not extract readable text from this file. Ensure the file contains text.",
      });
      return;
    }

    const parsedTags = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
      ? tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    const doc = await createDocumentWithChunks({
      title: title?.trim() || fileName,
      description: description?.trim() || null,
      category: category as DocumentCategory,
      language,
      tags: parsedTags,
      status: (status as DocumentStatus) || "published",
      fileName,
      fileType: fileExt,
      fileSize: file.size,
      rawContent,
      createdBy: req.agent?.agentId || null,
    });

    res.status(201).json({
      success: true,
      document: doc,
      message: `Document processed: extracted ${doc.chunk_count} semantic vector chunks.`,
    });
  } catch (error: any) {
    console.error("DOCUMENT UPLOAD ERROR:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to process document upload.",
    });
  }
});

// ---------------------------------------------------------
// POST /api/documents — create text article / FAQ directly
// ---------------------------------------------------------
documentsRouter.post("/", async (req, res) => {
  try {
    const {
      title,
      content,
      description,
      category = "General",
      language = "en",
      tags,
      status = "published",
    } = req.body || {};

    if (!title || !content) {
      res.status(400).json({
        success: false,
        message: "Title and content are required.",
      });
      return;
    }

    const parsedTags = Array.isArray(tags)
      ? tags
      : typeof tags === "string"
      ? tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    const doc = await createDocumentWithChunks({
      title: title.trim(),
      description: description?.trim() || null,
      category: category as DocumentCategory,
      language,
      tags: parsedTags,
      status: (status as DocumentStatus) || "published",
      fileType: "article",
      rawContent: content,
      createdBy: req.agent?.agentId || null,
    });

    res.status(201).json({
      success: true,
      document: doc,
    });
  } catch (error: any) {
    console.error("CREATE DOCUMENT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Could not create document.",
    });
  }
});

// ---------------------------------------------------------
// PATCH /api/documents/:id — update metadata / status
// ---------------------------------------------------------
documentsRouter.patch("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { title, description, category, status, tags } = req.body || {};

    const updated = await updateDocument(id, {
      title,
      description,
      category,
      status,
      tags,
    });

    if (!updated) {
      res.status(404).json({ success: false, message: "Document not found." });
      return;
    }

    res.json({ success: true, document: updated });
  } catch (error: any) {
    console.error("UPDATE DOCUMENT ERROR:", error);
    res.status(500).json({ success: false, message: "Could not update document." });
  }
});

// ---------------------------------------------------------
// DELETE /api/documents/:id — delete document
// ---------------------------------------------------------
documentsRouter.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const deleted = await deleteDocument(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Document not found." });
      return;
    }
    res.json({ success: true });
  } catch (error: any) {
    console.error("DELETE DOCUMENT ERROR:", error);
    res.status(500).json({ success: false, message: "Could not delete document." });
  }
});

// ---------------------------------------------------------
// POST /api/documents/search — semantic RAG similarity test
// ---------------------------------------------------------
documentsRouter.post("/search", async (req, res) => {
  try {
    const { query, category, limit = 4 } = req.body || {};
    if (!query || typeof query !== "string") {
      res.status(400).json({ success: false, message: "Query string is required." });
      return;
    }

    const chunks = await searchSemanticChunks(query, Number(limit) || 4, category || null);
    res.json({
      success: true,
      query,
      resultsCount: chunks.length,
      chunks,
    });
  } catch (error: any) {
    console.error("SEMANTIC SEARCH ERROR:", error);
    res.status(500).json({ success: false, message: "Semantic search failed." });
  }
});
