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

test("names this browser the same way on every review, so the route can count per browser", async () => {
  const items = new Map<string, string>()
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  })
  const sent: (string | null)[] = []
  vi.stubGlobal("fetch", async (_: string, init: RequestInit) => {
    sent.push(new Headers(init.headers).get("x-reviewer"))
    return Response.json({ notes: [] })
  })
  await askForNotes([])
  await askForNotes([])
  expect(sent[0]).toMatch(/^[0-9a-f-]{36}$/)
  expect(sent[1]).toBe(sent[0])
})

test("asks without naming the browser when storage is refused", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new DOMException("denied", "SecurityError")
    },
  })
  const fetched = vi.fn(async (_: string, _init: RequestInit) => Response.json({ notes: [] }))
  vi.stubGlobal("fetch", fetched)
  await askForNotes([])
  expect(new Headers(fetched.mock.calls[0][1].headers).has("x-reviewer")).toBe(false)
})

test("an error name the route doesn't use isn't taken for one", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ error: "toString" }, { status: 500 }))
  await expect(askForNotes([])).rejects.toMatchObject({ reason: "other" })
})
