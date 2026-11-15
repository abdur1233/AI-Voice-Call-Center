-- =========================================================
-- AI VOICE CALL CENTER — DATABASE SCHEMA
-- =========================================================
-- All CREATE statements use IF NOT EXISTS so this file can
-- be run safely every time the server starts, without ever
-- wiping or duplicating existing data.
-- =========================================================


-- ---------------------------------------------------------
-- AGENTS (human agents + admins who log in to the dashboard)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS agents (

    id              SERIAL PRIMARY KEY,

    name            TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,

    role            TEXT NOT NULL DEFAULT 'agent',
    -- 'agent' | 'admin'

    status          TEXT NOT NULL DEFAULT 'offline',
    -- 'online' | 'offline' | 'on_call' | 'away'

    created_at      TIMESTAMP NOT NULL DEFAULT NOW()

);


-- ---------------------------------------------------------
-- CUSTOMERS (callers)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (

    id                  SERIAL PRIMARY KEY,

    name                TEXT,
    phone               TEXT NOT NULL UNIQUE,
    email               TEXT,

    preferred_language  TEXT DEFAULT 'en',

    created_at          TIMESTAMP NOT NULL DEFAULT NOW()

);


-- ---------------------------------------------------------
-- CALLS
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS calls (

    id                  SERIAL PRIMARY KEY,

    customer_id         INTEGER REFERENCES customers(id),
    agent_id            INTEGER REFERENCES agents(id),

    direction           TEXT NOT NULL DEFAULT 'inbound',
    -- 'inbound' | 'outbound'

    handled_by          TEXT NOT NULL DEFAULT 'ai',
    -- 'ai' | 'human' | 'ai_then_human'

    status              TEXT NOT NULL DEFAULT 'ringing',
    -- 'ringing' | 'in_progress' | 'completed' |
    -- 'missed' | 'failed'

    language            TEXT DEFAULT 'en',

    telephony_call_sid  TEXT,
    -- external provider's call id (e.g. Twilio), set in
    -- Phase 2 — nullable until telephony is wired up

    started_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_at             TIMESTAMP,
    duration_seconds     INTEGER DEFAULT 0,

    created_at           TIMESTAMP NOT NULL DEFAULT NOW()

);

CREATE INDEX IF NOT EXISTS idx_calls_status
    ON calls(status);

CREATE INDEX IF NOT EXISTS idx_calls_customer
    ON calls(customer_id);


-- ---------------------------------------------------------
-- CALL TRANSCRIPTS (line-by-line, live or after the fact)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS call_transcripts (

    id              SERIAL PRIMARY KEY,

    call_id         INTEGER NOT NULL
                    REFERENCES calls(id)
                    ON DELETE CASCADE,

    speaker         TEXT NOT NULL,
    -- 'customer' | 'agent' | 'ai'

    original_text   TEXT NOT NULL,
    original_language TEXT DEFAULT 'en',

    translated_text TEXT,
    translated_language TEXT,

    sentiment       TEXT,
    -- 'positive' | 'neutral' | 'negative' — filled in
    -- later by the AI layer, nullable for now

    spoken_at       TIMESTAMP NOT NULL DEFAULT NOW()

);

CREATE INDEX IF NOT EXISTS idx_transcripts_call
    ON call_transcripts(call_id);


-- ---------------------------------------------------------
-- CALL SUMMARIES (one AI-generated summary per call)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS call_summaries (

    id                  SERIAL PRIMARY KEY,

    call_id             INTEGER NOT NULL UNIQUE
                        REFERENCES calls(id)
                        ON DELETE CASCADE,

    summary_text        TEXT,
    overall_sentiment    TEXT,
    key_points           TEXT,
    -- newline-separated bullet points, kept simple for now

    qa_score             INTEGER DEFAULT 85,
    csat_score           INTEGER DEFAULT 4,
    resolution_status    TEXT DEFAULT 'resolved',
    action_items         JSONB DEFAULT '[]',
    compliance_checklist JSONB DEFAULT '{}',
    sentiment_trajectory JSONB DEFAULT '[]',
    topics_detected      TEXT[] DEFAULT '{}',

    created_at           TIMESTAMP NOT NULL DEFAULT NOW()

);

-- Safe migrations for existing databases
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS qa_score INTEGER DEFAULT 85;
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS csat_score INTEGER DEFAULT 4;
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS resolution_status TEXT DEFAULT 'resolved';
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS action_items JSONB DEFAULT '[]';
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS compliance_checklist JSONB DEFAULT '{}';
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS sentiment_trajectory JSONB DEFAULT '[]';
ALTER TABLE call_summaries ADD COLUMN IF NOT EXISTS topics_detected TEXT[] DEFAULT '{}';


-- ---------------------------------------------------------
-- KNOWLEDGE BASE (what the AI agent can reference)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS knowledge_base (

    id          SERIAL PRIMARY KEY,

    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    category    TEXT,

    created_at  TIMESTAMP NOT NULL DEFAULT NOW()

);


-- ---------------------------------------------------------
-- PGVECTOR EXTENSION & VECTOR SIMILARITY FUNCTION
-- ---------------------------------------------------------
-- Attempts to load pgvector if available; fallback to high-performance
-- SQL cosine similarity for systems without pgvector binary installed.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
    -- Fallback message, table uses real[] with cosine_similarity function
    RAISE NOTICE 'pgvector extension not compiled in this PostgreSQL installation; using PostgreSQL real[] vector cosine similarity.';
END $$;

CREATE OR REPLACE FUNCTION cosine_similarity(a real[], b real[]) RETURNS real AS $$
DECLARE
    dot_product real := 0;
    norm_a real := 0;
    norm_b real := 0;
    i int;
    len int;
BEGIN
    IF a IS NULL OR b IS NULL THEN
        RETURN 0;
    END IF;
    len := LEAST(array_length(a, 1), array_length(b, 1));
    FOR i IN 1..len LOOP
        dot_product := dot_product + (a[i] * b[i]);
        norm_a := norm_a + (a[i] * a[i]);
        norm_b := norm_b + (b[i] * b[i]);
    END LOOP;
    IF norm_a <= 0 OR norm_b <= 0 THEN
        RETURN 0;
    END IF;
    RETURN dot_product / (sqrt(norm_a) * sqrt(norm_b));
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ---------------------------------------------------------
-- KNOWLEDGE BASE DOCUMENTS (PDF, Text, Policy, Manual, FAQ)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS documents (

    id              SERIAL PRIMARY KEY,

    title           TEXT NOT NULL,
    description     TEXT,
    category        TEXT DEFAULT 'General',
    -- 'Policies' | 'FAQ' | 'Billing' | 'Products' | 'Manuals' | 'Support' | 'General'

    language        TEXT DEFAULT 'en',
    tags            TEXT[] DEFAULT '{}',

    status          TEXT NOT NULL DEFAULT 'published',
    -- 'draft' | 'published' | 'archived'

    file_name       TEXT,
    file_type       TEXT DEFAULT 'article',
    -- 'pdf' | 'txt' | 'md' | 'faq' | 'article'

    file_size       INTEGER DEFAULT 0,
    raw_content     TEXT,

    created_by      INTEGER REFERENCES agents(id),

    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()

);

CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);


-- ---------------------------------------------------------
-- DOCUMENT CHUNKS (RAG Vector Chunks with Embeddings)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS document_chunks (

    id              SERIAL PRIMARY KEY,

    document_id     INTEGER NOT NULL
                    REFERENCES documents(id)
                    ON DELETE CASCADE,

    chunk_index     INTEGER NOT NULL,
    content         TEXT NOT NULL,
    token_count     INTEGER DEFAULT 0,
    metadata        JSONB DEFAULT '{}'::jsonb,

    -- Stores 1536 / 768 / 384 dimensional normalized vector
    embedding       real[],

    created_at      TIMESTAMP NOT NULL DEFAULT NOW()

);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON document_chunks(document_id);


-- ---------------------------------------------------------
-- HUMAN AGENT HANDOFF REQUESTS (Escalation Queue)
-- ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS handoff_requests (

    id                      SERIAL PRIMARY KEY,

    call_id                 INTEGER NOT NULL
                            REFERENCES calls(id)
                            ON DELETE CASCADE,

    customer_id             INTEGER
                            REFERENCES customers(id),

    reason                  TEXT NOT NULL,
    -- 'Customer requested human' | 'Repeated misunderstanding' |
    -- 'AI unresolved issue' | 'Negative / angry sentiment' |
    -- 'Payment dispute' | 'Account / security issue' | 'Refund escalation'

    priority                TEXT NOT NULL DEFAULT 'medium',
    -- 'low' | 'medium' | 'high' | 'urgent'

    status                  TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'assigned' | 'accepted' | 'rejected' |
    -- 'in_progress' | 'completed'

    assigned_agent_id       INTEGER
                            REFERENCES agents(id),

    waiting_time_seconds    INTEGER DEFAULT 0,

    sentiment               TEXT DEFAULT 'neutral',
    language                TEXT DEFAULT 'en',

    customer_name           TEXT,
    customer_phone          TEXT,
    call_duration_seconds   INTEGER DEFAULT 0,

    notes                   TEXT,

    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()

);

CREATE INDEX IF NOT EXISTS idx_handoff_status ON handoff_requests(status);
CREATE INDEX IF NOT EXISTS idx_handoff_call ON handoff_requests(call_id);
CREATE INDEX IF NOT EXISTS idx_handoff_created ON handoff_requests(created_at DESC);

