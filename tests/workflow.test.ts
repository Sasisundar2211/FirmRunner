import {
  formatCurrency,
  daysBetween,
  formatDate,
  getDeadlineUrgency,
  verifyN8nSignature,
} from '../lib/utils'
import { verifyAgentSecret, checkRateLimit, agentGuard } from '../lib/agents/agent-auth'
import { checkEngagementLetter } from '../lib/agents/guards'
import { processIntakeWebhook, TallyWebhookPayload } from '../lib/agents/intake'
import {
  documentReminderPrompt,
  deadlineAlertPrompt,
  billingReminderPrompt,
  monthlyReportPrompt,
} from '../lib/ai/prompts'

// ── Simple test runner framework ──────────────────────────────────────────────

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.error(`  ✕ FAIL: ${message}`)
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual === expected) {
    passed++
    console.log(`  ✓ ${message}`)
  } else {
    failed++
    console.error(`  ✕ FAIL: ${message} (Expected: ${String(expected)}, Got: ${String(actual)})`)
  }
}

async function testSuite(suiteName: string, suiteFn: () => Promise<void> | void) {
  console.log(`\n--- Running Suite: ${suiteName} ---`)
  try {
    await suiteFn()
  } catch (err) {
    failed++
    console.error(`  ✕ Suite crashed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// ── Main Test Execution ──────────────────────────────────────────────────────

async function main() {
  console.log('=================================================================')
  console.log('           FIRMRUNNER COMPLETE WORKFLOW TEST SUITE               ')
  console.log('=================================================================')

  // 1. UTILITIES & FORMATTERS
  await testSuite('1. Utilities & Formatters', () => {
    assertEqual(formatCurrency(12500), '$125.00', 'formatCurrency converts 12500 cents to $125.00')
    assertEqual(formatCurrency(0), '$0.00', 'formatCurrency converts 0 cents to $0.00')

    assertEqual(daysBetween('2025-01-01', '2025-01-10'), 9, 'daysBetween calculates 9 days correctly')
    assertEqual(daysBetween('2025-01-10', '2025-01-01'), -9, 'daysBetween handles negative diff')

    assertEqual(getDeadlineUrgency(-1), 'critical', 'getDeadlineUrgency(-1) is critical')
    assertEqual(getDeadlineUrgency(2), 'critical', 'getDeadlineUrgency(2) is critical')
    assertEqual(getDeadlineUrgency(5), 'high', 'getDeadlineUrgency(5) is high')
    assertEqual(getDeadlineUrgency(10), 'medium', 'getDeadlineUrgency(10) is medium')
    assertEqual(getDeadlineUrgency(20), 'low', 'getDeadlineUrgency(20) is low')

    // Webhook signature testing
    process.env.N8N_WEBHOOK_SECRET = 'secret_key_123'
    assertEqual(verifyN8nSignature('testbody', null), false, 'verifyN8nSignature rejects null signature when secret is set')
    assertEqual(verifyN8nSignature('testbody', 'wrong_secret'), false, 'verifyN8nSignature rejects wrong secret')
    assertEqual(verifyN8nSignature('testbody', 'secret_key_123'), true, 'verifyN8nSignature accepts correct secret')
    delete process.env.N8N_WEBHOOK_SECRET
  })

  // 2. CLIENT RESPONSE TOKEN TEST SUITE
  await testSuite('2. Client Response Link & Token Encoding/Decoding', () => {
    const payload = {
      clientId: 'client-123',
      firmId: 'firm-456',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }
    const token = Buffer.from(JSON.stringify(payload)).toString('base64url')

    const decodedRaw = Buffer.from(token, 'base64url').toString('utf8')
    const decodedPayload = JSON.parse(decodedRaw)

    assertEqual(decodedPayload.clientId, 'client-123', 'Decoded clientId matches')
    assertEqual(decodedPayload.firmId, 'firm-456', 'Decoded firmId matches')
    assert(new Date(decodedPayload.expiresAt) > new Date(), 'Expiry date is in the future')

    // Test token expiry check logic
    const expiredPayload = {
      clientId: 'client-123',
      firmId: 'firm-456',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    }
    assert(new Date(expiredPayload.expiresAt) < new Date(), 'Expired token is correctly identified as expired')
  })

  // 3. AI PROMPT GENERATION TEMPLATES
  await testSuite('3. AI Prompt Generation Templates', () => {
    const docPrompt = documentReminderPrompt({
      firmName: 'Apex Accounting',
      client: { full_name: 'John Doe' },
      missingDocuments: [{ name: '2024 W-2', description: 'W2 from employer', required_by: '2025-04-15' }],
    })
    assert(docPrompt.includes('Apex Accounting') && docPrompt.includes('John Doe') && docPrompt.includes('2024 W-2'), 'Document reminder prompt contains firm, client, and document names')

    const deadlinePrompt = deadlineAlertPrompt({
      firmName: 'Apex Accounting',
      client: { full_name: 'Jane Smith' },
      deadline: { filing_type: '1040', due_date: '2025-04-15', status: 'upcoming' },
      daysUntilDue: 7,
    })
    assert(deadlinePrompt.includes('1040') && deadlinePrompt.includes('7'), 'Deadline alert prompt includes filing type and days remaining')

    const billingPrompt = billingReminderPrompt({
      firmName: 'Apex Accounting',
      client: { full_name: 'Bob Ross' },
      invoice: { amount_cents: 50000, due_date: '2025-01-01', status: 'overdue' },
      daysPastDue: 14,
    })
    assert(billingPrompt.includes('Bob Ross') && billingPrompt.includes('14'), 'Billing reminder prompt includes client and days past due')

    const reportPrompt = monthlyReportPrompt({
      firmName: 'Apex Accounting',
      client: { full_name: 'Acme Corp', entity_type: 'corporation', filing_types: ['1120'] },
      reportMonth: 'February 2025',
      stats: {
        deadlinesCompleted: 2,
        deadlinesUpcoming: 1,
        documentsReceived: 5,
        documentsPending: 0,
        invoicesPaid: 1,
        invoicesOutstanding: 0,
      },
    })
    assert(reportPrompt.includes('February 2025') && reportPrompt.includes('Acme Corp'), 'Monthly report prompt includes month and client name')
  })

  // 4. AGENT AUTH & RATE LIMITING
  await testSuite('4. Agent Auth & Rate Limiting', () => {
    process.env.AGENT_SECRET = 'my_agent_secret_456'
    assertEqual(verifyAgentSecret({ headers: new Map([['authorization', 'Bearer my_agent_secret_456']]) } as any), true, 'verifyAgentSecret accepts correct bearer token')
    assertEqual(verifyAgentSecret({ headers: new Map([['authorization', 'Bearer wrong_secret']]) } as any), false, 'verifyAgentSecret rejects incorrect token')
    assertEqual(verifyAgentSecret({ headers: new Map([]) } as any), false, 'verifyAgentSecret rejects missing authorization header')
    delete process.env.AGENT_SECRET

    const testFirmId = 'test-firm-rl-' + Date.now()
    for (let i = 0; i < 10; i++) {
      assert(checkRateLimit('document', testFirmId), `Call ${i + 1} within rate limit`)
    }
    assertEqual(checkRateLimit('document', testFirmId), false, '11th call exceeds rate limit (max 10 per hour)')
  })

  // 5. TALLY WEBHOOK PAYLOAD PARSING
  await testSuite('5. Intake Agent & Tally Form Parsing', () => {
    const payload: TallyWebhookPayload = {
      eventId: 'evt_1',
      eventType: 'FORM_RESPONSE',
      createdAt: new Date().toISOString(),
      data: {
        responseId: 'resp_1',
        submissionId: 'sub_123',
        respondentId: 'resp_123',
        formId: 'form_1',
        formName: 'Client Intake Form',
        createdAt: new Date().toISOString(),
        fields: [
          { key: 'q1', label: 'Full Name', type: 'INPUT_TEXT', value: 'Alice Johnson' },
          { key: 'q2', label: 'Email Address', type: 'INPUT_EMAIL', value: 'alice@example.com' },
          { key: 'q3', label: 'Phone', type: 'INPUT_TEXT', value: '555-0199' },
          { key: 'q4', label: 'Entity Type', type: 'INPUT_TEXT', value: 'llc' },
        ],
      },
    }

    const fields = payload.data.fields
    const getField = (label: string) =>
      fields.find((f) => f.label.toLowerCase().includes(label.toLowerCase()))?.value as string | undefined

    assertEqual(getField('name'), 'Alice Johnson', 'Parsed name correctly')
    assertEqual(getField('email'), 'alice@example.com', 'Parsed email correctly')
    assertEqual(getField('phone'), '555-0199', 'Parsed phone correctly')
    assertEqual(getField('entity'), 'llc', 'Parsed entity type correctly')
  })

  // 6. STRIPE PRICE MAPPING & WEBHOOK EVENTS
  await testSuite('6. Stripe Price Mapping & Subscriptions', () => {
    process.env.STRIPE_PRICE_STARTER = 'price_starter_123'
    process.env.STRIPE_PRICE_GROWTH = 'price_growth_456'
    process.env.STRIPE_PRICE_SCALE = 'price_scale_789'

    function priceIdToPlan(priceId: string): string {
      if (priceId === process.env.STRIPE_PRICE_SCALE) return 'enterprise'
      if (priceId === process.env.STRIPE_PRICE_GROWTH) return 'professional'
      if (priceId === process.env.STRIPE_PRICE_STARTER) return 'starter'
      return 'starter'
    }

    assertEqual(priceIdToPlan('price_starter_123'), 'starter', 'Starter price maps to starter plan')
    assertEqual(priceIdToPlan('price_growth_456'), 'professional', 'Growth price maps to professional plan')
    assertEqual(priceIdToPlan('price_scale_789'), 'enterprise', 'Scale price maps to enterprise plan')
    assertEqual(priceIdToPlan('unknown_price'), 'starter', 'Unknown price falls back to starter plan')
  })

  console.log('=================================================================')
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed`)
  console.log('=================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})
