import { CopilotRuntime, EmptyAdapter, copilotRuntimeNextJSAppRouterEndpoint } from '@copilotkit/runtime'
import { BuiltInAgent } from '@copilotkitnext/agent'
import { createOpenAI } from '@ai-sdk/openai'

if (!process.env.OPENAI_API_KEY && process.env.GROQ_API_KEY) {
  process.env.OPENAI_API_KEY = process.env.GROQ_API_KEY
}

if (!process.env.OPENAI_BASE_URL) {
  process.env.OPENAI_BASE_URL = 'https://api.groq.com/openai/v1'
}

const modelIdRaw = (process.env.GROQ_MODEL || '').trim() || 'llama-3.3-70b-versatile'
const modelId = modelIdRaw.replace(/^openai[/:]/, '').replace(/^groq[/:]/, '')

const groq = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL,
})
const model = groq.chat(modelId)

const flamePrompt =
  'You are Flame, an assistant for the Flame Sales & Expense Tracker.\n' +
  'Your goal is to help users manage organizations, projects, cycles, sales, expenses, invoices, receipts, customers, vendors, categories, payment methods, teams, and reports.\n' +
  'Ask clarifying questions when required fields are missing.\n' +
  'Prefer using tools to fetch or update real data instead of guessing.\n' +
  'When asked to show the UI (organizations, dashboard, reports, projects, expenses), call the appropriate show_* tool (use the canonical US spelling, e.g. show_organizations) exactly once, then respond with a short confirmation.\n' +
  'Be concise and action-oriented.'

const flameAgent = new BuiltInAgent({
  model,
  prompt: flamePrompt,
  maxSteps: 2,
})

const copilotRuntime = new CopilotRuntime({
  agents: {
    Flame: flameAgent,
    default: flameAgent,
  },
})

export const copilotkitHandler = copilotRuntimeNextJSAppRouterEndpoint({
  runtime: copilotRuntime,
  serviceAdapter: new EmptyAdapter(),
  endpoint: '/api/copilotkit',
})
