-- =============================================================================
-- FirmRunner — Initial Schema Migration
-- Run this once in the Supabase SQL Editor (or via Supabase CLI).
-- =============================================================================

-- ─── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ─── Enum Types ───────────────────────────────────────────────────────────────

CREATE TYPE subscription_plan    AS ENUM ('starter', 'professional', 'enterprise');
CREATE TYPE subscription_status  AS ENUM ('active', 'trialing', 'past_due', 'canceled');
CREATE TYPE client_status        AS ENUM ('active', 'inactive', 'prospect');
CREATE TYPE filing_type          AS ENUM ('1040', '1120', '941', 'W-2', '1099-NEC', '940');
CREATE TYPE deadline_status      AS ENUM ('upcoming', 'due_soon', 'overdue', 'completed', 'extended');
CREATE TYPE document_status      AS ENUM ('required', 'requested', 'received', 'approved');
CREATE TYPE invoice_status       AS ENUM ('draft', 'sent', 'paid', 'overdue', 'voided');
CREATE TYPE agent_type           AS ENUM ('intake', 'document', 'deadline', 'billing', 'report');
CREATE TYPE agent_log_status     AS ENUM ('pending', 'approved', 'sent', 'failed', 'skipped');


-- ─── Tables ───────────────────────────────────────────────────────────────────

-- firms: one row per accounting firm (tenant root)
CREATE TABLE public.firms (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                  TEXT NOT NULL,
    owner_email           TEXT NOT NULL,
    subscription_plan     subscription_plan NOT NULL DEFAULT 'starter',
    subscription_status   subscription_status NOT NULL DEFAULT 'trialing',
    stripe_customer_id    TEXT,
    stripe_subscription_id TEXT,
    n8n_webhook_url       TEXT,
    settings              JSONB NOT NULL DEFAULT '{}',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- firm_users: maps auth.users to firms; supports multiple staff per firm
CREATE TABLE public.firm_users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id     UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('owner', 'staff')) DEFAULT 'owner',
    email       TEXT NOT NULL,
    full_name   TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (firm_id, user_id)
);

-- clients: accounting firm's client base
CREATE TABLE public.clients (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id                     UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    full_name                   TEXT NOT NULL,
    email                       TEXT NOT NULL,
    phone                       TEXT,
    entity_type                 TEXT NOT NULL CHECK (entity_type IN ('individual', 'partnership', 'corporation', 's_corp', 'llc', 'nonprofit')),
    status                      client_status NOT NULL DEFAULT 'prospect',
    filing_types                filing_type[] NOT NULL DEFAULT '{}',
    intake_completed_at         TIMESTAMPTZ,
    -- Legal requirement: agents must not send emails until this is set
    engagement_letter_sent_at   TIMESTAMPTZ,
    engagement_letter_signed_at TIMESTAMPTZ,
    tally_submission_id         TEXT,
    notes                       TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- deadlines: tax filing deadlines with graduated alert tracking
CREATE TABLE public.deadlines (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id         UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    filing_type     filing_type NOT NULL,
    due_date        DATE NOT NULL,
    status          deadline_status NOT NULL DEFAULT 'upcoming',
    extension_date  DATE,
    assigned_to     TEXT,                      -- staff member name/email
    -- Alert sent flags (prevent duplicate emails)
    alert_sent_30d  BOOLEAN NOT NULL DEFAULT FALSE,
    alert_sent_14d  BOOLEAN NOT NULL DEFAULT FALSE,
    alert_sent_7d   BOOLEAN NOT NULL DEFAULT FALSE,
    alert_sent_3d   BOOLEAN NOT NULL DEFAULT FALSE,
    alert_sent_1d   BOOLEAN NOT NULL DEFAULT FALSE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- documents: track required vs received client documents
CREATE TABLE public.documents (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id           UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    client_id         UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    deadline_id       UUID REFERENCES public.deadlines(id) ON DELETE SET NULL,
    name              TEXT NOT NULL,
    description       TEXT,
    status            document_status NOT NULL DEFAULT 'required',
    required_by       DATE,
    received_at       TIMESTAMPTZ,
    storage_path      TEXT,                   -- Supabase Storage path when uploaded
    reminder_sent_at  TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- invoices: billing records with Stripe integration
CREATE TABLE public.invoices (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id             UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    client_id           UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    stripe_invoice_id   TEXT UNIQUE,
    amount_cents        INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency            TEXT NOT NULL DEFAULT 'usd',
    status              invoice_status NOT NULL DEFAULT 'draft',
    due_date            DATE NOT NULL,
    paid_at             TIMESTAMPTZ,
    reminder_sent_at    TIMESTAMPTZ,
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- agent_logs: every AI-generated email, queued for firm-owner approval before sending
CREATE TABLE public.agent_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firm_id         UUID NOT NULL REFERENCES public.firms(id) ON DELETE CASCADE,
    client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    agent_type      agent_type NOT NULL,
    status          agent_log_status NOT NULL DEFAULT 'pending',
    subject         TEXT NOT NULL,
    body            TEXT NOT NULL,
    ai_provider     TEXT,                     -- 'gemini' | 'groq' | 'claude'
    ai_latency_ms   INTEGER,
    approved_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at     TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ,
    error           TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- firm_users
CREATE INDEX idx_firm_users_user_id   ON public.firm_users(user_id);
CREATE INDEX idx_firm_users_firm_id   ON public.firm_users(firm_id);

-- clients
CREATE INDEX idx_clients_firm_id      ON public.clients(firm_id);
CREATE INDEX idx_clients_status       ON public.clients(firm_id, status);
CREATE INDEX idx_clients_email        ON public.clients(firm_id, email);

-- deadlines
CREATE INDEX idx_deadlines_firm_id    ON public.deadlines(firm_id);
CREATE INDEX idx_deadlines_client_id  ON public.deadlines(client_id);
CREATE INDEX idx_deadlines_due_date   ON public.deadlines(firm_id, due_date) WHERE status NOT IN ('completed', 'extended');

-- documents
CREATE INDEX idx_documents_firm_id    ON public.documents(firm_id);
CREATE INDEX idx_documents_client_id  ON public.documents(client_id);
CREATE INDEX idx_documents_status     ON public.documents(firm_id, status);

-- invoices
CREATE INDEX idx_invoices_firm_id     ON public.invoices(firm_id);
CREATE INDEX idx_invoices_client_id   ON public.invoices(client_id);
CREATE INDEX idx_invoices_status      ON public.invoices(firm_id, status);
CREATE INDEX idx_invoices_stripe      ON public.invoices(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;

-- agent_logs
CREATE INDEX idx_agent_logs_firm_id   ON public.agent_logs(firm_id);
CREATE INDEX idx_agent_logs_pending   ON public.agent_logs(firm_id, status) WHERE status = 'pending';
CREATE INDEX idx_agent_logs_client_id ON public.agent_logs(client_id) WHERE client_id IS NOT NULL;


-- ─── updated_at Trigger ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.firms
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clients
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.deadlines
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.agent_logs
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── Auto-create Firm on Signup ───────────────────────────────────────────────
-- When a user signs up (auth.users INSERT), create their firm and firm_user row.
-- firm_name comes from user.raw_user_meta_data->>'firm_name' (set in SignupForm).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    new_firm_id UUID;
    firm_name_val TEXT;
BEGIN
    firm_name_val := COALESCE(
        NEW.raw_user_meta_data->>'firm_name',
        split_part(NEW.email, '@', 1) || '''s Firm'
    );

    INSERT INTO public.firms (name, owner_email)
    VALUES (firm_name_val, NEW.email)
    RETURNING id INTO new_firm_id;

    INSERT INTO public.firm_users (firm_id, user_id, role, email, full_name)
    VALUES (
        new_firm_id,
        NEW.id,
        'owner',
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NULL)
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─── Helper: get current user's firm_id ──────────────────────────────────────
-- Called from RLS policies; cached per statement for performance.

CREATE OR REPLACE FUNCTION public.current_firm_id()
RETURNS UUID AS $$
    SELECT firm_id
    FROM public.firm_users
    WHERE user_id = auth.uid()
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;


-- ─── Row Level Security ───────────────────────────────────────────────────────

ALTER TABLE public.firms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firm_users  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deadlines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs  ENABLE ROW LEVEL SECURITY;

-- firms: users can only see/edit their own firm
CREATE POLICY "firms: read own"   ON public.firms FOR SELECT USING (id = public.current_firm_id());
CREATE POLICY "firms: update own" ON public.firms FOR UPDATE USING (id = public.current_firm_id());

-- firm_users: see all users in own firm; owners can manage staff
CREATE POLICY "firm_users: read own firm"   ON public.firm_users FOR SELECT USING (firm_id = public.current_firm_id());
CREATE POLICY "firm_users: insert own firm" ON public.firm_users FOR INSERT WITH CHECK (firm_id = public.current_firm_id());
CREATE POLICY "firm_users: delete own firm" ON public.firm_users FOR DELETE USING (firm_id = public.current_firm_id());

-- clients
CREATE POLICY "clients: read own firm"   ON public.clients FOR SELECT USING (firm_id = public.current_firm_id());
CREATE POLICY "clients: insert own firm" ON public.clients FOR INSERT WITH CHECK (firm_id = public.current_firm_id());
CREATE POLICY "clients: update own firm" ON public.clients FOR UPDATE USING (firm_id = public.current_firm_id());
CREATE POLICY "clients: delete own firm" ON public.clients FOR DELETE USING (firm_id = public.current_firm_id());

-- deadlines
CREATE POLICY "deadlines: read own firm"   ON public.deadlines FOR SELECT USING (firm_id = public.current_firm_id());
CREATE POLICY "deadlines: insert own firm" ON public.deadlines FOR INSERT WITH CHECK (firm_id = public.current_firm_id());
CREATE POLICY "deadlines: update own firm" ON public.deadlines FOR UPDATE USING (firm_id = public.current_firm_id());
CREATE POLICY "deadlines: delete own firm" ON public.deadlines FOR DELETE USING (firm_id = public.current_firm_id());

-- documents
CREATE POLICY "documents: read own firm"   ON public.documents FOR SELECT USING (firm_id = public.current_firm_id());
CREATE POLICY "documents: insert own firm" ON public.documents FOR INSERT WITH CHECK (firm_id = public.current_firm_id());
CREATE POLICY "documents: update own firm" ON public.documents FOR UPDATE USING (firm_id = public.current_firm_id());
CREATE POLICY "documents: delete own firm" ON public.documents FOR DELETE USING (firm_id = public.current_firm_id());

-- invoices
CREATE POLICY "invoices: read own firm"   ON public.invoices FOR SELECT USING (firm_id = public.current_firm_id());
CREATE POLICY "invoices: insert own firm" ON public.invoices FOR INSERT WITH CHECK (firm_id = public.current_firm_id());
CREATE POLICY "invoices: update own firm" ON public.invoices FOR UPDATE USING (firm_id = public.current_firm_id());
CREATE POLICY "invoices: delete own firm" ON public.invoices FOR DELETE USING (firm_id = public.current_firm_id());

-- agent_logs
CREATE POLICY "agent_logs: read own firm"   ON public.agent_logs FOR SELECT USING (firm_id = public.current_firm_id());
CREATE POLICY "agent_logs: insert own firm" ON public.agent_logs FOR INSERT WITH CHECK (firm_id = public.current_firm_id());
CREATE POLICY "agent_logs: update own firm" ON public.agent_logs FOR UPDATE USING (firm_id = public.current_firm_id());
CREATE POLICY "agent_logs: delete own firm" ON public.agent_logs FOR DELETE USING (firm_id = public.current_firm_id());


-- ─── dashboard_stats View ─────────────────────────────────────────────────────
-- Aggregates per firm. RLS on underlying tables ensures users only see own data.
-- Query this view with .select('*').eq('firm_id', firmId).single()

CREATE OR REPLACE VIEW public.dashboard_stats AS
SELECT
    f.id AS firm_id,

    -- Clients
    COUNT(DISTINCT c.id)                                                          AS total_clients,
    COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'active')                       AS active_clients,

    -- Deadlines
    COUNT(DISTINCT d.id) FILTER (
        WHERE d.status NOT IN ('completed', 'extended')
          AND d.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
    )                                                                              AS upcoming_deadlines_7d,
    COUNT(DISTINCT d.id) FILTER (
        WHERE d.status NOT IN ('completed', 'extended')
          AND d.due_date < CURRENT_DATE
    )                                                                              AS overdue_deadlines,

    -- Documents
    COUNT(DISTINCT doc.id) FILTER (WHERE doc.status IN ('required', 'requested')) AS pending_documents,

    -- Invoices
    COUNT(DISTINCT i.id) FILTER (WHERE i.status IN ('sent', 'overdue'))           AS unpaid_invoices,

    -- Agent logs
    COUNT(DISTINCT al.id) FILTER (WHERE al.status = 'pending')                    AS pending_agent_approvals,
    COUNT(DISTINCT al.id) FILTER (
        WHERE al.status = 'sent'
          AND al.sent_at >= NOW() - INTERVAL '30 days'
    )                                                                              AS agents_sent_30d

FROM public.firms f
LEFT JOIN public.clients   c   ON c.firm_id  = f.id
LEFT JOIN public.deadlines d   ON d.firm_id  = f.id
LEFT JOIN public.documents doc ON doc.firm_id = f.id
LEFT JOIN public.invoices  i   ON i.firm_id  = f.id
LEFT JOIN public.agent_logs al ON al.firm_id = f.id
GROUP BY f.id;


-- ─── Seed: Pre-load standard filing deadlines for new clients ─────────────────
-- This function is called after intake to create default deadline records.
-- Call it from the Intake Agent after creating the client.

CREATE OR REPLACE FUNCTION public.create_default_deadlines(
    p_firm_id   UUID,
    p_client_id UUID,
    p_year      INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT
)
RETURNS VOID AS $$
DECLARE
    filing filing_type;
    due    DATE;
BEGIN
    -- Only create for filing types associated with the client
    FOR filing IN
        SELECT unnest(filing_types) FROM public.clients WHERE id = p_client_id
    LOOP
        due := CASE filing
            WHEN '1040'     THEN make_date(p_year, 4, 15)
            WHEN '1120'     THEN make_date(p_year, 4, 15)
            WHEN '941'      THEN make_date(p_year, 4, 30)   -- Q1; agent handles all quarters
            WHEN 'W-2'      THEN make_date(p_year, 1, 31)
            WHEN '1099-NEC' THEN make_date(p_year, 1, 31)
            WHEN '940'      THEN make_date(p_year, 1, 31)
            ELSE NULL
        END;

        IF due IS NOT NULL AND due >= CURRENT_DATE THEN
            INSERT INTO public.deadlines (firm_id, client_id, filing_type, due_date, status)
            VALUES (p_firm_id, p_client_id, filing, due, 'upcoming')
            ON CONFLICT DO NOTHING;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
