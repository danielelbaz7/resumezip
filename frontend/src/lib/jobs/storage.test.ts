import { describe, expect, test } from "vitest"
import { memoryStorage } from "@/lib/memoryStorage"
import {
  forgetProfiles,
  JOBS_KEY,
  keptJobs,
  MOST_JOBS,
  PROFILE_PREFIX,
  readJobs,
  readSavedProfile,
  saveJobs,
  saveProfile,
  type Job,
} from "./storage"

const job = (id: string, savedAt: string, status: Job["status"] = "saved"): Job => ({
  id,
  savedAt,
  link: "",
  posting: "Go engineer",
  title: "Engineer",
  company: "Acme",
  location: "",
  level: "",
  role: "backend/product",
  domain: "payments",
  requirements: [{ name: "Go", tier: 1, keyword: "Go", quote: "Go engineer" }],
  advice: "",
  graduation: { earliest: "2026-12", latest: "2027-06", quote: "graduating between December 2026 and June 2027" },
  matches: [
    {
      resumeId: "a",
      resumeTitle: "Backend",
      score: 80,
      parts: { core: 100, projects: 70, experience: 80, domain: 60, keywords: 100, narrative: 75 },
      missedScreening: 0,
      evidence: [{ strength: "strong", place: "experience", examples: 2, onResume: true }],
      graduation: "fits",
      graduationDate: "2027-05",
      found: { experience: 1, projects: 0, skills: 0, coursework: 0, missing: 0 },
      matched: ["Go"],
      missing: [],
      reason: "Fits.",
    },
  ],
  chosenResumeId: null,
  status,
  appliedAt: null,
})

describe("the saved jobs", () => {
  test("come back as they were saved, newest first", () => {
    const storage = memoryStorage()
    const jobs = [job("old", "2026-01-01T00:00:00Z"), job("new", "2026-06-01T00:00:00Z", "applied")]
    expect(saveJobs(storage, jobs)).toBe(true)
    expect(readJobs(storage)).toEqual([jobs[1], jobs[0]])
  })

  test("drop records in the wrong shape and read the rest defensively", () => {
    const storage = memoryStorage({
      [JOBS_KEY]: JSON.stringify({
        version: 1,
        jobs: [
          "junk",
          { id: "no date" },
          { id: "odd", savedAt: "2026-02-01T00:00:00Z", status: "ghosted", matches: [{ resumeId: "a", score: 900 }, { score: 1 }] },
        ],
      }),
    })
    const [read] = readJobs(storage)
    expect(readJobs(storage)).toHaveLength(1)
    expect(read).toMatchObject({ id: "odd", status: "saved", title: "", requirements: [], chosenResumeId: null })
    expect(read.matches).toEqual([expect.objectContaining({ resumeId: "a", score: 100, parts: null, evidence: [] })])
  })

  test("matched before the score was layered read on: must-haves as tier 1, the rest tier 3, and no layers", () => {
    const storage = memoryStorage({
      [JOBS_KEY]: JSON.stringify({
        version: 1,
        jobs: [
          {
            id: "before",
            savedAt: "2026-03-01T00:00:00Z",
            requirements: [
              { name: "Go", must: true },
              { name: "Kafka", must: false },
            ],
            matches: [{ resumeId: "a", score: 60, parts: { requirements: 50, role: 80, level: 100, overall: 70 } }],
          },
        ],
      }),
    })
    const [read] = readJobs(storage)
    expect(read.requirements).toEqual([
      { name: "Go", tier: 1, keyword: "", quote: "" },
      { name: "Kafka", tier: 3, keyword: "", quote: "" },
    ])
    expect(read).toMatchObject({ role: "other", domain: "", advice: "", graduation: null })
    expect(read.matches[0]).toMatchObject({ score: 60, parts: null, missedScreening: 0 })
  })

  test("are none when there are none, or what's saved isn't JSON", () => {
    expect(readJobs(memoryStorage())).toEqual([])
    expect(readJobs(memoryStorage({ [JOBS_KEY]: "{not json" }))).toEqual([])
    expect(readJobs(null)).toEqual([])
  })

  test("past the most kept, let the oldest only saved go first, and keep the ones applied to", () => {
    const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString()
    const jobs = Array.from({ length: MOST_JOBS + 2 }, (_, n) => job(`j${n}`, day(n), n === 0 ? "applied" : "saved"))
    const kept = keptJobs(jobs)
    expect(kept).toHaveLength(MOST_JOBS)
    expect(kept.map((kept) => kept.id)).toContain("j0")
    expect(kept.map((kept) => kept.id)).not.toContain("j1")
    expect(kept.map((kept) => kept.id)).not.toContain("j2")
  })
})

describe("a resume's saved profile", () => {
  const saved = {
    hash: "abc",
    madeAt: "2026-06-01T00:00:00Z",
    profile: {
      targets: ["Engineer"],
      level: "mid" as const,
      summary: "",
      domains: ["payments"],
      highlights: [{ group: "experience" as const, text: "Payments API, 2K requests/s" }],
      experience: ["Go"],
      projects: [],
      skills: [],
      coursework: [],
    },
  }

  test("comes back as it was saved, under the resume's id", () => {
    const storage = memoryStorage()
    saveProfile(storage, "a", saved)
    expect(readSavedProfile(storage, "a")).toEqual(saved)
    expect(readSavedProfile(storage, "b")).toBeNull()
  })

  test("is nothing when what's saved isn't one", () => {
    expect(readSavedProfile(memoryStorage({ [`${PROFILE_PREFIX}a`]: JSON.stringify({ profile: {} }) }), "a")).toBeNull()
  })

  test("is cleared once its resume isn't here, and others are kept", () => {
    const storage = memoryStorage()
    saveProfile(storage, "kept", saved)
    saveProfile(storage, "deleted", saved)
    storage.setItem("resume:deleted", "{}")
    forgetProfiles(storage, new Set(["kept"]))
    expect(readSavedProfile(storage, "kept")).toEqual(saved)
    expect(readSavedProfile(storage, "deleted")).toBeNull()
    expect(storage.getItem("resume:deleted")).toBe("{}")
  })
})
