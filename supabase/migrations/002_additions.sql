-- =============================================================================
-- FirmRunner — Schema Additions (run after 001_initial_schema.sql / schema.sql)
-- Paste into Supabase SQL Editor and run. All statements are idempotent.
-- =============================================================================
-- NOTE: Block 2 from the original list (deadline_type / deadline_rules) is
-- intentionally omitted — our schema uses filing_type which already includes
-- W-2, 1099-NEC, and 940. There is no separate deadline_rules table.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- Block 1 — clients.assigned_staff_email
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS assigned_staff_email TEXT;

COMMENT ON COLUMN public.clients.assigned_staff_email IS
    'Email of the staff member assigned to this client for agent routing.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Block 3 — firms: engagement letter template columns
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.firms
    ADD COLUMN IF NOT EXISTS engagement_letter_template TEXT,
    ADD COLUMN IF NOT EXISTS engagement_letter_required BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.firms.engagement_letter_template IS
    'Custom engagement letter template text. If NULL, the AI generates one from the default prompt.';
COMMENT ON COLUMN public.firms.engagement_letter_required IS
    'When TRUE, agents will not email a client until engagement_letter_sent_at is set on the client row.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Block 4 — clients: engagement letter status
-- (sent_at and signed_at already exist from Block 1; only status is new)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS engagement_letter_status TEXT NOT NULL DEFAULT 'not_sent'
        CHECK (engagement_letter_status IN ('not_sent', 'sent', 'signed', 'declined')),
    -- The columns below already exist in 001 but IF NOT EXISTS keeps this safe to re-run
    ADD COLUMN IF NOT EXISTS engagement_letter_sent_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS engagement_letter_signed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.clients.engagement_letter_status IS
    'Tracks engagement letter lifecycle: not_sent → sent → signed | declined.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Block 5 — queued_emails table
-- Stores emails awaiting firm-owner approval before sending via Resend.
-- Complements agent_logs: agent_logs tracks AI generation; queued_emails
-- tracks the outbound email approval workflow.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.queued_emails (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX IF NOT EXISTS idx_queued_emails_firm_pending
    ON public.queued_emails(firm_id, created_at DESC)
    WHERE status = 'pending';

ALTER TABLE public.queued_emails ENABLE ROW LEVEL SECURITY;

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

COMMENT ON TABLE public.queued_emails IS
    'Outbound email approval queue. Firm owner approves/rejects before Resend sends.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Block 6 — agent_logs: scheduling columns + agent_status view
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.agent_logs
    ADD COLUMN IF NOT EXISTS next_run_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cron_schedule  TEXT;

COMMENT ON COLUMN public.agent_logs.next_run_at   IS 'When this agent type is next scheduled to run (set by n8n).';
COMMENT ON COLUMN public.agent_logs.cron_schedule IS 'Human-readable cron schedule, e.g. "Daily at 9:00 AM".';

-- agent_status view: latest run info per agent per firm, shown on the Agents dashboard page
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
-- Block 7 — clients: soft delete
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.clients
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Update the existing RLS read policy to exclude soft-deleted clients.
-- Agents and dashboard pages filter WHERE deleted_at IS NULL automatically
-- once this policy is in place.
DROP POLICY IF EXISTS "clients: read own firm" ON public.clients;
CREATE POLICY "clients: read own firm"
    ON public.clients FOR SELECT
    USING (firm_id = public.current_firm_id() AND deleted_at IS NULL);

COMMENT ON COLUMN public.clients.deleted_at IS
    'Soft delete timestamp. Non-NULL rows are excluded from all RLS SELECT queries.';


-- ─────────────────────────────────────────────────────────────────────────────
-- DONE
-- Verify in Supabase Table Editor:
--   clients  → assigned_staff_email, engagement_letter_status, deleted_at
--   firms    → engagement_letter_template, engagement_letter_required
--   agent_logs → next_run_at, cron_schedule
--   new table: queued_emails
--   new view:  agent_status
-- ─────────────────────────────────────────────────────────────────────────────
