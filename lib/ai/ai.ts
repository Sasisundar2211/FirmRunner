import { createAdminClient } from '@/lib/supabase/server'

export type AIProvider = 'gemini' | 'groq' | 'claude'

export interface GenerateOptions {
  firmId?: string
  clientId?: string
  agentType?: string
  maxTokens?: number
}

/**
 * Provider cascade: Gemini Flash → Groq Llama 3.3 70B → Claude Sonnet
 *
 * Override the cascade by setting NEXT_PUBLIC_AI_PROVIDER to 'gemini' | 'groq' | 'claude'.
 * All providers receive identical prompts — prompts must be provider-agnostic.
 */
export async function generateText(
  prompt: string,
  options: GenerateOptions = {}
): Promise<{ text: string; provider: AIProvider }> {
  const forced = process.env.NEXT_PUBLIC_AI_PROVIDER as AIProvider | undefined
  const providers: AIProvider[] = forced
    ? [forced]
    : ['gemini', 'groq', 'claude']

  let lastError: unknown

  for (const provider of providers) {
    const start = Date.now()
    try {
      const text = await callProvider(provider, prompt, options)
      const latencyMs = Date.now() - start

      // Log to agent_logs if context provided
      if (options.firmId && options.agentType) {
        await logAICall({
          firmId: options.firmId,
          clientId: options.clientId,
          agentType: options.agentType,
          provider,
          latencyMs,
        }).catch(() => {}) // non-blocking
      }

      return { text, provider }
    } catch (err) {
      lastError = err
      console.warn(`[AI] Provider ${provider} failed, trying next...`, err)
    }
  }

  throw new Error(`All AI providers failed. Last error: ${String(lastError)}`)
}

async function callProvider(
  provider: AIProvider,
  prompt: string,
  options: GenerateOptions
): Promise<string> {
  const maxTokens = options.maxTokens ?? 2048

  switch (provider) {
    case 'gemini': {
      const { GoogleGenerativeAI } = await import('@google/generative-ai')
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
      const result = await model.generateContent(prompt)
      return result.response.text()
    }

    case 'groq': {
      const Groq = (await import('groq-sdk')).default
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
      })
      return completion.choices[0]?.message?.content ?? ''
    }

    case 'claude': {
      const Anthropic = (await import('@anthropic-ai/sdk')).default
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      })
      const block = message.content[0]
      return block.type === 'text' ? block.text : ''
    }
  }
}

async function logAICall(params: {
  firmId: string
  clientId?: string
  agentType: string
  provider: AIProvider
  latencyMs: number
}) {
  const supabase = createAdminClient()
  await supabase.from('agent_logs').insert({
    firm_id: params.firmId,
    client_id: params.clientId ?? null,
    agent_type: params.agentType as import('@/lib/supabase/types').AgentType,
    status: 'pending',
    subject: `${params.agentType} AI call`,
    body: '',
    ai_provider: params.provider,
    ai_latency_ms: params.latencyMs,
    metadata: {},
  })
}
