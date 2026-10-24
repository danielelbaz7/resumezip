import { describe, expect, test } from "vitest"
import { jobsRequestOf, matchAnswerOf, MOST_PER_PROFILES, MOST_POSTING_CHARS, profilesAnswerOf, sendable } from "./request"

const source = (id = "r1") => ({ id, experience: ["Engineer · Stripe"], projects: [], skills: ["Go"], coursework: [] })
const profile = (id = "r1") => ({
  id,
  targets: ["Backend Engineer"],
  level: "mid",
  summary: "",
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

describe("an answer from /api/jobs", () => {
  test("with profiles keeps only those for ids that were sent, once each", () => {
    const answer = { profiles: [profile("r1"), profile("r9"), { ...profile("r1"), summary: "second" }, "junk"] }
    expect(Object.keys(profilesAnswerOf(answer, ["r1", "r2"]))).toEqual(["r1"])
    expect(profilesAnswerOf(answer, ["r1"]).r1.summary).toBe("")
  })

  test("with a match lines each resume's evidence up with the requirements, none where one is missing", () => {
    const answer = {
      job: {
        title: "Engineer",
        company: "Acme",
        location: "",
        level: "senior",
        role: "quant/HPC",
        domain: "trading",
        requirements: [{ name: "C++", tier: 1, keyword: "C++" }, { name: "SIMD", tier: 9 }, { name: "" }],
        advice: "Lead with the order book project.",
      },
      resumes: [
        {
          id: "r1",
          evidence: [{ strength: "good", place: "projects" }],
          projects: 80,
          experience: 140,
          domain: 50,
          narrative: 60,
          reason: "Close.",
        },
        { id: "r7", evidence: [], projects: 0, experience: 0, domain: 0, narrative: 0, reason: "" },
      ],
    }
    expect(matchAnswerOf(answer, ["r1"])).toEqual({
      job: {
        title: "Engineer",
        company: "Acme",
        location: "",
        level: "senior",
        role: "quant/HPC",
        domain: "trading",
        requirements: [
          { name: "C++", tier: 1, keyword: "C++" },
          { name: "SIMD", tier: 3, keyword: "" },
        ],
        advice: "Lead with the order book project.",
      },
      resumes: {
        r1: {
          evidence: [
            { strength: "good", place: "projects" },
            { strength: "none", place: "nowhere" },
          ],
          projects: 80,
          experience: 100,
          domain: 50,
          narrative: 60,
          reason: "Close.",
        },
      },
    })
  })

  test("with a kind of role it doesn't know reads it as other", () => {
    expect(matchAnswerOf({ job: { role: "wizardry" }, resumes: [] }, [])?.job.role).toBe("other")
  })

  test("with no job is nothing", () => {
    expect(matchAnswerOf({ resumes: [] }, ["r1"])).toBeNull()
    expect(matchAnswerOf("busy", ["r1"])).toBeNull()
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
