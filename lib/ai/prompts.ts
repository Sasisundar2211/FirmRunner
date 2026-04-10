import type { Client, Deadline, Document, Invoice, FilingType } from '@/lib/supabase/types'

/**
 * All agent prompt templates.
 * Prompts are provider-agnostic — no model-specific formatting.
 * Keep prompts factual and professional for CPA firm context.
 */

export function intakePrompt(params: {
  firmName: string
  client: Pick<Client, 'full_name' | 'email' | 'entity_type' | 'filing_types'>
}): string {
  return `You are an AI assistant for ${params.firmName}, a CPA firm.

Draft a professional engagement letter for a new client with the following details:
- Client Name: ${params.client.full_name}
- Email: ${params.client.email}
- Entity Type: ${params.client.entity_type}
- Services Requested: ${params.client.filing_types.join(', ')}

The letter should:
1. Welcome the client and confirm the engagement
2. List the specific tax and accounting services to be provided
3. Outline the client's responsibilities (providing documents, timely responses)
4. State the firm's responsibilities
5. Include a fee structure placeholder [FEE AMOUNT]
6. Request the client to sign and return to confirm acceptance

Keep the tone professional and warm. Use standard CPA engagement letter language.
Output only the letter body — no subject line or metadata.`
}

export function documentReminderPrompt(params: {
  firmName: string
  client: Pick<Client, 'full_name'>
  missingDocuments: Pick<Document, 'name' | 'description' | 'required_by'>[]
}): string {
  const docList = params.missingDocuments
    .map((d) => `- ${d.name}${d.description ? `: ${d.description}` : ''}${d.required_by ? ` (needed by ${d.required_by})` : ''}`)
    .join('\n')

  return `You are an AI assistant for ${params.firmName}, a CPA firm.

Write a friendly but urgent email reminding a client to provide missing tax documents.

Client: ${params.client.full_name}
Missing Documents:
${docList}

The email should:
1. Open warmly, referencing the upcoming filing
2. List each missing document clearly
3. Explain why timely submission matters (avoid penalties, extensions)
4. Provide a clear call to action (upload link placeholder: [UPLOAD_LINK])
5. Offer to answer questions

Keep it under 200 words. Professional but approachable tone.
Output only the email body — no subject line.`
}

export function deadlineAlertPrompt(params: {
  firmName: string
  client: Pick<Client, 'full_name'>
  deadline: Pick<Deadline, 'filing_type' | 'due_date' | 'status'>
  daysUntilDue: number
}): string {
  const urgency =
    params.daysUntilDue <= 3 ? 'URGENT' :
    params.daysUntilDue <= 7 ? 'Important' : 'Reminder'

  return `You are an AI assistant for ${params.firmName}, a CPA firm.

Write a ${urgency.toLowerCase()} deadline notification email.

Client: ${params.client.full_name}
Filing Type: ${params.deadline.filing_type}
Due Date: ${params.deadline.due_date}
Days Until Due: ${params.daysUntilDue}

The email should:
1. Clearly state the filing deadline and days remaining
2. ${params.daysUntilDue <= 7 ? 'Express appropriate urgency' : 'Provide a friendly reminder'}
3. List any outstanding action items from the client
4. Mention consequences of missing the deadline (IRS penalties for ${params.deadline.filing_type})
5. Offer extension filing if applicable
6. Provide contact information placeholder: [FIRM_PHONE]

Keep under 150 words. Output only the email body.`
}

export function billingReminderPrompt(params: {
  firmName: string
  client: Pick<Client, 'full_name'>
  invoice: Pick<Invoice, 'amount_cents' | 'due_date' | 'status'>
  daysPastDue: number
}): string {
  const amountFormatted = (params.invoice.amount_cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })

  const sequence =
    params.daysPastDue === 0 ? 'initial invoice' :
    params.daysPastDue <= 7 ? 'first reminder' :
    params.daysPastDue <= 14 ? 'second reminder' : 'final notice'

  return `You are an AI assistant for ${params.firmName}, a CPA firm.

Write a ${sequence} for an outstanding invoice.

Client: ${params.client.full_name}
Amount Due: ${amountFormatted}
Due Date: ${params.invoice.due_date}
Days Past Due: ${params.daysPastDue}

The email should:
1. Reference the invoice clearly
2. State the amount and due date
3. ${params.daysPastDue > 14 ? 'Express that this is a final notice before escalation' : 'Request prompt payment'}
4. Include payment link placeholder: [PAYMENT_LINK]
5. Offer to discuss if there are any concerns

Maintain a professional, firm-but-courteous tone. Output only the email body.`
}

export function monthlyReportPrompt(params: {
  firmName: string
  client: Pick<Client, 'full_name' | 'entity_type' | 'filing_types'>
  reportMonth: string // e.g. "March 2025"
  stats: {
    deadlinesCompleted: number
    deadlinesUpcoming: number
    documentsReceived: number
    documentsPending: number
    invoicesPaid: number
    invoicesOutstanding: number
  }
}): string {
  return `You are an AI assistant for ${params.firmName}, a CPA firm.

Write a monthly client status summary for ${params.reportMonth}.

Client: ${params.client.full_name} (${params.client.entity_type})
Services: ${params.client.filing_types.join(', ')}

Activity this month:
- Deadlines completed: ${params.stats.deadlinesCompleted}
- Upcoming deadlines: ${params.stats.deadlinesUpcoming}
- Documents received: ${params.stats.documentsReceived}
- Documents still pending: ${params.stats.documentsPending}
- Invoices paid: ${params.stats.invoicesPaid}
- Outstanding invoices: ${params.stats.invoicesOutstanding}

Write a 3-paragraph summary:
1. Overall status and highlights
2. Outstanding items requiring client attention
3. What to expect next month

Professional, concise, reassuring tone. Output only the report body — no headers or metadata.`
}

// ─── Filing type metadata ─────────────────────────────────────────────────────

export const FILING_TYPE_LABELS: Record<FilingType, string> = {
  '1040': 'Individual Income Tax Return',
  '1120': 'C Corporation Income Tax Return',
  '941': 'Employer\'s Quarterly Federal Tax Return',
  'W-2': 'Wage and Tax Statement',
  '1099-NEC': 'Nonemployee Compensation',
  '940': 'Employer\'s Annual Federal Unemployment Tax Return',
}

export const FILING_TYPE_DEADLINES: Record<FilingType, string> = {
  '1040': 'April 15 (October 15 with extension)',
  '1120': 'April 15 (October 15 with extension)',
  '941': 'Last day of month following quarter end',
  'W-2': 'January 31',
  '1099-NEC': 'January 31',
  '940': 'January 31',
}
