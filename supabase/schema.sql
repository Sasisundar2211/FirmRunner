-- =============================================================================
-- FirmRunner — Complete Database Schema
-- Paste the entire contents of this file into the Supabase SQL Editor and run.
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE / DROP IF EXISTS.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ENUM TYPES
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE public.subscription_plan AS ENUM ('starter', 'professional', 'enterprise');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.subscription_status AS ENUM ('active', 'trialing', 'past_due', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.client_status AS ENUM ('active', 'inactive', 'prospect');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.filing_type AS ENUM ('1040', '1120', '941', 'W-2', '1099-NEC', '940');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.deadline_status AS ENUM ('upcoming', 'due_soon', 'overdue', 'completed', 'extended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.document_status AS ENUM ('required', 'requested', 'received', 'approved');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.agent_type AS ENUM ('intake', 'document', 'deadline', 'billing', 'report');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.agent_log_status AS ENUM ('pending', 'approved', 'sent', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- ── firms ────────────────────────────────────────────────────────────────────
-- One row per accounting firm. This is the multi-tenant root.
-- Every other table references firm_id for tenant isolation.

CREATE TABLE IF NOT EXISTS public.firms (
    id                          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                        TEXT         NOT NULL,
    owner_email                 TEXT         NOT NULL,
    subscription_plan           public.subscription_plan    NOT NULL DEFAULT 'starter',
    subscription_status         public.subscription_status  NOT NULL DEFAULT 'trialing',
    stripe_customer_id          TEXT,
    stripe_subscription_id      TEXT,
    n8n_webhook_url             TEXT,                        -- webhook base URL for this firm's n8n instance
    engagement_letter_template  TEXT,                        -- custom template; NULL = AI generates from prompt
    engagement_letter_required  BOOLEAN      NOT NULL DEFAULT TRUE,
    settings                    JSONB        NOT NULL DEFAULT '{}',
    created_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.firms IS 'One row per accounting firm (tenant root).';
COMMENT ON COLUMN public.firms.n8n_webhook_url IS 'Base URL of the firm''s self-hosted n8n instance for workflow triggers.';
COMMENT ON COLUMN public.firms.engagement_letter_template IS 'Custom engagement letter template. If NULL, AI generates from default prompt.';
COMMENT ON COLUMN public.firms.engagement_letter_required IS 'When TRUE, agents will not email a client until engagement_letter_sent_at is set.';


-- ── firm_users ───────────────────────────────────────────────────────────────
-- Maps Supabase auth.users to firms. Supports multiple staff per firm.
-- Created automatically by the handle_new_user() trigger on signup.

CREATE TABLE IF NOT EXISTS public.firm_users (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id     UUID        NOT NULL REFERENCES public.firms(id)  ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
    role        TEXT        NOT NULL DEFAULT 'owner'
                            CHECK (role IN ('owner', 'staff')),
    email       TEXT        NOT NULL,
    full_name   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (firm_id, user_id)
);

COMMENT ON TABLE public.firm_users IS 'Maps auth users to firms. One owner per firm; optional additional staff.';


-- ── clients ──────────────────────────────────────────────────────────────────
-- The firm's client base. Populated via Tally intake form → n8n → Intake Agent.
-- IMPORTANT: engagement_letter_sent_at must be set before any agent can email a client.

CREATE TABLE IF NOT EXISTS public.clients (
    id                          UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id                     UUID                  NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    full_name                   TEXT                  NOT NULL,
    email                       TEXT                  NOT NULL,
    phone                       TEXT,
    entity_type                 TEXT                  NOT NULL DEFAULT 'individual'
                                                      CHECK (entity_type IN (
                                                          'individual', 'partnership', 'corporation',
                                                          's_corp', 'llc', 'nonprofit'
                                                      )),
    status                      public.client_status  NOT NULL DEFAULT 'prospect',
    filing_types                public.filing_type[]  NOT NULL DEFAULT '{}',
    assigned_staff_email        TEXT,                  -- staff member responsible for this client
    intake_completed_at         TIMESTAMPTZ,
    engagement_letter_status    TEXT                  NOT NULL DEFAULT 'not_sent'
                                                      CHECK (engagement_letter_status IN ('not_sent','sent','signed','declined')),
    engagement_letter_sent_at   TIMESTAMPTZ,           -- REQUIRED before any agent email
    engagement_letter_signed_at TIMESTAMPTZ,
    tally_submission_id         TEXT,                  -- dedup: prevent duplicate intake processing
    notes                       TEXT,
    deleted_at                  TIMESTAMPTZ,           -- soft delete; excluded from all RLS SELECT policies
    created_at                  TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.clients IS 'Accounting firm client records. Populated via Tally intake webhook.';
COMMENT ON COLUMN public.clients.engagement_letter_sent_at IS 'Legal gate: no agent may email this client until this timestamp is set.';
COMMENT ON COLUMN public.clients.engagement_letter_status IS 'Tracks engagement letter lifecycle: not_sent → sent → signed | declined.';
COMMENT ON COLUMN public.clients.filing_types IS 'Array of tax forms this client files. Used to seed deadlines and drive agent actions.';
COMMENT ON COLUMN public.clients.deleted_at IS 'Soft delete. Non-NULL rows are excluded from all RLS SELECT queries.';


-- ── deadlines ────────────────────────────────────────────────────────────────
-- Tax filing deadlines with boolean columns that track which alert emails have been sent.
-- The Deadline Agent checks alert_sent_* flags to prevent duplicate alerts.

CREATE TABLE IF NOT EXISTS public.deadlines (
    id              UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id         UUID                    NOT NULL REFERENCES public.firms(id)    ON DELETE CASCADE,
    client_id       UUID                    NOT NULL REFERENCES public.clients(id)  ON DELETE CASCADE,
    filing_type     public.filing_type      NOT NULL,
    due_date        DATE                    NOT NULL,
    status          public.deadline_status  NOT NULL DEFAULT 'upcoming',
    extension_date  DATE,
    assigned_to     TEXT,                   -- staff member email or name
    -- Alert sent flags — each becomes TRUE after the email is queued
    alert_sent_30d  BOOLEAN     NOT NULL DEFAULT FALSE,
    alert_sent_14d  BOOLEAN     NOT NULL DEFAULT FALSE,
    alert_sent_7d   BOOLEAN     NOT NULL DEFAULT FALSE,
    alert_sent_3d   BOOLEAN     NOT NULL DEFAULT FALSE,
    alert_sent_1d   BOOLEAN     NOT NULL DEFAULT FALSE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.deadlines IS 'Tax filing deadlines per client. Alert flags prevent duplicate reminder emails.';
COMMENT ON COLUMN public.deadlines.alert_sent_30d IS 'Set to TRUE when the 30-day alert email is queued. Prevents re-sending.';


-- ── documents ────────────────────────────────────────────────────────────────
-- Tracks required vs received client documents. The Document Agent queries
-- status IN ('required', 'requested') and reminder_sent_at to find outstanding items.

CREATE TABLE IF NOT EXISTS public.documents (
    id                UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id           UUID                    NOT NULL REFERENCES public.firms(id)    ON DELETE CASCADE,
    client_id         UUID                    NOT NULL REFERENCES public.clients(id)  ON DELETE CASCADE,
    deadline_id       UUID                    REFERENCES public.deadlines(id)         ON DELETE SET NULL,
    name              TEXT                    NOT NULL,
    description       TEXT,
    status            public.document_status  NOT NULL DEFAULT 'required',
    required_by       DATE,
    received_at       TIMESTAMPTZ,
    storage_path      TEXT,                   -- Supabase Storage object path after upload
    reminder_sent_at  TIMESTAMPTZ,
    created_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.documents IS 'Required documents per client/deadline. Document Agent sends reminders when status is required/requested.';


-- ── invoices ─────────────────────────────────────────────────────────────────
-- Billing records. stripe_invoice_id links to a real Stripe invoice.
-- The Billing Agent queries status IN ('sent', 'overdue') for reminder sequences.

CREATE TABLE IF NOT EXISTS public.invoices (
    id                  UUID                  PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id             UUID                  NOT NULL REFERENCES public.firms(id)    ON DELETE CASCADE,
    client_id           UUID                  NOT NULL REFERENCES public.clients(id)  ON DELETE CASCADE,
    stripe_invoice_id   TEXT                  UNIQUE,
    amount_cents        INTEGER               NOT NULL CHECK (amount_cents >= 0),
    currency            TEXT                  NOT NULL DEFAULT 'usd',
    status              public.invoice_status NOT NULL DEFAULT 'draft',
    due_date            DATE                  NOT NULL,
    paid_at             TIMESTAMPTZ,
    reminder_sent_at    TIMESTAMPTZ,
    description         TEXT,
    created_at          TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ           NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.invoices IS 'Invoice records. Amount stored in cents. Stripe webhook updates status.';


-- ── agent_logs ───────────────────────────────────────────────────────────────
-- Every AI-generated email is written here with status='pending'.
-- Firm owner reviews and approves/rejects in the dashboard before anything sends.
-- This is the central approval queue for all 5 agents.

CREATE TABLE IF NOT EXISTS public.agent_logs (
    id              UUID                    PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id         UUID                    NOT NULL REFERENCES public.firms(id)      ON DELETE CASCADE,
    client_id       UUID                    REFERENCES public.clients(id)             ON DELETE SET NULL,
    agent_type      public.agent_type       NOT NULL,
    status          public.agent_log_status NOT NULL DEFAULT 'pending',
    subject         TEXT                    NOT NULL,
    body            TEXT                    NOT NULL,
    ai_provider     TEXT,                   -- 'gemini' | 'groq' | 'claude'
    ai_latency_ms   INTEGER,
    approved_by     UUID                    REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at     TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    error           TEXT,
    metadata        JSONB                   NOT NULL DEFAULT '{}',
    next_run_at     TIMESTAMPTZ,            -- when this agent type is next scheduled to run
    cron_schedule   TEXT,                   -- human-readable schedule, e.g. "Daily at 9:00 AM"
    created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.agent_logs IS 'All AI-generated emails queued for approval. Nothing sends without status=approved.';
COMMENT ON COLUMN public.agent_logs.metadata IS 'Agent-specific context: client email, invoice_id, filing_type, etc.';


-- ── queued_emails ─────────────────────────────────────────────────────────────
-- Outbound email approval queue. Complements agent_logs: agent_logs tracks AI
-- generation; queued_emails tracks the outbound email approval workflow.
-- Firm owner approves/rejects before Resend sends.

CREATE TABLE IF NOT EXISTS public.queued_emails (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id      UUID        NOT NULL REFERENCES public.firms(id)      ON DELETE CASCADE,
    client_id    UUID        REFERENCES public.clients(id)             ON DELETE SET NULL,
    agent_type   TEXT        NOT NULL,
    to_email     TEXT        NOT NULL,
    subject      TEXT        NOT NULL,
    html_body    TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'approved', 'rejected', 'sent')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_at  TIMESTAMPTZ,
    reviewed_by  UUID        REFERENCES public.firm_users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.queued_emails IS 'Outbound email approval queue. Firm owner approves/rejects before Resend sends.';


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

-- firm_users (auth lookup — called on every page load via middleware)
CREATE INDEX IF NOT EXISTS idx_firm_users_user_id  ON public.firm_users(user_id);
CREATE INDEX IF NOT EXISTS idx_firm_users_firm_id  ON public.firm_users(firm_id);

-- clients
CREATE INDEX IF NOT EXISTS idx_clients_firm_id     ON public.clients(firm_id);
CREATE INDEX IF NOT EXISTS idx_clients_status      ON public.clients(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_clients_email       ON public.clients(firm_id, email);

-- deadlines (partial: only active deadlines need fast lookup)
CREATE INDEX IF NOT EXISTS idx_deadlines_firm_id   ON public.deadlines(firm_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_client_id ON public.deadlines(client_id);
CREATE INDEX IF NOT EXISTS idx_deadlines_due_date  ON public.deadlines(firm_id, due_date)
    WHERE status NOT IN ('completed', 'extended');

-- documents
CREATE INDEX IF NOT EXISTS idx_documents_firm_id   ON public.documents(firm_id);
CREATE INDEX IF NOT EXISTS idx_documents_client_id ON public.documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_status    ON public.documents(firm_id, status);

-- invoices
CREATE INDEX IF NOT EXISTS idx_invoices_firm_id    ON public.invoices(firm_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id  ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON public.invoices(firm_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe     ON public.invoices(stripe_invoice_id)
    WHERE stripe_invoice_id IS NOT NULL;

-- agent_logs (partial: pending queue is the hot path)
CREATE INDEX IF NOT EXISTS idx_agent_logs_firm_id   ON public.agent_logs(firm_id);
CREATE INDEX IF NOT EXISTS idx_agent_logs_client_id ON public.agent_logs(client_id)
    WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_logs_pending   ON public.agent_logs(firm_id, created_at DESC)
    WHERE status = 'pending';

-- queued_emails (partial: only pending rows need fast lookup)
CREATE INDEX IF NOT EXISTS idx_queued_emails_firm_pending
    ON public.queued_emails(firm_id, created_at DESC)
    WHERE status = 'pending';


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- ── set_updated_at ───────────────────────────────────────────────────────────
-- Trigger function: auto-updates the updated_at column on every UPDATE.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


-- ── current_firm_id ──────────────────────────────────────────────────────────
-- Returns the firm_id for the currently authenticated user.
-- STABLE + SECURITY DEFINER = result is cached per statement and bypasses RLS
-- on the firm_users lookup, preventing infinite recursion.

CREATE OR REPLACE FUNCTION public.current_firm_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT firm_id
    FROM   public.firm_users
    WHERE  user_id = auth.uid()
    LIMIT  1;
$$;


-- ── handle_new_user ──────────────────────────────────────────────────────────
-- Fires after INSERT on auth.users (signup).
-- Creates the firm record and owner firm_user automatically.
-- Reads firm_name from raw_user_meta_data set by SignupForm.tsx.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_firm_id   UUID;
    v_firm_name TEXT;
BEGIN
    v_firm_name := COALESCE(
        NULLIF(TRIM(NEW.raw_user_meta_data->>'firm_name'), ''),
        SPLIT_PART(NEW.email, '@', 1) || '''s Firm'
    );

    INSERT INTO public.firms (name, owner_email)
    VALUES (v_firm_name, NEW.email)
    RETURNING id INTO v_firm_id;

    INSERT INTO public.firm_users (firm_id, user_id, role, email, full_name)
    VALUES (
        v_firm_id,
        NEW.id,
        'owner',
        NEW.email,
        NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', '')), '')
    );

    RETURN NEW;
END;
$$;


-- ── create_default_deadlines ─────────────────────────────────────────────────
-- Seeds deadline rows based on the client's filing_types array.
-- Call this from the Intake Agent after creating a client:
--   SELECT public.create_default_deadlines(firm_id, client_id);
-- Skips past deadlines and uses ON CONFLICT DO NOTHING for idempotency.

CREATE OR REPLACE FUNCTION public.create_default_deadlines(
    p_firm_id   UUID,
    p_client_id UUID,
    p_year      INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT
)
RETURNS INT                         -- returns count of deadlines created
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_filing  public.filing_type;
    v_due     DATE;
    v_created INT := 0;
BEGIN
    FOR v_filing IN
        SELECT UNNEST(filing_types) FROM public.clients WHERE id = p_client_id
    LOOP
        v_due := CASE v_filing
            WHEN '1040'     THEN MAKE_DATE(p_year, 4,  15)
            WHEN '1120'     THEN MAKE_DATE(p_year, 4,  15)
            WHEN '941'      THEN MAKE_DATE(p_year, 4,  30)  -- Q1; repeat for Q2/Q3/Q4 if needed
            WHEN 'W-2'      THEN MAKE_DATE(p_year, 1,  31)
            WHEN '1099-NEC' THEN MAKE_DATE(p_year, 1,  31)
            WHEN '940'      THEN MAKE_DATE(p_year, 1,  31)
            ELSE NULL
        END;

        IF v_due IS NOT NULL AND v_due >= CURRENT_DATE THEN
            INSERT INTO public.deadlines (firm_id, client_id, filing_type, due_date, status)
            VALUES (p_firm_id, p_client_id, v_filing, v_due, 'upcoming')
            ON CONFLICT DO NOTHING;
            v_created := v_created + 1;
        END IF;
    END LOOP;

    RETURN v_created;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TRIGGERS
-- ─────────────────────────────────────────────────────────────────────────────

-- updated_at triggers on all mutable tables
DROP TRIGGER IF EXISTS set_updated_at ON public.firms;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.firms
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.clients;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.deadlines;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.deadlines
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.documents;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.invoices;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.agent_logs;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.agent_logs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create firm + firm_user on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.firms         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deadlines     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queued_emails ENABLE ROW LEVEL SECURITY;

-- ── firms ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "firms: read own"   ON public.firms;
DROP POLICY IF EXISTS "firms: update own" ON public.firms;

CREATE POLICY "firms: read own"
    ON public.firms FOR SELECT
    USING (id = public.current_firm_id());

CREATE POLICY "firms: update own"
    ON public.firms FOR UPDATE
    USING (id = public.current_firm_id());

-- ── firm_users ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "firm_users: read own firm"   ON public.firm_users;
DROP POLICY IF EXISTS "firm_users: insert own firm" ON public.firm_users;
DROP POLICY IF EXISTS "firm_users: delete own firm" ON public.firm_users;

CREATE POLICY "firm_users: read own firm"
    ON public.firm_users FOR SELECT
    USING (firm_id = public.current_firm_id());

CREATE POLICY "firm_users: insert own firm"
    ON public.firm_users FOR INSERT
    WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "firm_users: delete own firm"
    ON public.firm_users FOR DELETE
    USING (firm_id = public.current_firm_id());

-- ── clients ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clients: read own firm"   ON public.clients;
DROP POLICY IF EXISTS "clients: insert own firm" ON public.clients;
DROP POLICY IF EXISTS "clients: update own firm" ON public.clients;
DROP POLICY IF EXISTS "clients: delete own firm" ON public.clients;

CREATE POLICY "clients: read own firm"
    ON public.clients FOR SELECT
    USING (firm_id = public.current_firm_id() AND deleted_at IS NULL);

CREATE POLICY "clients: insert own firm"
    ON public.clients FOR INSERT
    WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "clients: update own firm"
    ON public.clients FOR UPDATE
    USING (firm_id = public.current_firm_id());

CREATE POLICY "clients: delete own firm"
    ON public.clients FOR DELETE
    USING (firm_id = public.current_firm_id());

-- ── deadlines ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "deadlines: read own firm"   ON public.deadlines;
DROP POLICY IF EXISTS "deadlines: insert own firm" ON public.deadlines;
DROP POLICY IF EXISTS "deadlines: update own firm" ON public.deadlines;
DROP POLICY IF EXISTS "deadlines: delete own firm" ON public.deadlines;

CREATE POLICY "deadlines: read own firm"
    ON public.deadlines FOR SELECT
    USING (firm_id = public.current_firm_id());

CREATE POLICY "deadlines: insert own firm"
    ON public.deadlines FOR INSERT
    WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "deadlines: update own firm"
    ON public.deadlines FOR UPDATE
    USING (firm_id = public.current_firm_id());

CREATE POLICY "deadlines: delete own firm"
    ON public.deadlines FOR DELETE
    USING (firm_id = public.current_firm_id());

-- ── documents ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "documents: read own firm"   ON public.documents;
DROP POLICY IF EXISTS "documents: insert own firm" ON public.documents;
DROP POLICY IF EXISTS "documents: update own firm" ON public.documents;
DROP POLICY IF EXISTS "documents: delete own firm" ON public.documents;

CREATE POLICY "documents: read own firm"
    ON public.documents FOR SELECT
    USING (firm_id = public.current_firm_id());

CREATE POLICY "documents: insert own firm"
    ON public.documents FOR INSERT
    WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "documents: update own firm"
    ON public.documents FOR UPDATE
    USING (firm_id = public.current_firm_id());

CREATE POLICY "documents: delete own firm"
    ON public.documents FOR DELETE
    USING (firm_id = public.current_firm_id());

-- ── invoices ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invoices: read own firm"   ON public.invoices;
DROP POLICY IF EXISTS "invoices: insert own firm" ON public.invoices;
DROP POLICY IF EXISTS "invoices: update own firm" ON public.invoices;
DROP POLICY IF EXISTS "invoices: delete own firm" ON public.invoices;

CREATE POLICY "invoices: read own firm"
    ON public.invoices FOR SELECT
    USING (firm_id = public.current_firm_id());

CREATE POLICY "invoices: insert own firm"
    ON public.invoices FOR INSERT
    WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "invoices: update own firm"
    ON public.invoices FOR UPDATE
    USING (firm_id = public.current_firm_id());

CREATE POLICY "invoices: delete own firm"
    ON public.invoices FOR DELETE
    USING (firm_id = public.current_firm_id());

-- ── agent_logs ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "agent_logs: read own firm"   ON public.agent_logs;
DROP POLICY IF EXISTS "agent_logs: insert own firm" ON public.agent_logs;
DROP POLICY IF EXISTS "agent_logs: update own firm" ON public.agent_logs;
DROP POLICY IF EXISTS "agent_logs: delete own firm" ON public.agent_logs;

CREATE POLICY "agent_logs: read own firm"
    ON public.agent_logs FOR SELECT
    USING (firm_id = public.current_firm_id());

CREATE POLICY "agent_logs: insert own firm"
    ON public.agent_logs FOR INSERT
    WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "agent_logs: update own firm"
    ON public.agent_logs FOR UPDATE
    USING (firm_id = public.current_firm_id());

CREATE POLICY "agent_logs: delete own firm"
    ON public.agent_logs FOR DELETE
    USING (firm_id = public.current_firm_id());

-- ── queued_emails ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "queued_emails: read own firm"   ON public.queued_emails;
DROP POLICY IF EXISTS "queued_emails: insert own firm" ON public.queued_emails;
DROP POLICY IF EXISTS "queued_emails: update own firm" ON public.queued_emails;
DROP POLICY IF EXISTS "queued_emails: delete own firm" ON public.queued_emails;

CREATE POLICY "queued_emails: read own firm"
    ON public.queued_emails FOR SELECT
    USING (firm_id = public.current_firm_id());

CREATE POLICY "queued_emails: insert own firm"
    ON public.queued_emails FOR INSERT
    WITH CHECK (firm_id = public.current_firm_id());

CREATE POLICY "queued_emails: update own firm"
    ON public.queued_emails FOR UPDATE
    USING (firm_id = public.current_firm_id());

CREATE POLICY "queued_emails: delete own firm"
    ON public.queued_emails FOR DELETE
    USING (firm_id = public.current_firm_id());


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

-- dashboard_stats: per-firm aggregate used by the dashboard home page.
-- Queried as: supabase.from('dashboard_stats').select('*').eq('firm_id', id).single()
-- Note: RLS on the underlying tables already scopes data — the view itself
-- does not need a separate RLS policy.

CREATE OR REPLACE VIEW public.dashboard_stats
WITH (security_invoker = true)       -- run as the calling user, so RLS on base tables applies
AS
SELECT
    f.id                                                                        AS firm_id,

    -- Clients
    COUNT(DISTINCT c.id)                                                        AS total_clients,
    COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active')                     AS active_clients,

    -- Deadlines
    COUNT(DISTINCT d.id) FILTER (
        WHERE d.status NOT IN ('completed', 'extended')
          AND d.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    )                                                                            AS upcoming_deadlines_7d,
    COUNT(DISTINCT d.id) FILTER (
        WHERE d.status NOT IN ('completed', 'extended')
          AND d.due_date < CURRENT_DATE
    )                                                                            AS overdue_deadlines,

    -- Documents
    COUNT(DISTINCT doc.id) FILTER (
        WHERE doc.status IN ('required', 'requested')
    )                                                                            AS pending_documents,

    -- Invoices
    COUNT(DISTINCT i.id) FILTER (
        WHERE i.status IN ('sent', 'overdue')
    )                                                                            AS unpaid_invoices,

    -- Agent approval queue
    COUNT(DISTINCT al.id) FILTER (WHERE al.status = 'pending')                  AS pending_agent_approvals,
    COUNT(DISTINCT al.id) FILTER (
        WHERE al.status = 'sent'
          AND al.sent_at >= NOW() - INTERVAL '30 days'
    )                                                                            AS agents_sent_30d

FROM       public.firms      f
LEFT JOIN  public.clients    c   ON c.firm_id   = f.id
LEFT JOIN  public.deadlines  d   ON d.firm_id   = f.id
LEFT JOIN  public.documents  doc ON doc.firm_id  = f.id
LEFT JOIN  public.invoices   i   ON i.firm_id   = f.id
LEFT JOIN  public.agent_logs al  ON al.firm_id  = f.id
GROUP BY   f.id;

COMMENT ON VIEW public.dashboard_stats IS
'Per-firm aggregated stats for the dashboard. Uses security_invoker so base-table RLS applies.';


-- agent_status: latest run info per agent per firm, shown on the Agents dashboard page.
-- Queried as: supabase.from('agent_status').select('*').eq('firm_id', id)

CREATE OR REPLACE VIEW public.agent_status
WITH (security_invoker = true)
AS
SELECT
    agent_type,
    firm_id,
    MAX(created_at)    AS last_run_at,
    MAX(next_run_at)   AS next_run_at,
    MAX(cron_schedule) AS cron_schedule,
    COUNT(*) FILTER (
        WHERE status = 'failed'
          AND created_at > NOW() - INTERVAL '24 hours'
    )                  AS error_count_24h
FROM public.agent_logs
GROUP BY agent_type, firm_id;

COMMENT ON VIEW public.agent_status IS
    'Per-agent, per-firm scheduling and health summary. Used on the Agents dashboard page.';


-- ─────────────────────────────────────────────────────────────────────────────
-- DONE
-- Expected output: no errors, all statements succeed.
-- After running, verify in Supabase:
--   1. Table Editor: 8 tables exist (firms, firm_users, clients, deadlines,
--      documents, invoices, agent_logs, queued_emails)
--   2. Authentication > Policies: all 8 tables show RLS policies
--   3. Views: dashboard_stats and agent_status exist
--   4. Sign up a test user — firm + firm_user rows should auto-appear
-- ─────────────────────────────────────────────────────────────────────────────
