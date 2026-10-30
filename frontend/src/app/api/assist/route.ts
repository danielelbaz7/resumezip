// The editor's AI assistant: passes the person's message, the conversation
// and the open resume to the first AI service that answers (as /api/review
// does), and hands back its reply and the changes it makes, which the editor
// checks and does (lib/assistant/apply.ts). Nothing is stored and nothing is
// logged but which service failed.

import { SYSTEM_PROMPT, userPrompt } from "@/lib/assistant/prompt"
import { requestOf } from "@/lib/assistant/request"
import { ASSIST_SCHEMA } from "@/lib/assistant/schema"
import { isObject } from "@/lib/isObject"
import { limiter, senderOf } from "@/lib/review/ai/limit"
import { askAny, providersOf } from "@/lib/review/ai/providers"

// askAny keeps every service it asks within its BUDGET_MS, under this.
export const maxDuration = 60

// Messages one browser may send in a window: a conversation is many short asks, where a review is one.
const allowed = limiter(40, 10 * 60_000)

const answer = (status: number, body: object) => Response.json(body, { status, headers: { "cache-control": "no-store" } })

export async function POST(request: Request): Promise<Response> {
  // Only the site's own pages: another site's page can't spend the site's credits through a visitor's browser.
  const origin = request.headers.get("origin")
  if (origin && (!URL.canParse(origin) || new URL(origin).host !== new URL(request.url).host)) return answer(403, { error: "elsewhere" })

  const providers = providersOf(process.env)
  if (providers.length === 0) return answer(503, { error: "off" })

  const asked = requestOf(await request.json().catch(() => null))
  if (!asked) return answer(400, { error: "lines" })

  // On `npm run dev` every request comes from one person: the one testing.
  if (process.env.NODE_ENV !== "development" && !allowed(senderOf(request))) return answer(429, { error: "limit" })

  try {
    const { answer: said } = await askAny(providers, SYSTEM_PROMPT, userPrompt(asked), {
      signal: request.signal,
      answer: { name: "resume_changes", schema: ASSIST_SCHEMA },
      feature: "AI assistant",
    })
    if (!isObject(said) || typeof said.reply !== "string" || !Array.isArray(said.actions)) return answer(503, { error: "busy" })
    return answer(200, { reply: said.reply, actions: said.actions })
  } catch {
    return answer(503, { error: "busy" })
  }
}
