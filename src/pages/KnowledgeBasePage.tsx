import { useEffect, useState, type FormEvent, useRef } from "react";
import {
  AlertCircle,
  Archive,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Database,
  FileCheck,
  FileText,
  FileUp,
  Filter,
  HelpCircle,
  Info,
  Layers,
  Lock,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { api } from "../api";

export type DocumentRecord = {
  id: number;
  title: string;
  description: string | null;
  category: string;
  language: string;
  tags: string[];
  status: "draft" | "published" | "archived";
  file_name: string | null;
  file_type: string;
  file_size: number;
  raw_content: string | null;
  created_at: string;
  updated_at: string;
  chunk_count?: number;
};

export type ChunkRecord = {
  id: number;
  document_id: number;
  chunk_index: number;
  content: string;
  token_count: number;
  similarity?: number;
  document_title?: string;
  document_category?: string;
};

const CATEGORIES = [
  "Policies",
  "FAQ",
  "Billing",
  "Products",
  "Manuals",
  "Support",
  "General",
];

const RECOMMENDED_TEMPLATES = [
  {
    title: "Official 30-Day Money-Back Guarantee & Refund Policy",
    category: "Billing",
    description: "Company refund rules, return window, processing times, and dispute terms.",
    content: `All customers are entitled to a 100% full money-back guarantee within 30 days of purchase for any software license or subscription. 
Refunds are credited to the original payment method within 3 to 5 business days.
No refund requests are honored after 30 days unless there is a confirmed billing system duplicate charge.
To request a refund, contact billing support with your invoice number.`,
    tags: ["refund", "billing", "money-back", "guarantee"],
  },
  {
    title: "AI Voice Call Center Hours & SLA Escalation Policy",
    category: "Policies",
    description: "Operational hours, human specialist availability, and SLA rules.",
    content: `The automated AI Voice Call Specialist is available 24 hours a day, 7 days a week in English, Urdu, Hindi, and Arabic.
Human specialist agents are available Monday through Friday from 9:00 AM to 6:00 PM EST.
Calls that involve billing disputes, security issues, or repeated misunderstanding are automatically escalated to the human specialist queue.`,
    tags: ["hours", "sla", "agents", "support"],
  },
  {
    title: "Enterprise Custom Software & Cloud SLA Manual",
    category: "Products",
    description: "Product features, architecture, and enterprise post-deployment support.",
    content: `We build enterprise-grade AI voice systems, web portals, and PostgreSQL vector RAG architectures.
All enterprise contracts include a 99.9% uptime Service Level Agreement, automated daily backups, and end-to-end data encryption.
Support inquiries can be submitted via voice call or through the administrative portal.`,
    tags: ["enterprise", "software", "sla", "products"],
  },
];

export default function KnowledgeBasePage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Form states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [uploadMode, setUploadMode] = useState<"file" | "text">("file");
  const [docTitle, setDocTitle] = useState("");
  const [docDescription, setDocDescription] = useState("");
  const [docCategory, setDocCategory] = useState("General");
  const [docContent, setDocContent] = useState("");
  const [docTags, setDocTags] = useState("");
  const [docStatus, setDocStatus] = useState<"published" | "draft">("published");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Chunks Inspector Modal
  const [inspectDoc, setInspectDoc] = useState<DocumentRecord | null>(null);
  const [inspectChunks, setInspectChunks] = useState<ChunkRecord[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  // Semantic RAG Test Search Console
  const [ragTestQuery, setRagTestQuery] = useState("");
  const [ragSearchResults, setRagSearchResults] = useState<ChunkRecord[]>([]);
  const [ragSearching, setRagSearching] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function loadDocs() {
    setLoading(true);
    api<{ success: boolean; documents: DocumentRecord[] }>("/api/documents")
      .then((res) => setDocuments(res.documents))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }

  useEffect(loadDocs, []);

  // Handle Form Submission (File Upload or Text Creation)
  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setSubmitting(true);

    try {
      if (uploadMode === "file") {
        if (!uploadFile) {
          setFormError("Please select a file to upload (.pdf, .txt, .md).");
          setSubmitting(false);
          return;
        }

        const formData = new FormData();
        formData.append("file", uploadFile);
        formData.append("title", docTitle.trim() || uploadFile.name);
        formData.append("description", docDescription.trim());
        formData.append("category", docCategory);
        formData.append("tags", docTags);
        formData.append("status", docStatus);

        const token = localStorage.getItem("token") || "";
        const resp = await fetch("/api/documents/upload", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data.message || "Upload failed.");
        }
      } else {
        if (!docTitle.trim() || !docContent.trim()) {
          setFormError("Title and text content are required.");
          setSubmitting(false);
          return;
        }

        await api("/api/documents", {
          method: "POST",
          body: {
            title: docTitle.trim(),
            description: docDescription.trim(),
            category: docCategory,
            content: docContent.trim(),
            tags: docTags,
            status: docStatus,
          },
        });
      }

      // Reset form
      setShowCreateModal(false);
      setDocTitle("");
      setDocDescription("");
      setDocContent("");
      setDocTags("");
      setUploadFile(null);
      loadDocs();
    } catch (err: any) {
      setFormError(err?.message || "Error processing document.");
    } finally {
      setSubmitting(false);
    }
  }

  // Handle Add Template
  async function handleAddTemplate(tmpl: (typeof RECOMMENDED_TEMPLATES)[0]) {
    setSubmitting(true);
    try {
      await api("/api/documents", {
        method: "POST",
        body: {
          title: tmpl.title,
          description: tmpl.description,
          category: tmpl.category,
          content: tmpl.content,
          tags: tmpl.tags,
          status: "published",
        },
      });
      loadDocs();
    } catch (err: any) {
      alert(err?.message || "Failed to add template.");
    } finally {
      setSubmitting(false);
    }
  }

  // Handle Status Toggle
  async function handleToggleStatus(doc: DocumentRecord) {
    const nextStatus = doc.status === "published" ? "archived" : "published";
    try {
      await api(`/api/documents/${doc.id}`, {
        method: "PATCH",
        body: { status: nextStatus },
      });
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, status: nextStatus } : d))
      );
    } catch (err) {
      console.error(err);
    }
  }

  // Handle Delete
  async function handleDelete(id: number) {
    if (!confirm("Are you sure you want to delete this document and all its semantic vector chunks?")) return;
    try {
      await api(`/api/documents/${id}`, { method: "DELETE" });
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  // Handle Inspect Chunks
  async function handleInspect(doc: DocumentRecord) {
    setInspectDoc(doc);
    setLoadingChunks(true);
    try {
      const res = await api<{ success: boolean; chunks: ChunkRecord[] }>(
        `/api/documents/${doc.id}`
      );
      setInspectChunks(res.chunks || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingChunks(false);
    }
  }

  // Handle Semantic RAG Search Test
  async function handleRunRagTest(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!ragTestQuery.trim() || ragSearching) return;

    setRagSearching(true);
    try {
      const res = await api<{ success: boolean; chunks: ChunkRecord[] }>(
        "/api/documents/search",
        {
          method: "POST",
          body: { query: ragTestQuery.trim(), limit: 4 },
        }
      );
      setRagSearchResults(res.chunks || []);
    } catch (err) {
      console.error(err);
    } finally {
      setRagSearching(false);
    }
  }

  // Filtered documents
  const filteredDocuments = documents.filter((doc) => {
    const q = searchQuery.toLowerCase();
    const matchQuery =
      doc.title.toLowerCase().includes(q) ||
      (doc.description && doc.description.toLowerCase().includes(q)) ||
      doc.category.toLowerCase().includes(q) ||
      (doc.tags && doc.tags.some((t) => t.toLowerCase().includes(q)));

    const matchCategory =
      selectedCategory === "all" || doc.category.toLowerCase() === selectedCategory.toLowerCase();
    const matchStatus =
      selectedStatus === "all" || doc.status === selectedStatus;

    return matchQuery && matchCategory && matchStatus;
  });

  return (
    <>
      <div className="welcome-row">
        <div>
          <h2>PostgreSQL + pgvector Semantic RAG Knowledge Base</h2>
          <p>
            Document ingestion, text chunking, dense vector embeddings, and semantic grounding.
          </p>
        </div>
        <div className="welcome-action-buttons">
          <button className="secondary-button" onClick={loadDocs} title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button
            className="primary-button"
            onClick={() => {
              setShowCreateModal(true);
              setUploadMode("file");
            }}
          >
            <UploadCloud size={16} /> Upload Document (PDF/Text)
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              setShowCreateModal(true);
              setUploadMode("text");
            }}
          >
            <Plus size={16} /> New Text Article
          </button>
        </div>
      </div>

      {/* STRICT GROUNDING & DATA PROTECTION GUARANTEE BANNER */}
      <div className="dual-brain-banner rag-grounding-banner">
        <div className="banner-icon-col">
          <ShieldCheck size={28} className="sparkle-gold" />
        </div>
        <div className="banner-content-col">
          <strong>Semantic RAG Grounding &amp; Strict Anti-Hallucination Guardrail</strong>
          <p>
            Customer policy questions are retrieved from <strong>PostgreSQL vector embeddings</strong> with semantic similarity ranking. 
            The AI is strictly <strong>grounded in official documentation</strong> and forbidden from inventing policies.
            If relevant company information is not found, the AI politely offers to transfer to a human specialist.
            <strong> Customer-facing responses never expose internal prompts, API keys, database credentials, or admin metadata.</strong>
          </p>
        </div>
      </div>

      {/* RAG PIPELINE DIAGRAM */}
      <div className="rag-pipeline-card">
        <div className="pipeline-header">
          <Database size={16} />
          <span>Active Architecture: Document Ingestion &rarr; Chunking &rarr; Embeddings &rarr; PostgreSQL pgvector &rarr; Semantic Retrieval &rarr; LLM Grounding</span>
        </div>
      </div>

      {/* SEARCH AND FILTERS */}
      <div className="kb-controls-bar">
        <div className="kb-search-box">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search documents by title, description, category, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="kb-filters-group">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>

          <span className="kb-count-badge">
            {filteredDocuments.length} {filteredDocuments.length === 1 ? "document" : "documents"}
          </span>
        </div>
      </div>

      {/* TEMPLATE SUGGESTIONS IF EMPTY */}
      {documents.length === 0 && !loading && (
        <div className="template-suggestions-box">
          <div className="template-header">
            <Sparkles size={18} />
            <strong>Bootstrap Knowledge Base with 1-Click Grounding Templates:</strong>
          </div>
          <div className="template-cards-grid">
            {RECOMMENDED_TEMPLATES.map((tmpl, idx) => (
              <div key={idx} className="template-card">
                <span className="template-category">{tmpl.category}</span>
                <h4>{tmpl.title}</h4>
                <p>{tmpl.description}</p>
                <button
                  type="button"
                  className="secondary-button add-template-btn"
                  onClick={() => handleAddTemplate(tmpl)}
                  disabled={submitting}
                >
                  <Plus size={14} /> Ingest into pgvector
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* DOCUMENT GRID */}
      <div className="kb-documents-grid">
        {filteredDocuments.length === 0 && !loading && documents.length > 0 && (
          <section className="panel empty-panel">
            <Search size={28} />
            <p>No documents matched your filters.</p>
          </section>
        )}

        {filteredDocuments.map((doc) => (
          <section key={doc.id} className="panel doc-card">
            <div className="doc-card-header">
              <div className="doc-title-wrap">
                <div className={`doc-type-icon ${doc.file_type}`}>
                  {doc.file_type === "pdf" ? <FileText size={18} /> : <BookOpen size={18} />}
                </div>
                <div>
                  <strong>{doc.title}</strong>
                  <span className="doc-category-tag">{doc.category}</span>
                </div>
              </div>

              <div className="doc-status-actions">
                <span className={`status-pill ${doc.status}`}>{doc.status}</span>
                <button
                  className="row-action danger-hover"
                  onClick={() => handleDelete(doc.id)}
                  title="Delete Document"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {doc.description && <p className="doc-desc">{doc.description}</p>}

            <div className="doc-meta-footer">
              <div className="doc-meta-item">
                <Layers size={13} />
                <span>{doc.chunk_count || 0} Vector Chunks</span>
              </div>
              <div className="doc-meta-item">
                <Database size={13} />
                <span>PostgreSQL / pgvector</span>
              </div>
              {doc.file_name && (
                <div className="doc-meta-item">
                  <FileCheck size={13} />
                  <span>{doc.file_name}</span>
                </div>
              )}
            </div>

            <div className="doc-actions-row">
              <button
                type="button"
                className="secondary-button chunk-inspect-btn"
                onClick={() => handleInspect(doc)}
              >
                <Layers size={13} /> View Chunks &amp; Vectors
              </button>
              <button
                type="button"
                className={`secondary-button status-toggle-btn ${doc.status}`}
                onClick={() => handleToggleStatus(doc)}
              >
                {doc.status === "published" ? "Archive" : "Publish"}
              </button>
            </div>
          </section>
        ))}
      </div>

      {/* SEMANTIC RAG SIMILARITY TEST CONSOLE */}
      <section className="panel rag-tester-panel">
        <div className="panel-header">
          <div>
            <h3>
              <BrainCircuit size={18} /> Live Semantic RAG Similarity Tester
            </h3>
            <p>
              Test any customer question to see how PostgreSQL vector similarity retrieves
              grounded chunks with cosine similarity match scores.
            </p>
          </div>
          <span className="rag-live-pill">PostgreSQL Vector Match Active</span>
        </div>

        <form onSubmit={handleRunRagTest} className="rag-tester-form">
          <input
            type="text"
            placeholder="e.g. 'Can I get a full refund?', 'What are your support hours?', 'Do you build web apps?'"
            value={ragTestQuery}
            onChange={(e) => setRagTestQuery(e.target.value)}
          />
          <button
            type="submit"
            className="primary-button"
            disabled={!ragTestQuery.trim() || ragSearching}
          >
            {ragSearching ? "Searching..." : <><Search size={15} /> Run Semantic Search</>}
          </button>
        </form>

        {ragSearchResults.length > 0 && (
          <div className="rag-results-wrap">
            <h4>Retrieved Knowledge Chunks ({ragSearchResults.length} Chunks Matched):</h4>
            <div className="rag-chunks-list">
              {ragSearchResults.map((chunk, idx) => (
                <div key={idx} className="rag-chunk-item">
                  <div className="chunk-item-top">
                    <span className="chunk-doc-title">
                      <strong>Source:</strong> {chunk.document_title} ({chunk.document_category})
                    </span>
                    <span className="similarity-match-pill">
                      {Math.round((chunk.similarity || 0) * 100)}% Cosine Match
                    </span>
                  </div>
                  <p className="chunk-content-text">"{chunk.content}"</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* CREATE / UPLOAD MODAL */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content doc-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>
                  {uploadMode === "file" ? "Upload & Ingest Document (PDF/Text)" : "Add Custom Text Article"}
                </h3>
                <p>Documents will be automatically cleaned, chunked, and embedded into PostgreSQL.</p>
              </div>
              <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="upload-mode-toggle">
              <button
                type="button"
                className={`mode-btn ${uploadMode === "file" ? "active" : ""}`}
                onClick={() => setUploadMode("file")}
              >
                <FileUp size={15} /> Upload File (.pdf, .txt, .md)
              </button>
              <button
                type="button"
                className={`mode-btn ${uploadMode === "text" ? "active" : ""}`}
                onClick={() => setUploadMode("text")}
              >
                <FileText size={15} /> Write Text Article
              </button>
            </div>

            <form onSubmit={handleCreate} className="doc-create-form">
              {formError && (
                <div className="error-banner">
                  <AlertCircle size={15} /> {formError}
                </div>
              )}

              {uploadMode === "file" && (
                <div
                  className="file-dropzone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <UploadCloud size={36} className="dropzone-icon" />
                  <strong>
                    {uploadFile ? uploadFile.name : "Click to select a document file"}
                  </strong>
                  <span>Supports PDF (.pdf), Plain Text (.txt), Markdown (.md)</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.md,.json"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadFile(e.target.files[0]);
                        if (!docTitle) setDocTitle(e.target.files[0].name.replace(/\.[^/.]+$/, ""));
                      }
                    }}
                  />
                </div>
              )}

              <div className="form-group">
                <label>Document Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Return and Refund Policy, SLA Terms, Pricing Guide"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  required
                />
              </div>

              <div className="two-col-inputs">
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value)}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>Status</label>
                  <select
                    value={docStatus}
                    onChange={(e: any) => setDocStatus(e.target.value)}
                  >
                    <option value="published">Published (Grounding Active)</option>
                    <option value="draft">Draft (Excluded from AI)</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Description (Optional)</label>
                <input
                  type="text"
                  placeholder="Brief summary of document purpose..."
                  value={docDescription}
                  onChange={(e) => setDocDescription(e.target.value)}
                />
              </div>

              {uploadMode === "text" && (
                <div className="form-group">
                  <label>Content / Policy Text *</label>
                  <textarea
                    rows={6}
                    placeholder="Write company policy, instructions, or FAQs here..."
                    value={docContent}
                    onChange={(e) => setDocContent(e.target.value)}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label>Tags (Comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. refund, billing, warranty, policy"
                  value={docTags}
                  onChange={(e) => setDocTags(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submitting}
                >
                  {submitting ? "Processing & Embedding..." : "Process & Save to PostgreSQL"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHUNKS INSPECTOR MODAL */}
      {inspectDoc && (
        <div className="modal-overlay" onClick={() => setInspectDoc(null)}>
          <div className="modal-content chunks-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Semantic Vector Chunks: {inspectDoc.title}</h3>
                <p>
                  Category: {inspectDoc.category} • Total Chunks: {inspectChunks.length} • Stored in PostgreSQL with Embeddings
                </p>
              </div>
              <button className="modal-close-btn" onClick={() => setInspectDoc(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="chunks-modal-body">
              {loadingChunks ? (
                <p>Loading chunks from database...</p>
              ) : inspectChunks.length === 0 ? (
                <p>No chunks generated for this document.</p>
              ) : (
                inspectChunks.map((chunk) => (
                  <div key={chunk.id} className="chunk-preview-box">
                    <div className="chunk-preview-top">
                      <span className="chunk-index-tag">Chunk #{chunk.chunk_index + 1}</span>
                      <span className="token-count-tag">~{chunk.token_count} tokens</span>
                    </div>
                    <p className="chunk-text">{chunk.content}</p>
                  </div>
                ))
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setInspectDoc(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
