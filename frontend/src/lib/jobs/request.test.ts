import { describe, expect, test } from "vitest"
import {
  inPosting,
  jobsRequestOf,
  matchAnswerOf,
  MOST_PER_PROFILES,
  MOST_POSTING_CHARS,
  postingProblem,
  profilesAnswerOf,
  sendable,
} from "./request"

const source = (id = "r1") => ({ id, experience: ["Engineer · Stripe"], projects: [], skills: ["Go"], coursework: [] })
const profile = (id = "r1") => ({
  id,
  targets: ["Backend Engineer"],
  level: "mid",
  summary: "",
  domains: [],
  highlights: [],
  experience: ["Go"],
  projects: [],
  skills: [],
  coursework: [],
})

describe("a request to /api/jobs", () => {
  test("for profiles is read when it's what the page sends", () => {
    expect(jobsRequestOf({ kind: "profiles", resumes: [source()] })).toEqual({ kind: "profiles", resumes: [source()] })
  })

  test("for profiles isn't, with too many resumes, an id the page doesn't make, or a group that isn't lines", () => {
    const many = Array.from({ length: MOST_PER_PROFILES + 1 }, (_, index) => source(`r${index + 1}`))
    expect(jobsRequestOf({ kind: "profiles", resumes: many })).toBeNull()
    expect(jobsRequestOf({ kind: "profiles", resumes: [source("../../etc")] })).toBeNull()
    expect(jobsRequestOf({ kind: "profiles", resumes: [{ ...source(), skills: "Go" }] })).toBeNull()
    expect(jobsRequestOf({ kind: "profiles", resumes: [{ ...source(), skills: ["x".repeat(1_001)] }] })).toBeNull()
    expect(jobsRequestOf({ kind: "profiles", resumes: [] })).toBeNull()
  })

  test("for a match is read, with each profile cut to its limits", () => {
    const read = jobsRequestOf({ kind: "match", posting: "Go engineer", profiles: [{ ...profile(), skills: Array(40).fill("Go") }] })
    expect(read).toMatchObject({ kind: "match", posting: "Go engineer", profiles: [{ id: "r1", skills: ["Go"] }] })
  })

  test("for a match isn't, with no posting, one too long, or no profiles", () => {
    expect(jobsRequestOf({ kind: "match", posting: " ", profiles: [profile()] })).toBeNull()
    expect(jobsRequestOf({ kind: "match", posting: "x".repeat(MOST_POSTING_CHARS + 1), profiles: [profile()] })).toBeNull()
    expect(jobsRequestOf({ kind: "match", posting: "Go", profiles: [] })).toBeNull()
    expect(jobsRequestOf({ kind: "review", lines: [] })).toBeNull()
    expect(jobsRequestOf(null)).toBeNull()
  })
})

const POSTING = `Systems Engineer at Northwind Labs, Austin, TX. We build a low-latency storage engine.
You'll need proficiency in C++ and experience with Linux. Experience with concurrency is a strong plus, and LLVM is a plus.
We value clear writing and ownership.`

const job = (requirements: object[] = [{ name: "C++", tier: 1, keyword: "C++", quote: "proficiency in C++" }]) => ({
  isPosting: true,
  title: "Systems Engineer",
  company: "Northwind Labs",
  location: "Austin, TX",
  level: "mid",
  role: "systems/infrastructure",
  domain: "storage",
  requirements,
  advice: "",
})
const resume = (id: string, evidence: object[] = [{ strength: "good", place: "projects" }]) => ({
  id,
  evidence,
  projects: 80,
  experience: 140,
  domain: 50,
  narrative: 60,
  reason: "Close.",
})

describe("an answer with profiles", () => {
  test("has each one sent, cut to its limits", () => {
    const answer = { profiles: [profile("r1"), profile("r9"), { ...profile("r2"), targets: Array(9).fill("Engineer") }] }
    const read = profilesAnswerOf(answer, ["r1", "r2"])
    expect(Object.keys(read!)).toEqual(["r1", "r2"])
    expect(read!.r2.targets).toHaveLength(1)
  })

  test("is nothing when it leaves one out, or one isn't whole, rather than made up", () => {
    expect(profilesAnswerOf({ profiles: [profile("r1")] }, ["r1", "r2"])).toBeNull()
    const { domains: _, ...partial } = profile("r1")
    expect(profilesAnswerOf({ profiles: [partial] }, ["r1"])).toBeNull()
    expect(profilesAnswerOf({ profiles: [{ ...profile("r1"), level: "wizard" }] }, ["r1"])).toBeNull()
    expect(profilesAnswerOf({ profiles: [{ ...profile("r1"), highlights: [{ group: "hobbies", text: "x" }] }] }, ["r1"])).toBeNull()
    expect(profilesAnswerOf("busy", ["r1"])).toBeNull()
  })
})

describe("an answer with a match", () => {
  test("keeps what the posting says, each resume's evidence for each requirement, and ratings in range", () => {
    expect(matchAnswerOf({ job: job(), resumes: [resume("r1")] }, ["r1"], POSTING)).toEqual({
      isPosting: true,
      job: { ...job(), requirements: [{ name: "C++", tier: 1, keyword: "C++", quote: "proficiency in C++" }] },
      resumes: {
        r1: {
          evidence: [{ strength: "good", place: "projects" }],
          projects: 80,
          experience: 100,
          domain: 50,
          narrative: 60,
          reason: "Close.",
        },
      },
    })
  })

  test("drops a requirement whose quote isn't in the posting, with each resume's evidence for it", () => {
    const requirements = [
      { name: "Kubernetes", tier: 1, keyword: "Kubernetes", quote: "deep Kubernetes experience" },
      { name: "Concurrency", tier: 2, keyword: "concurrency", quote: "Experience with  CONCURRENCY" },
    ]
    const evidence = [
      { strength: "none", place: "nowhere" },
      { strength: "strong", place: "experience" },
    ]
    const read = matchAnswerOf({ job: job(requirements), resumes: [resume("r1", evidence)] }, ["r1"], POSTING)
    expect(read?.job.requirements.map((requirement) => requirement.name)).toEqual(["Concurrency"])
    expect(read?.resumes.r1.evidence).toEqual([{ strength: "strong", place: "experience" }])
  })

  test("leaves out a title, company or location the posting doesn't have", () => {
    const read = matchAnswerOf({ job: { ...job(), title: "Software Engineer", company: "ABC" }, resumes: [resume("r1")] }, ["r1"], POSTING)
    expect(read?.job).toMatchObject({ title: "", company: "", location: "Austin, TX" })
  })

  test("says when the text isn't a posting", () => {
    expect(matchAnswerOf({ job: { ...job([]), isPosting: false }, resumes: [resume("r1", [])] }, ["r1"], "RTX")?.isPosting).toBe(false)
  })

  test("is nothing when it isn't whole, rather than filled in", () => {
    const whole = { job: job(), resumes: [resume("r1")] }
    // A resume sent and left out.
    expect(matchAnswerOf(whole, ["r1", "r2"], POSTING)).toBeNull()
    // Evidence that isn't one for each requirement, or isn't a strength it knows.
    expect(matchAnswerOf({ ...whole, resumes: [resume("r1", [])] }, ["r1"], POSTING)).toBeNull()
    expect(matchAnswerOf({ ...whole, resumes: [resume("r1", [{ strength: "huge", place: "projects" }])] }, ["r1"], POSTING)).toBeNull()
    // A rating, a field or a tier missing or in the wrong shape.
    expect(matchAnswerOf({ ...whole, resumes: [{ ...resume("r1"), narrative: "high" }] }, ["r1"], POSTING)).toBeNull()
    const { company: _, ...noCompany } = job()
    expect(matchAnswerOf({ ...whole, job: noCompany }, ["r1"], POSTING)).toBeNull()
    expect(matchAnswerOf({ ...whole, job: job([{ name: "C++", tier: 9, keyword: "C++", quote: "C++" }]) }, ["r1"], POSTING)).toBeNull()
    expect(matchAnswerOf({ ...whole, job: { ...job(), role: "wizardry" } }, ["r1"], POSTING)).toBeNull()
    expect(matchAnswerOf({ resumes: [] }, ["r1"], POSTING)).toBeNull()
  })
})

describe("a posting", () => {
  test("of a word, a name or a line is too short to send, and one of a few sentences isn't", () => {
    for (const text of ["RTX", "ABC", "SDAS", "Software engineer at Google"]) expect(postingProblem(text)).toBe("short")
    expect(postingProblem(POSTING)).toBeNull()
  })

  test("has a phrase in it word for word, whatever the case and spacing", () => {
    expect(inPosting("proficiency in c++", POSTING)).toBe(true)
    expect(inPosting("Linux.", POSTING)).toBe(true)
    expect(inPosting("proficiency in Rust", POSTING)).toBe(false)
    expect(inPosting(" ", POSTING)).toBe(false)
  })
})

describe("a long resume", () => {
  test("is cut to what a request may hold, so it's sent in part rather than turned away", () => {
    const long = { experience: Array(200).fill("x".repeat(1_500)), projects: ["Atlas"], skills: [], coursework: [] }
    const sent = sendable(long)
    expect(sent.experience.every((line) => line.length <= 1_000)).toBe(true)
    expect(jobsRequestOf({ kind: "profiles", resumes: [{ id: "r1", ...sent }] })).not.toBeNull()
  })
})
