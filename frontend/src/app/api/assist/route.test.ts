import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { wakeAll } from "@/lib/review/ai/providers"
import { POST } from "./route"

const REQUEST = {
  messages: [{ from: "person", text: "Leave out my oldest job" }],
  resume: { id: "master", view: { sections: { Work: { entries: [{ id: 1, companyName: "Babbage & Co" }] } } } },
  others: [{ id: "other", name: "Frontend" }],
}
const ANSWER = {
  actions: [{ op: "leave_out_entry", resume: null, section: "Work", entry: 1, fields: [], value: null, position: null, targets: [] }],
  reply: "Left out Babbage & Co.",
}

let address = 0
function post(body: unknown = REQUEST) {
  address++
  return POST(
    new Request("https://www.tryresumezip.com/api/assist", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://www.tryresumezip.com", "x-forwarded-for": `10.1.0.${address}` },
      body: JSON.stringify(body),
    }),
  )
}

const claudeSays = (content: unknown) =>
  Response.json({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-5-5",
    content: [{ type: "text", text: JSON.stringify(content) }],
    stop_reason: "end_turn",
    usage: { input_tokens: 1, output_tokens: 1 },
  })

const fetched = vi.fn<typeof fetch>()

beforeEach(() => {
  wakeAll()
  fetched.mockReset()
  vi.stubGlobal("fetch", fetched)
  vi.stubEnv("ANTHROPIC_API_KEY", "claude-key")
  vi.stubEnv("GEMINI_API_KEY", "")
  vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

test("sends the conversation and the resume with the changes' schema, and hands back the reply and the changes", async () => {
  fetched.mockResolvedValue(claudeSays(ANSWER))
  const response = await post()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual(ANSWER)
  const sent = JSON.parse(fetched.mock.calls[0][1]!.body as string)
  expect(sent.output_config.format.schema.required).toEqual(["actions", "reply"])
  const prompt: string = sent.messages[0].content
  expect(prompt).toContain('"companyName":"Babbage & Co"')
  expect(prompt).toContain("Frontend (id: other)")
  expect(prompt).toContain("Person: Leave out my oldest job")
})

test("turns away a request that doesn't end with the person's message, or comes from another site", async () => {
  expect((await post({ ...REQUEST, messages: [{ from: "assistant", text: "Hi" }] })).status).toBe(400)
  expect((await post({ ...REQUEST, resume: { id: "master", view: "x".repeat(10) } })).status).toBe(400)
  const elsewhere = await POST(
    new Request("https://www.tryresumezip.com/api/assist", {
      method: "POST",
      headers: { origin: "https://elsewhere.example" },
      body: JSON.stringify(REQUEST),
    }),
  )
  expect(elsewhere.status).toBe(403)
  expect(fetched).not.toHaveBeenCalled()
})

test("says it's busy when the AI's answer isn't a reply with changes", async () => {
  fetched.mockResolvedValue(claudeSays({ notes: [] }))
  const response = await post()
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: "busy" })
})

test("says it's off with no AI keys", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "")
  expect(await (await post()).json()).toEqual({ error: "off" })
})
