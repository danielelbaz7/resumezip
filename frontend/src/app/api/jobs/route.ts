// The Jobs tab's AI requests, a sibling of /api/review: the same AI services
// in the same order (providersOf, askAny), and the same guard rails. It sums
// resumes up into profiles, or matches a job posting to profiles. Nothing is
// stored and nothing is logged but which service failed.

import { MATCH_ANSWER, MATCH_PROMPT, matchPrompt, PROFILES_ANSWER, PROFILES_PROMPT, profilesPrompt } from "@/lib/jobs/prompt"
import { jobsRequestOf, matchAnswerOf, profilesAnswerOf } from "@/lib/jobs/request"
import { askAny, providersOf } from "@/lib/review/ai/providers"
import { REVIEWER_HEADER, reviewerOf } from "@/lib/review/ai/reviewer"

// askAny keeps every service within its BUDGET_MS, under this.
export const maxDuration = 60

// Requests one browser may make in a window, or one address when the page
// names no browser. One job takes a match, and a profiles request per five
// resumes changed since the last. Kept in this server instance's memory, as
// /api/review's limit is: a brake, not a wall.
const MOST_REQUESTS = 20
const WINDOW_MS = 10 * 60_000
const asked = new Map<string, number[]>()

function allowed(sender: string, now = Date.now()): boolean {
  const recent = (asked.get(sender) ?? []).filter((time) => now - time < WINDOW_MS)
  if (recent.length >= MOST_REQUESTS) return false
  asked.set(sender, [...recent, now])
  if (asked.size > 10_000) for (const [key, times] of asked) if (times.every((time) => now - time >= WINDOW_MS)) asked.delete(key)
  return true
}

const answer = (status: number, body: object) => Response.json(body, { status, headers: { "cache-control": "no-store" } })

export async function POST(request: Request): Promise<Response> {
  // Only the site's own pages: another site's page can't spend the site's credits through a visitor's browser.
  const origin = request.headers.get("origin")
  if (origin && (!URL.canParse(origin) || new URL(origin).host !== new URL(request.url).host)) return answer(403, { error: "elsewhere" })

  const providers = providersOf(process.env)
  if (providers.length === 0) return answer(503, { error: "off" })

  // Checked before the limit, so a request turned away as too long doesn't use up its sender's.
  const asking = jobsRequestOf(await request.json().catch(() => null))
  if (!asking) return answer(400, { error: "request" })

  const reviewer = reviewerOf(request.headers.get(REVIEWER_HEADER))
  const sender = reviewer ? `reviewer ${reviewer}` : `address ${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"}`
  // On `npm run dev` every request comes from one person: the one testing.
  if (process.env.NODE_ENV !== "development" && !allowed(sender)) return answer(429, { error: "limit" })

  const options = { signal: request.signal, feature: "Jobs" }
  try {
    if (asking.kind === "profiles") {
      const { answer: given } = await askAny(providers, PROFILES_PROMPT, profilesPrompt(asking.resumes), {
        ...options,
        answer: PROFILES_ANSWER,
      })
      return answer(200, {
        profiles: profilesAnswerOf(
          given,
          asking.resumes.map((resume) => resume.id),
        ),
      })
    }
    const { answer: given } = await askAny(providers, MATCH_PROMPT, matchPrompt(asking.posting, asking.profiles), {
      ...options,
      answer: MATCH_ANSWER,
    })
    const match = matchAnswerOf(
      given,
      asking.profiles.map((profile) => profile.id),
    )
    return match ? answer(200, { match }) : answer(503, { error: "busy" })
  } catch {
    return answer(503, { error: "busy" })
  }
}
