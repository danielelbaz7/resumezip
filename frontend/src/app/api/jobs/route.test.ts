import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { LinkError, readPosting } from "@/lib/jobs/fetchPosting"
import { matchAnswerOf } from "@/lib/jobs/request"
import { wakeAll } from "@/lib/review/ai/providers"
import { POST } from "./route"

// The page at a link is answered here, rather than fetched.
vi.mock("@/lib/jobs/fetchPosting", async (original) => ({
  ...(await original<typeof import("@/lib/jobs/fetchPosting")>()),
  readPosting: vi.fn(),
}))
const read = vi.mocked(readPosting)

const SOURCE = {
  id: "r1",
  experience: [{ title: "Engineer · Stripe", lines: ["Built a Rust ledger handling 2K payments a second"] }],
  projects: [],
  skills: ["Go"],
  coursework: [],
}
const PROFILE = {
  id: "r1",
  targets: ["Backend Engineer"],
  level: "mid",
  summary: "Builds backends.",
  domains: ["payments"],
  entries: [{ id: "x1", themes: ["payments infrastructure"], skills: ["Rust"], claim: "Rust ledger, 2K payments a second" }],
  experience: ["Rust"],
  projects: [],
  skills: ["Go"],
  coursework: [],
}
const POSTING = `Backend Engineer at Acme, Remote. We run the payments platform for small shops.
You must have production experience with Rust and know your way around SQL databases.
You'll own services end to end and work closely with the product team.`
const MATCH = {
  job: {
    isPosting: true,
    title: "Backend Engineer",
    company: "Acme",
    location: "Remote",
    level: "mid",
    role: "backend/product",
    domain: "payments",
    requirements: [{ name: "Rust", tier: 1, keyword: "Rust", quote: "production experience with Rust" }],
    advice: "",
    graduation: { asked: false, earliest: "", latest: "", quote: "" },
  },
  resumes: [
    {
      id: "r1",
      evidence: [{ strength: "strong", place: "experience" }],
      projects: 70,
      experience: 90,
      domain: 60,
      narrative: 80,
      reason: "You've shipped Rust.",
    },
  ],
}

let address = 0
function post(body: unknown, headers: Record<string, string> = {}) {
  address++
  return POST(
    new Request("https://www.tryresumezip.com/api/jobs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://www.tryresumezip.com",
        "x-forwarded-for": `10.1.0.${address}`,
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  )
}

const CLAUDE = "api.anthropic.com"
const OPENAI = "api.openai.com"
const AZURE = "example.openai.azure.com"

const answered = (url: string, content: unknown) =>
  new URL(url).host === CLAUDE
    ? Response.json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: [{ type: "text", text: JSON.stringify(content) }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      })
    : Response.json({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }] })

const fetched = vi.fn<typeof fetch>()
const asked = () => fetched.mock.calls.map(([url]) => new URL(String(url)).host)

beforeEach(() => {
  read.mockReset()
  wakeAll()
  fetched.mockReset()
  vi.stubGlobal("fetch", fetched)
  vi.stubEnv("AZURE_OPENAI_API_KEY", "azure-key")
  vi.stubEnv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com/")
  vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", "gpt-5.4-mini")
  vi.stubEnv("OPENAI_API_KEY", "openai-key")
  vi.stubEnv("ANTHROPIC_API_KEY", "claude-key")
  vi.stubEnv("GEMINI_API_KEY", "")
  vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

test("sums resumes up with Claude first, with the profiles' schema, and hands back each profile by its id", async () => {
  fetched.mockImplementation(async (url) => answered(String(url), { profiles: [PROFILE, { ...PROFILE, id: "r9" }] }))
  const response = await post({ kind: "profiles", resumes: [SOURCE] })
  expect(response.status).toBe(200)
  const { id: _, ...profile } = PROFILE
  // Each job keeps its title from the resume, and its claim, whose number is in its text.
  const entries = [
    {
      group: "experience",
      title: "Engineer · Stripe",
      themes: ["payments infrastructure"],
      skills: ["Rust"],
      claim: "Rust ledger, 2K payments a second",
    },
  ]
  expect(await response.json()).toEqual({ profiles: { r1: { ...profile, entries } } })
  expect(asked()).toEqual([CLAUDE])
  const sent = JSON.parse(fetched.mock.calls[0][1]!.body as string)
  expect(sent.output_config.format.schema.required).toEqual(["profiles"])
  expect(sent.messages[0].content).toContain('<resume id="r1">\nexperience:\n[x1] Engineer · Stripe\n  - Built a Rust ledger')
})

test("matches a posting to the profiles, and asks OpenAI and then Azure when the ones before can't answer", async () => {
  fetched.mockImplementation(async (url) =>
    new URL(String(url)).host === AZURE ? answered(String(url), MATCH) : Response.json({ error: "busy" }, { status: 529 }),
  )
  const response = await post({ kind: "match", posting: POSTING, profiles: [PROFILE] })
  expect(response.status).toBe(200)
  const { match } = await response.json()
  // In the AI's shape, graduation window and all, which the page reads back below.
  expect(match).toEqual({ job: MATCH.job, resumes: MATCH.resumes })
  // The page reads it as it reads the AI's answer, and finds the resume in it.
  expect(matchAnswerOf(match, ["r1"], POSTING)?.resumes).toEqual({
    r1: {
      evidence: [{ strength: "strong", place: "experience" }],
      projects: 70,
      experience: 90,
      domain: 60,
      narrative: 80,
      reason: "You've shipped Rust.",
    },
  })
  expect(asked()).toEqual([CLAUDE, OPENAI, AZURE])
  const sent = JSON.parse(fetched.mock.calls[2][1]!.body as string)
  expect(sent.response_format.json_schema.name).toBe("job_match")
  expect(sent.messages[1].content).toContain(`<posting>\n${POSTING}\n</posting>`)
})

test("doesn't send the AI a word or a name to make a job up from", async () => {
  for (const posting of ["RTX", "ABC", "SDAS"]) {
    const response = await post({ kind: "match", posting, profiles: [PROFILE] })
    expect(response.status).toBe(422)
    expect(await response.json()).toEqual({ error: "short" })
  }
  expect(fetched).not.toHaveBeenCalled()
})

test("says so when the AI reads the text as no job posting, and saves nothing made up", async () => {
  const notPosting = { job: { ...MATCH.job, isPosting: false, requirements: [] }, resumes: [{ ...MATCH.resumes[0], evidence: [] }] }
  fetched.mockImplementation(async (url) => answered(String(url), notPosting))
  const response = await post({ kind: "match", posting: POSTING, profiles: [PROFILE] })
  expect(response.status).toBe(422)
  expect(await response.json()).toEqual({ error: "not-posting" })
})

test("says the answer came back incomplete, rather than filling in what's missing", async () => {
  fetched.mockImplementation(async (url) => answered(String(url), { ...MATCH, resumes: [] }))
  expect(await (await post({ kind: "match", posting: POSTING, profiles: [PROFILE] })).json()).toEqual({ error: "answer" })
  fetched.mockImplementation(async (url) => answered(String(url), { profiles: [] }))
  expect(await (await post({ kind: "profiles", resumes: [SOURCE] })).json()).toEqual({ error: "answer" })
})

test("turns away another site's page, a request the page wouldn't send, and says when no AI is set up", async () => {
  expect((await post({ kind: "match", posting: "Rust", profiles: [PROFILE] }, { origin: "https://elsewhere.example" })).status).toBe(403)
  expect(await (await post({ kind: "profiles", resumes: [] })).json()).toEqual({ error: "request" })
  for (const key of ["AZURE_OPENAI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"]) vi.stubEnv(key, "")
  expect(await (await post({ kind: "profiles", resumes: [SOURCE] })).json()).toEqual({ error: "off" })
  expect(fetched).not.toHaveBeenCalled()
})

test("answers busy when no service can", async () => {
  fetched.mockImplementation(async () => Response.json({ error: "down" }, { status: 500 }))
  const response = await post({ kind: "profiles", resumes: [SOURCE] })
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ error: "busy" })
})

test("lets one browser make 20 requests in ten minutes", async () => {
  fetched.mockImplementation(async (url) => answered(String(url), { profiles: [PROFILE] }))
  const reviewer = { "x-reviewer": "0e7c1c2a-5b1f-4c3e-9a7d-2f4b6c8d0e1f" }
  for (let i = 0; i < 20; i++) expect((await post({ kind: "profiles", resumes: [SOURCE] }, reviewer)).status).toBe(200)
  expect(await (await post({ kind: "profiles", resumes: [SOURCE] }, reviewer)).json()).toEqual({ error: "limit" })
})

test("reads the posting at its link when that's all there is, and matches it", async () => {
  read.mockResolvedValue(POSTING)
  fetched.mockImplementation(async (url) => answered(String(url), MATCH))
  const response = await post({ kind: "match", link: "https://jobs.acme.com/backend", profiles: [PROFILE] })
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body).toMatchObject({ posting: POSTING, note: "" })
  expect(read).toHaveBeenCalledWith("https://jobs.acme.com/backend", expect.anything())
  expect(JSON.parse(fetched.mock.calls[0][1]!.body as string).messages[0].content).toContain(`<posting>\n${POSTING}\n</posting>`)
})

test("matches what was pasted and what the link has, together", async () => {
  read.mockResolvedValue(POSTING)
  fetched.mockImplementation(async (url) => answered(String(url), MATCH))
  const pasted = "Referred by a friend on the payments team, who says they want someone who has shipped Rust services and can mentor."
  const body = await (await post({ kind: "match", posting: pasted, link: "https://jobs.acme.com/backend", profiles: [PROFILE] })).json()
  expect(body.posting).toBe(`${pasted}\n\n${POSTING}`)
})

test("says the link couldn't be read when it's all there is, and matches the paste alone when there's one", async () => {
  read.mockRejectedValue(new LinkError("status"))
  expect(await (await post({ kind: "match", link: "https://www.linkedin.com/jobs/view/1", profiles: [PROFILE] })).json()).toEqual({
    error: "link",
  })
  expect(fetched).not.toHaveBeenCalled()
  fetched.mockImplementation(async (url) => answered(String(url), MATCH))
  const body = await (
    await post({ kind: "match", posting: POSTING, link: "https://www.linkedin.com/jobs/view/1", profiles: [PROFILE] })
  ).json()
  expect(body).toMatchObject({ posting: POSTING, note: "link-unread" })
})

test("reads a page with too little on it as no posting, rather than matching a word", async () => {
  read.mockResolvedValue("Sign in")
  expect(await (await post({ kind: "match", link: "https://jobs.acme.com/1", profiles: [PROFILE] })).json()).toEqual({ error: "link" })
  expect(fetched).not.toHaveBeenCalled()
})

test("won't fetch a link that isn't a public web address", async () => {
  for (const link of ["http://169.254.169.254/latest/meta-data/", "http://localhost:3000/", "file:///etc/passwd"]) {
    expect(await (await post({ kind: "match", link, profiles: [PROFILE] })).json()).toEqual({ error: "bad-link" })
  }
  expect(read).not.toHaveBeenCalled()
})
