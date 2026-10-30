// The AI review: it runs on a server, as /api/assist does, because the AI
// services' keys can't be sent to visitors. It passes the resume's
// printed lines to the first AI service that answers and hands back its
// notes. Nothing is stored and nothing is logged but which service failed.

import { limiter, senderOf } from "@/lib/review/ai/limit"
import { SYSTEM_PROMPT, userPrompt } from "@/lib/review/ai/prompt"
import { askAny, providersOf } from "@/lib/review/ai/providers"
import { linesOf } from "@/lib/review/ai/request"

// Waiting on one service and then another can take most of a minute: askAny
// keeps them all within its BUDGET_MS, under this.
export const maxDuration = 60

// Reviews one browser may ask for in a window, or one address when the page
// names no browser (see reviewer.ts).
const allowed = limiter(6, 10 * 60_000)

const answer = (status: number, body: object) => Response.json(body, { status, headers: { "cache-control": "no-store" } })

export async function POST(request: Request): Promise<Response> {
  // Only the site's own pages: another site's page can't spend the site's credits through a visitor's browser.
  const origin = request.headers.get("origin")
  if (origin && (!URL.canParse(origin) || new URL(origin).host !== new URL(request.url).host)) return answer(403, { error: "elsewhere" })

  const providers = providersOf(process.env)
  if (providers.length === 0) return answer(503, { error: "off" })

  // Checked before the limit, so a resume turned away as too long doesn't use up its sender's reviews.
  const lines = linesOf(await request.json().catch(() => null))
  if (!lines) return answer(400, { error: "lines" })

  // On `npm run dev` every request comes from one person: the one testing.
  if (process.env.NODE_ENV !== "development" && !allowed(senderOf(request))) return answer(429, { error: "limit" })

  try {
    const { answer: notes } = await askAny(providers, SYSTEM_PROMPT, userPrompt(lines), { signal: request.signal })
    return answer(200, { notes: (notes as { notes?: unknown }).notes ?? [] })
  } catch {
    return answer(503, { error: "busy" })
  }
}
