export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ─── Enums ────────────────────────────────────────────────────────────────────

export type SubscriptionPlan = 'starter' | 'professional' | 'enterprise'
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled'
export type ClientStatus = 'active' | 'inactive' | 'prospect'
export type FilingType = '1040' | '1120' | '941' | 'W-2' | '1099-NEC' | '940'
export type DeadlineStatus = 'upcoming' | 'due_soon' | 'overdue' | 'completed' | 'extended'
export type DocumentStatus = 'required' | 'requested' | 'received' | 'approved'
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'voided'
export type AgentType = 'intake' | 'document' | 'deadline' | 'billing' | 'report'
export type AgentLogStatus = 'pending' | 'approved' | 'sent' | 'failed' | 'skipped'

// ─── Table Row Types (use `type` not `interface` so they extend Record<string, unknown>) ────

export type EngagementLetterStatus = 'not_sent' | 'sent' | 'signed' | 'declined'
export type QueuedEmailStatus = 'pending' | 'approved' | 'rejected' | 'sent'

export type Firm = {
  id: string
  name: string
  owner_email: string
  subscription_plan: SubscriptionPlan
  subscription_status: SubscriptionStatus
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  n8n_webhook_url: string | null
  engagement_letter_template: string | null   // Block 3
  engagement_letter_required: boolean          // Block 3
  settings: Json
  created_at: string
  updated_at: string
}

export type FirmUser = {
  id: string
  firm_id: string
  user_id: string
  role: 'owner' | 'staff'
  email: string
  full_name: string | null
  created_at: string
}

export type Client = {
  id: string
  firm_id: string
  full_name: string
  email: string
  phone: string | null
  entity_type: 'individual' | 'partnership' | 'corporation' | 's_corp' | 'llc' | 'nonprofit'
  status: ClientStatus
  filing_types: FilingType[]
  assigned_staff_email: string | null          // Block 1
  intake_completed_at: string | null
  engagement_letter_status: EngagementLetterStatus  // Block 4
  engagement_letter_sent_at: string | null
  engagement_letter_signed_at: string | null
  tally_submission_id: string | null
  notes: string | null
  deleted_at: string | null                    // Block 7 (soft delete)
  created_at: string
  updated_at: string
}

export type Deadline = {
  id: string
  firm_id: string
  client_id: string
  filing_type: FilingType
  due_date: string
  status: DeadlineStatus
  extension_date: string | null
  assigned_to: string | null
  alert_sent_30d: boolean
  alert_sent_14d: boolean
  alert_sent_7d: boolean
  alert_sent_3d: boolean
  alert_sent_1d: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type Document = {
  id: string
  firm_id: string
  client_id: string
  deadline_id: string | null
  name: string
  description: string | null
  status: DocumentStatus
  required_by: string | null
  received_at: string | null
  storage_path: string | null
  reminder_sent_at: string | null
  created_at: string
  updated_at: string
}

export type Invoice = {
  id: string
  firm_id: string
  client_id: string
  stripe_invoice_id: string | null
  amount_cents: number
  currency: string
  status: InvoiceStatus
  due_date: string
  paid_at: string | null
  reminder_sent_at: string | null
  description: string | null
  created_at: string
  updated_at: string
}

export type AgentLog = {
  id: string
  firm_id: string
  client_id: string | null
  agent_type: AgentType
  status: AgentLogStatus
  subject: string
  body: string
  ai_provider: string | null
  ai_latency_ms: number | null
  approved_by: string | null
  approved_at: string | null
  sent_at: string | null
  error: string | null
  metadata: Json
  next_run_at: string | null      // Block 6
  cron_schedule: string | null    // Block 6
  created_at: string
  updated_at: string
}

// Block 5 — queued_emails
export type QueuedEmail = {
  id: string
  firm_id: string
  client_id: string | null
  agent_type: AgentType
  to_email: string
  subject: string
  html_body: string
  status: QueuedEmailStatus
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null      // firm_users.id
}

// Block 6 — agent_status view
export type AgentStatus = {
  agent_type: AgentType
  firm_id: string
  last_run_at: string | null
  next_run_at: string | null
  cron_schedule: string | null
  error_count_24h: number
}

// ─── View Types ───────────────────────────────────────────────────────────────

export type DashboardStats = {
  firm_id: string
  total_clients: number
  active_clients: number
  upcoming_deadlines_7d: number
  overdue_deadlines: number
  pending_documents: number
  unpaid_invoices: number
  pending_agent_approvals: number
  agents_sent_30d: number
}

// ─── Database type (matches @supabase/supabase-js v2 expected format) ─────────

export type Database = {
  public: {
    Tables: {
      firms: {
        Row: Firm
        Insert: Omit<Firm, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Firm, 'id'>>
        Relationships: []
      }
      firm_users: {
        Row: FirmUser
        Insert: Omit<FirmUser, 'id' | 'created_at'>
        Update: Partial<Omit<FirmUser, 'id'>>
        Relationships: [
          { foreignKeyName: 'firm_users_firm_id_fkey'; columns: ['firm_id']; isOneToOne: false; referencedRelation: 'firms'; referencedColumns: ['id'] }
        ]
      }
      clients: {
        Row: Client
        Insert: Required<Pick<Client, 'firm_id' | 'full_name' | 'email' | 'entity_type' | 'status' | 'filing_types'>> &
          Partial<Pick<Client, 'phone' | 'assigned_staff_email' | 'intake_completed_at' | 'engagement_letter_status' | 'engagement_letter_sent_at' | 'engagement_letter_signed_at' | 'tally_submission_id' | 'notes' | 'deleted_at'>>
        Update: Partial<Omit<Client, 'id'>>
        Relationships: [
          { foreignKeyName: 'clients_firm_id_fkey'; columns: ['firm_id']; isOneToOne: false; referencedRelation: 'firms'; referencedColumns: ['id'] }
        ]
      }
      deadlines: {
        Row: Deadline
        Insert: Omit<Deadline, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Deadline, 'id'>>
        Relationships: [
          { foreignKeyName: 'deadlines_firm_id_fkey'; columns: ['firm_id']; isOneToOne: false; referencedRelation: 'firms'; referencedColumns: ['id'] },
          { foreignKeyName: 'deadlines_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'clients'; referencedColumns: ['id'] }
        ]
      }
      documents: {
        Row: Document
        Insert: Omit<Document, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Document, 'id'>>
        Relationships: [
          { foreignKeyName: 'documents_firm_id_fkey'; columns: ['firm_id']; isOneToOne: false; referencedRelation: 'firms'; referencedColumns: ['id'] },
          { foreignKeyName: 'documents_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'clients'; referencedColumns: ['id'] }
        ]
      }
      invoices: {
        Row: Invoice
        Insert: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Invoice, 'id'>>
        Relationships: [
          { foreignKeyName: 'invoices_firm_id_fkey'; columns: ['firm_id']; isOneToOne: false; referencedRelation: 'firms'; referencedColumns: ['id'] },
          { foreignKeyName: 'invoices_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'clients'; referencedColumns: ['id'] }
        ]
      }
      agent_logs: {
        Row: AgentLog
        Insert: Required<Pick<AgentLog, 'firm_id' | 'agent_type' | 'status' | 'subject' | 'body'>> &
          Partial<Pick<AgentLog, 'client_id' | 'ai_provider' | 'ai_latency_ms' | 'approved_by' | 'approved_at' | 'sent_at' | 'error' | 'metadata' | 'next_run_at' | 'cron_schedule'>>
        Update: Partial<Omit<AgentLog, 'id'>>
        Relationships: [
          { foreignKeyName: 'agent_logs_firm_id_fkey'; columns: ['firm_id']; isOneToOne: false; referencedRelation: 'firms'; referencedColumns: ['id'] },
          { foreignKeyName: 'agent_logs_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'clients'; referencedColumns: ['id'] }
        ]
      }
      queued_emails: {
        Row: QueuedEmail
        Insert: Required<Pick<QueuedEmail, 'firm_id' | 'agent_type' | 'to_email' | 'subject' | 'html_body'>> &
          Partial<Pick<QueuedEmail, 'client_id' | 'status' | 'reviewed_at' | 'reviewed_by'>>
        Update: Partial<Omit<QueuedEmail, 'id' | 'created_at'>>
        Relationships: [
          { foreignKeyName: 'queued_emails_firm_id_fkey'; columns: ['firm_id']; isOneToOne: false; referencedRelation: 'firms'; referencedColumns: ['id'] },
          { foreignKeyName: 'queued_emails_client_id_fkey'; columns: ['client_id']; isOneToOne: false; referencedRelation: 'clients'; referencedColumns: ['id'] }
        ]
      }
    }
    Views: {
      dashboard_stats: {
        Row: DashboardStats
        Relationships: []
      }
      agent_status: {
        Row: AgentStatus
        Relationships: []
      }
    }
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
