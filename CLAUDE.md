# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow Orchestration
### 1. Plan Mode Default
-   Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
-   If something goes sideways, STOP and re-plan immediately - don't keep pushing
-   Use plan mode for verification steps, not just building
-   Write detailed specs upfront to reduce ambiguity
### 2.Subagent Strategy
-   Use subagents liberally to keep main context window clean
-   Offload research, exploration, and parallel analysis to subagents
-   For complex problems, throw more compute at it via subagents
-   One task per subagent for focused execution
### 3. Self-Improvement Loop
- After ANY correction from the user: update 'tasks/lessons.md"
with the pattern
-   Write rules for yourself that prevent the same mistake
-   Ruthlessly iterate on these lessons until mistake rate drops
-   Review Lessons at session start for relevant project
### 4. Verification Before Done
-   Never mark a task complete without proving it works
-   Diff behavior between main and your changes when relevant
-   Ask yourself: "Would a staff engineer approve this?"
-   Run tests, check logs, demonstrate correctness
### 5.
Demand Elegance (Balanced)
-   If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
-   Skip this for simple, obvious fixes - don't over-engineer
-   Challenge your own work before presenting it
### 6. Autonomous Bug Fixing
-   When given a bug report: just fix it. Don't ask for hand-holding
-   Point at logs, errors, failing tests - then resolve them
-   Zero context switching required from the user
-   Go fix failing CI tests without being told how
6,464
## Task Management
1,209
1.    **PLan First**: Write plan to "tasks/todo.md" with checkable items
2.    **Verify Plan**: Check in before starting implementation
3.    *Track Progress**: Mark items complete as you go
4.    **ExpLain Changes**: High-Level summary at each step
5.    **Document Results**: Add review section to
"tasks/todo.md"
6. **Capture Lessons**: Update 'tasks/lessons-md' after corrections
94
## Core Principles
-   **Simplicity First**: Make every change as simple as possible. Impact minimal code
-   **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
-   **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## FirmRunner — Project Context

**Product**: AI Operations Platform for US accounting firms (2–20 staff).
Automates client intake, deadline tracking, document collection, billing, and monthly reporting.

---

## Commands

```bash
npm run dev        # Start dev server (localhost:3000)
npm run build      # Production build
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit (TypeScript strict mode)
```

Copy `.env.local.example` → `.env.local` and fill in credentials before running.

### Database

Migration file: `supabase/migrations/001_initial_schema.sql`

Run in Supabase SQL Editor (Dashboard → SQL Editor → paste + run), or via CLI:
```bash
supabase db push   # if using Supabase CLI with supabase/config.toml
```

The migration creates:
- 9 enum types, 7 tables, 18 indexes, RLS policies on all tables
- `handle_new_user()` trigger — auto-creates firm + firm_user on auth signup
- `current_firm_id()` helper — used in all RLS policies (cached per statement)
- `dashboard_stats` view — aggregated per-firm stats
- `create_default_deadlines(firm_id, client_id)` — call from Intake Agent after client creation

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router, TypeScript strict |
| Database | Supabase (PostgreSQL) with Row Level Security |
| AI Primary | Google Gemini 1.5 Flash (`@google/generative-ai`) |
| AI Fallback | Groq Llama 3.3 70B (`groq-sdk`) |
| AI Premium | Anthropic Claude (`@anthropic-ai/sdk`) |
| Automation | n8n (self-hosted on Render) via webhooks |
| Email | Resend |
| Payments | Stripe |
| Error tracking | Sentry |

---

## Architecture

### Route Groups
- `app/(auth)/` — login, signup pages (no sidebar, centered layout)
- `app/(dashboard)/` — all authenticated pages (sidebar + main layout)
- `app/api/webhooks/` — n8n and Stripe webhook receivers (no auth, signature-verified)
- `app/api/agents/` — agent approve/reject endpoints (Supabase auth required) + n8n triggers (signature-verified)

### AI Provider Cascade (`lib/ai/ai.ts`)
`generateText()` tries providers in order: Gemini → Groq → Claude.
Set `NEXT_PUBLIC_AI_PROVIDER=groq` to force a provider. All prompts are provider-agnostic.
Every AI call optionally writes to `agent_logs` (provider name + latency).

### Multi-Tenant Isolation
All 7 tables have a `firm_id` column. Supabase RLS policies filter every query by `auth.uid() → firm_users.firm_id`.
- `lib/supabase/server.ts` — `createClient()` (RLS-enforced), `createAdminClient()` (service role, bypasses RLS)
- `lib/supabase/browser.ts` — singleton browser client for Client Components
- Never use `createAdminClient()` in user-facing routes; only in webhooks and cron jobs.

### Agent Approval Queue (critical pattern)
All 5 agents write to `agent_logs` with `status: 'pending'` — nothing is sent automatically.
Firm owner reviews in the dashboard (`ApprovalQueue` component) and clicks "Approve & Send".
The approve action calls the agent's API route, which sends via Resend and updates status to `'sent'`.
**Legal requirement**: agents must not activate until `clients.engagement_letter_sent_at` is set.

### 5 AI Agents (all in `lib/agents/`)
| Agent | Trigger | Description |
|-------|---------|-------------|
| `intake.ts` | Tally webhook → n8n | Creates client, drafts engagement letter |
| `document.ts` | n8n daily | Reminds clients about missing documents |
| `deadline.ts` | n8n daily | Graduated alerts at 30/14/7/3/1 days |
| `billing.ts` | n8n daily | Invoice reminder sequences |
| `report.ts` | n8n monthly | AI-generated client summaries |

### Database Tables
`firms`, `firm_users`, `clients`, `deadlines`, `documents`, `invoices`, `agent_logs`
All types are in `lib/supabase/types.ts`. The `dashboard_stats` view is a pre-aggregated read.

### Webhook Security
n8n routes send `X-Webhook-Secret` header; verified via `verifyN8nSignature()` in `lib/utils.ts`.
Stripe routes verified via `constructWebhookEvent()` in `lib/stripe.ts`.

### Filing Types
Supported: `1040`, `1120`, `941`, `W-2`, `1099-NEC`, `940`.
Labels and deadline dates are in `lib/ai/prompts.ts` (`FILING_TYPE_LABELS`, `FILING_TYPE_DEADLINES`).

---

## Key Constraints

- **Engagement letter must be sent before any agent emails a client** — check `engagement_letter_sent_at` in every agent.
- Server Components by default; add `'use client'` only for interactivity.
- All DB queries go through Supabase client — no raw SQL in app code.
- Add Sentry error boundaries on new pages.
