import { afterEach, expect, test, vi } from "vitest"
import { askForNotes } from "./askForNotes"
import { aiPaused } from "./paused"

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

test("a limit pauses the AI notes for the tab until it answers again", async () => {
  const items = new Map<string, string>()
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  })
  vi.stubGlobal("fetch", async () => new Response("Too Many Requests", { status: 429 }))
  await expect(askForNotes([])).rejects.toMatchObject({ reason: "limit" })
  expect(aiPaused()).toBe(true)
  expect(aiPaused(Date.now() + 11 * 60_000)).toBe(false)

  vi.stubGlobal("fetch", async () => Response.json({ notes: [] }))
  await askForNotes([])
  expect(aiPaused()).toBe(false)
})

test("an error name the route doesn't use isn't taken for one", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ error: "toString" }, { status: 500 }))
  await expect(askForNotes([])).rejects.toMatchObject({ reason: "other" })
})
