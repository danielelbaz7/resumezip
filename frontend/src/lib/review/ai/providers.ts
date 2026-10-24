// The AI services the review can ask, tried in order: the next one only when
// one is busy, failing or slow. Claude goes first because its API credit is
// renewed each month and lost if it isn't spent; OpenAI's credit expires
// before Azure's, so OpenAI comes next. Azure OpenAI and OpenAI run the same
// model behind the same chat completions API. All three take one prompt and
// one answer schema: the AI notes', unless another feature (the Jobs tab) asks
// with its own. On `npm run dev`, Gemini can stand in for the first two.

import Anthropic from "@anthropic-ai/sdk"
import { ANSWER_SCHEMA } from "./prompt"

interface ClaudeProvider {
  name: "claude"
  apiKey: string
  model: string
}

/** A service behind OpenAI's chat completions API, or Gemini's copy of it. */
interface ChatProvider {
  name: "openai" | "azure" | "gemini"
  url: string
  headers: Record<string, string>
  /** What the request names as the model: Azure takes its deployment's name. */
  deployment: string
}

export type Provider = ClaudeProvider | ChatProvider

export interface Asked {
  provider: Provider["name"]
  answer: unknown
  ms: number
  usage: { input: number; output: number; reasoning: number } | null
}

export class ProviderError extends Error {
  constructor(
    readonly provider: Provider["name"],
    readonly status: number | null,
    message: string,
  ) {
    super(message)
  }
}

const CLAUDE_MODEL = "claude-sonnet-5-5"
// Azure's deployment runs the same model (AZURE_OPENAI_DEPLOYMENT), so either one's notes read alike.
const OPENAI_MODEL = "gpt-5.4-mini"
// The free tier's Flash-Lite allows 500 reviews a day; Flash only 20.
const GEMINI_MODEL = "gemini-3.5-flash-lite"

/** The providers that have keys in `env`, in the order they're tried. */
export function providersOf(env: Record<string, string | undefined>): Provider[] {
  const { ANTHROPIC_API_KEY, OPENAI_API_KEY, AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT, GEMINI_API_KEY } = env
  const azure: Provider[] =
    AZURE_OPENAI_API_KEY && AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_DEPLOYMENT
      ? [
          {
            name: "azure",
            url: `${new URL(AZURE_OPENAI_ENDPOINT).origin}/openai/v1/chat/completions`,
            headers: { "api-key": AZURE_OPENAI_API_KEY },
            deployment: AZURE_OPENAI_DEPLOYMENT,
          },
        ]
      : []
  // Google's free tier keeps what it's sent and may have people read it, and
  // the site doesn't say it sends resumes to Google: Gemini is only for trying
  // the review on your own machine. There, with GEMINI_API_KEY set, it's asked
  // first so testing spends no credit, and Azure, which has the most credit,
  // only when Gemini is busy or its free day is used up.
  if (GEMINI_API_KEY && env.NODE_ENV === "development") {
    return [
      {
        name: "gemini",
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        headers: { authorization: `Bearer ${GEMINI_API_KEY}` },
        deployment: GEMINI_MODEL,
      },
      ...azure,
    ]
  }
  const providers: Provider[] = []
  // A key made in a workspace: Anthropic turns away an organization-wide key unless the request names a workspace.
  if (ANTHROPIC_API_KEY) providers.push({ name: "claude", apiKey: ANTHROPIC_API_KEY, model: CLAUDE_MODEL })
  if (OPENAI_API_KEY) {
    providers.push({
      name: "openai",
      url: "https://api.openai.com/v1/chat/completions",
      headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
      deployment: OPENAI_MODEL,
    })
  }
  return [...providers, ...azure]
}

export interface AskOptions {
  signal?: AbortSignal
  /** How much the model thinks before it answers; more is slower and costs more. Claude has no "none" and is asked for "low". */
  effort?: "none" | "low" | "medium" | "high"
  /** The strict JSON Schema the answer must follow, and its name for OpenAI's API; the AI notes' by default. */
  answer?: { name: string; schema: { [key: string]: unknown } }
  /** Who's asking, for the log line when a provider fails. */
  feature?: string
}

const NOTES_ANSWER = { name: "resume_notes", schema: ANSWER_SCHEMA }

/** Asks one provider for the notes; throws a ProviderError when it can't answer. */
export function ask(provider: Provider, system: string, user: string, options: AskOptions = {}): Promise<Asked> {
  return provider.name === "claude" ? askClaude(provider, system, user, options) : askChat(provider, system, user, options)
}

async function askClaude(
  provider: ClaudeProvider,
  system: string,
  user: string,
  { signal, effort = "low", answer: shape = NOTES_ANSWER }: AskOptions,
): Promise<Asked> {
  const started = Date.now()
  // Made per request so it takes the fetch in place now. No retries: askAny moves on to the next provider instead.
  const client = new Anthropic({ apiKey: provider.apiKey, maxRetries: 0 })
  let message: Anthropic.Message
  try {
    message = await client.messages.create(
      {
        model: provider.model,
        // Thinking counts toward this too.
        max_tokens: 12_000,
        system,
        messages: [{ role: "user", content: user }],
        output_config: { effort: effort === "none" ? "low" : effort, format: { type: "json_schema", schema: shape.schema } },
      },
      { signal },
    )
  } catch (error) {
    if (signal?.aborted) throw error
    // The error's message is the API's reason (credit, rate limit, bad request); it never holds the key.
    if (error instanceof Anthropic.APIError) throw new ProviderError(provider.name, error.status ?? null, error.message)
    throw new ProviderError(provider.name, null, `couldn't reach it: ${String(error)}`)
  }
  const text = message.content.find((block) => block.type === "text")?.text
  // A refusal or a cut-off answer doesn't follow the schema.
  if (message.stop_reason !== "end_turn" || !text)
    throw new ProviderError(provider.name, 200, `no answer (${message.stop_reason ?? "unknown"})`)
  let answer: unknown
  try {
    answer = JSON.parse(text)
  } catch {
    throw new ProviderError(provider.name, 200, "the answer isn't JSON")
  }
  const { usage } = message
  return {
    provider: provider.name,
    answer,
    ms: Date.now() - started,
    usage: { input: usage.input_tokens, output: usage.output_tokens, reasoning: usage.output_tokens_details?.thinking_tokens ?? 0 },
  }
}

async function askChat(
  provider: ChatProvider,
  system: string,
  user: string,
  { signal, effort = "low", answer: shape = NOTES_ANSWER }: AskOptions,
): Promise<Asked> {
  const started = Date.now()
  let response: Response
  try {
    response = await fetch(provider.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...provider.headers },
      body: JSON.stringify({
        model: provider.deployment,
        messages: [
          { role: "developer", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_schema", json_schema: { name: shape.name, strict: true, schema: shape.schema } },
        reasoning_effort: effort,
        // Thinking counts toward this too.
        max_completion_tokens: 12_000,
      }),
      signal,
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ProviderError(provider.name, null, `couldn't reach it: ${String(error)}`)
  }
  if (!response.ok) {
    // The body says why (quota, bad request); it never holds the key.
    // Long enough for Gemini's quota details, which come after its message.
    const detail = (await response.text().catch(() => "")).slice(0, 2_000)
    throw new ProviderError(provider.name, response.status, detail)
  }
  const body = (await response.json()) as {
    choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } }
  }
  const choice = body.choices?.[0]
  const content = choice?.message?.content
  if (!content) throw new ProviderError(provider.name, response.status, `no answer (${choice?.finish_reason ?? "unknown"})`)
  let answer: unknown
  try {
    answer = JSON.parse(content)
  } catch {
    throw new ProviderError(provider.name, response.status, `the answer isn't JSON (${choice?.finish_reason ?? "unknown"})`)
  }
  const usage = body.usage
  return {
    provider: provider.name,
    answer,
    ms: Date.now() - started,
    usage: usage
      ? {
          input: usage.prompt_tokens ?? 0,
          output: usage.completion_tokens ?? 0,
          reasoning: usage.completion_tokens_details?.reasoning_tokens ?? 0,
        }
      : null,
  }
}

// How long one provider gets before the next is asked: a review takes 5–30 s.
const PATIENCE_MS = 35_000
// How long every provider together gets: under the route's maxDuration (60 s),
// with time left to answer "busy" before the platform cuts the function off.
export const BUDGET_MS = 55_000
// Less time than this left, and the next provider isn't asked: it couldn't
// finish, and its tokens would be paid for nothing.
const LEAST_MS = 10_000
// How long a provider that failed is passed over, so a visitor doesn't wait on one that's busy or down.
const REST_MS = 60_000
// How long one whose credit, spend limit or free day has run out is passed
// over: it won't answer again until the credit is renewed, the limit raised or
// the day over. Gemini says which quota ran out: "PerDay" is the free day, and
// "PerMinute" only needs the usual minute.
const SPENT_MS = 60 * 60_000
const spent = (error: ProviderError) => /credit balance is too low|usage limits|insufficient_quota|PerDay/i.test(error.message)
const resting = new Map<Provider["name"], number>()

/**
 * Asks each provider in turn until one answers: the next when one is busy,
 * failing or slower than PATIENCE_MS, passing over one that failed in the
 * last minute (or ran out of credit in the last hour) unless every one has.
 * All of them share BUDGET_MS. Throws the last ProviderError when none answers.
 */
export async function askAny(providers: readonly Provider[], system: string, user: string, options: AskOptions = {}): Promise<Asked> {
  const now = Date.now()
  const deadline = now + BUDGET_MS
  const awake = providers.filter((provider) => (resting.get(provider.name) ?? 0) <= now)
  let last: ProviderError | null = null
  for (const provider of awake.length > 0 ? awake : providers) {
    const left = deadline - Date.now()
    if (left < LEAST_MS) break
    const timeout = AbortSignal.timeout(Math.min(PATIENCE_MS, left))
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    try {
      const asked = await ask(provider, system, user, { ...options, signal })
      resting.delete(provider.name)
      return asked
    } catch (error) {
      if (options.signal?.aborted) throw error
      last = error instanceof ProviderError ? error : new ProviderError(provider.name, null, timeout.aborted ? "too slow" : String(error))
      resting.set(provider.name, Date.now() + (spent(last) ? SPENT_MS : REST_MS))
      // Never the body: it can quote the request, and the request is someone's resume.
      console.warn(`${options.feature ?? "AI review"}: ${provider.name} didn't answer (${last.status ?? "no status"})`)
    }
  }
  throw last ?? new Error("no provider has keys")
}

/** For tests: every provider awake again. */
export function wakeAll() {
  resting.clear()
}
