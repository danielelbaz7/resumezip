import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { BUDGET_MS, wakeAll } from "@/lib/review/ai/providers"
import { POST } from "./route"

const LINES = [
  { id: "u1", text: "Marcus Bell", bullet: false },
  { id: "u2", text: "Responsible for working on backend services", bullet: true },
]
const NOTES = { notes: [{ tone: "red", line: "u2", quote: "Responsible for", title: "Vague", why: "No result.", suggestion: "Built [X]" }] }

let address = 0
function post(body: unknown = { lines: LINES }, headers: Record<string, string> = {}) {
  address++
  return POST(
    new Request("https://www.tryresumezip.com/api/review", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://www.tryresumezip.com",
        "x-forwarded-for": `10.0.0.${address}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  )
}

const answered = (content: unknown) =>
  Response.json({
    choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  })

const fetched = vi.fn<typeof fetch>()

beforeEach(() => {
  wakeAll()
  fetched.mockReset()
  vi.stubGlobal("fetch", fetched)
  vi.stubEnv("AZURE_OPENAI_API_KEY", "azure-key")
  vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com/")
  vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", "gpt-5.4-mini")
  vi.stubEnv("OPENAI_API_KEY", "openai-key")
  vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

test("asks Azure first, with the lines and the answer schema, and hands back its notes", async () => {
  fetched.mockResolvedValueOnce(answered(NOTES))
  const response = await post()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({ notes: NOTES.notes })
  const [url, init] = fetched.mock.calls[0]
  expect(url).toBe("https://example.openai.azure.com/openai/v1/chat/completions")
  const sent = JSON.parse(init!.body as string)
  expect(sent.model).toBe("gpt-5.4-mini")
  expect(sent.response_format.json_schema.strict).toBe(true)
  expect(sent.messages[1].content).toContain("[u2] • Responsible for working on backend services")
})

test("asks OpenAI when Azure is busy, and passes Azure over for a minute after", async () => {
  fetched.mockResolvedValueOnce(new Response("Too many requests", { status: 429 })).mockImplementation(async () => answered(NOTES))
  expect((await post()).status).toBe(200)
  expect(fetched.mock.calls.map(([url]) => new URL(url as string).host)).toEqual(["example.openai.azure.com", "api.openai.com"])
  expect((await post()).status).toBe(200)
  expect(new URL(fetched.mock.calls[2][0] as string).host).toBe("api.openai.com")
  // The same model as Azure's deployment.
  expect(JSON.parse(fetched.mock.calls[2][1]!.body as string).model).toBe("gpt-5.4-mini")
})

// Azure answers with an error once `ms` have gone by.
const slowFailure = (ms: number) => async () => {
  vi.setSystemTime(Date.now() + ms)
  return new Response("Gateway timeout", { status: 504 })
}

test("gives OpenAI only the time the function has left after a slow Azure", async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  const timeouts = vi.spyOn(AbortSignal, "timeout")
  fetched.mockImplementationOnce(slowFailure(40_000)).mockImplementation(async () => answered(NOTES))
  expect((await post()).status).toBe(200)
  expect(fetched).toHaveBeenCalledTimes(2)
  const [, openai] = timeouts.mock.calls.map(([ms]) => ms)
  expect(openai).toBeLessThanOrEqual(BUDGET_MS - 40_000)
})

test("doesn't ask OpenAI when too little time is left to answer, and says it's busy", async () => {
  vi.useFakeTimers({ toFake: ["Date"] })
  fetched.mockImplementationOnce(slowFailure(50_000)).mockImplementation(async () => answered(NOTES))
  const response = await post()
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: "busy" })
  expect(fetched).toHaveBeenCalledTimes(1)
})

test("a request turned away for its lines doesn't count toward the limit", async () => {
  fetched.mockImplementation(async () => answered(NOTES))
  const from = (body: unknown) => post(body, { "x-forwarded-for": "10.8.8.8" })
  for (let tried = 0; tried < 6; tried++) expect((await from({ lines: [] })).status).toBe(400)
  for (let review = 0; review < 6; review++) expect((await from({ lines: LINES })).status).toBe(200)
  expect((await from({ lines: LINES })).status).toBe(429)
})

test("says it's busy when no service answers", async () => {
  fetched.mockImplementation(async () => new Response("down", { status: 500 }))
  const response = await post()
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: "busy" })
})

test("turns away another site's pages, what the page wouldn't send, and too many reviews from one address", async () => {
  fetched.mockImplementation(async () => answered(NOTES))
  expect((await post(undefined, { origin: "https://elsewhere.example" })).status).toBe(403)
  expect((await post({ lines: [{ id: "x", text: "Hi", bullet: false }] })).status).toBe(400)
  expect((await post({ lines: Array.from({ length: 400 }, (_, index) => ({ id: `u${index}`, text: "a", bullet: false })) })).status).toBe(
    400,
  )
  expect(fetched).not.toHaveBeenCalled()

  const again = () => post(undefined, { "x-forwarded-for": "10.9.9.9" })
  for (let review = 0; review < 6; review++) expect((await again()).status).toBe(200)
  expect((await again()).status).toBe(429)
})

test("is off without keys", async () => {
  vi.stubEnv("AZURE_OPENAI_API_KEY", "")
  vi.stubEnv("OPENAI_API_KEY", "")
  expect((await post()).status).toBe(503)
  expect(fetched).not.toHaveBeenCalled()
})
