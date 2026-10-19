// The AI services the review can ask, tried in order: the next one only when
// one is busy, failing or slow. Azure OpenAI and OpenAI run the same model
// behind the same chat completions API, so one prompt and one answer schema
// serve both, and a visitor can't tell which one answered.

import { ANSWER_SCHEMA } from "./prompt"

export interface Provider {
  name: "azure" | "openai"
  /** What the page credits the notes to. */
  model: string
  url: string
  headers: Record<string, string>
  /** What the request names as the model: Azure takes its deployment's name. */
  deployment: string
}

export interface Asked {
  provider: Provider["name"]
  model: string
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

const MODEL = "gpt-5-mini"

/** The providers that have keys in `env`, in the order they're tried. */
export function providersOf(env: Record<string, string | undefined>): Provider[] {
  const providers: Provider[] = []
  const { AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT, OPENAI_API_KEY } = env
  if (AZURE_OPENAI_API_KEY && AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_DEPLOYMENT) {
    providers.push({
      name: "azure",
      model: MODEL,
      url: `${new URL(AZURE_OPENAI_ENDPOINT).origin}/openai/v1/chat/completions`,
      headers: { "api-key": AZURE_OPENAI_API_KEY },
      deployment: AZURE_OPENAI_DEPLOYMENT,
    })
  }
  if (OPENAI_API_KEY) {
    providers.push({
      name: "openai",
      model: MODEL,
      url: "https://api.openai.com/v1/chat/completions",
      headers: { authorization: `Bearer ${OPENAI_API_KEY}` },
      deployment: MODEL,
    })
  }
  return providers
}

export interface AskOptions {
  signal?: AbortSignal
  /** gpt-5-mini thinks before it answers; more is slower and costs more. */
  effort?: "minimal" | "low" | "medium" | "high"
}

/** Asks one provider for the notes; throws a ProviderError when it can't answer. */
export async function ask(provider: Provider, system: string, user: string, { signal, effort = "low" }: AskOptions = {}): Promise<Asked> {
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
        response_format: { type: "json_schema", json_schema: { name: "resume_notes", strict: true, schema: ANSWER_SCHEMA } },
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
    const detail = (await response.text().catch(() => "")).slice(0, 500)
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
    model: provider.model,
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
