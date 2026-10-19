import { afterEach, expect, test, vi } from "vitest"
import { askForNotes } from "./askForNotes"

const LIMIT = "You’ve asked for a lot of AI notes in a short time. Try again in a few minutes."

afterEach(() => {
  vi.unstubAllGlobals()
})

test("says the limit was reached when the firewall turns a review away", async () => {
  // Vercel's rate limit answers before the route runs, without the route's { error } body.
  vi.stubGlobal("fetch", async () => new Response("Too Many Requests", { status: 429, headers: { "content-type": "text/plain" } }))
  await expect(askForNotes([])).rejects.toThrow(LIMIT)
})

test("says the limit was reached when the route turns a review away", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ error: "limit" }, { status: 429 }))
  await expect(askForNotes([])).rejects.toThrow(LIMIT)
})
