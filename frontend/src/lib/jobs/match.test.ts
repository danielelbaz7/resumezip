import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { memoryStorage } from "@/lib/memoryStorage"
import type { ResumeWithId } from "@/lib/resume"
import { asSaved } from "@/lib/testResume"
import { JobsError, matchJob, profilesFor } from "./match"
import { fingerprintOf, profileSourceOf, type ResumeProfile } from "./profile"
import { readSavedProfile, saveProfile } from "./storage"

const resume = (id: string, skills: string, updatedAt = "2026-06-01T00:00:00Z"): ResumeWithId => ({
  ...asSaved({ resumeTitle: `Resume ${id}`, updatedAt, skillsSection: [{ id: 1, skillName: "Languages", skillDetails: skills }] }),
  id,
})
const profile = (skills: string[]): ResumeProfile => ({
  targets: ["Engineer"],
  level: "mid",
  summary: "",
  experience: [],
  projects: [],
  skills,
  coursework: [],
})

const fetched = vi.fn<typeof fetch>()
const sent = () => fetched.mock.calls.map(([, init]) => JSON.parse(init!.body as string))

beforeEach(() => {
  fetched.mockReset()
  vi.stubGlobal("fetch", fetched)
})
afterEach(() => vi.unstubAllGlobals())

describe("a resume's profile, as a job is matched", () => {
  test("is the saved one while the resume's text is the same, and made again only for the one that changed", async () => {
    const storage = memoryStorage()
    const same = resume("same", "Go")
    const changed = resume("changed", "Rust")
    saveProfile(storage, "same", { hash: fingerprintOf(profileSourceOf(same)), madeAt: "2026-01-01T00:00:00Z", profile: profile(["Go"]) })
    saveProfile(storage, "changed", { hash: "old text", madeAt: "2026-01-01T00:00:00Z", profile: profile(["C"]) })
    fetched.mockResolvedValue(Response.json({ profiles: { r1: profile(["Rust"]) } }))

    const profiles = await profilesFor([same, changed], storage)
    expect(sent()).toEqual([
      { kind: "profiles", resumes: [{ id: "r1", experience: [], projects: [], skills: ["Languages · Rust"], coursework: [] }] },
    ])
    expect(profiles.get("same")?.skills).toEqual(["Go"])
    expect(profiles.get("changed")?.skills).toEqual(["Rust"])
    expect(readSavedProfile(storage, "changed")?.hash).toBe(fingerprintOf(profileSourceOf(changed)))
  })

  test("isn't asked for at all when every saved one is up to date", async () => {
    const storage = memoryStorage()
    const same = resume("same", "Go")
    saveProfile(storage, "same", { hash: fingerprintOf(profileSourceOf(same)), madeAt: "2026-01-01T00:00:00Z", profile: profile(["Go"]) })
    await profilesFor([same], storage)
    expect(fetched).not.toHaveBeenCalled()
  })
})

describe("matching a job", () => {
  test("scores each resume from where the job's requirements show up, best first, as a job to save", async () => {
    const storage = memoryStorage()
    fetched.mockResolvedValueOnce(Response.json({ profiles: { r1: profile(["Go"]), r2: profile(["Rust"]) } })).mockResolvedValueOnce(
      Response.json({
        match: {
          job: { title: "Engineer", company: "Acme", location: "", level: "mid", requirements: [{ name: "Rust", must: true }] },
          resumes: { r1: { places: ["skills"], reason: "Rust is listed." }, r2: { places: ["nowhere"], reason: "No Rust." } },
        },
      }),
    )
    const job = await matchJob(
      " Rust engineer ",
      " acme.com/jobs/1 ",
      [resume("go", "Go", "2026-01-01T00:00:00Z"), resume("rust", "Rust")],
      storage,
    )
    // Matched newest first, so the Rust resume, edited last, is r1.
    expect(sent()[1].profiles.map((sent: { skills: string[] }) => sent.skills)).toEqual([["Rust"], ["Go"]])
    expect(job).toMatchObject({ link: "acme.com/jobs/1", title: "Engineer", company: "Acme", status: "saved", chosenResumeId: null })
    expect(job.matches.map((match) => [match.resumeId, match.score])).toEqual([
      ["rust", 50],
      ["go", 0],
    ])
  })

  test("says so when no resume has anything to match on, without asking the AI", async () => {
    const empty = { ...asSaved({ profileSection: { fullName: "Ada" } }), id: "empty" }
    await expect(matchJob("Rust engineer", "", [empty], memoryStorage())).rejects.toEqual(new JobsError("empty"))
    expect(fetched).not.toHaveBeenCalled()
  })

  test("says why when the route can't answer", async () => {
    fetched.mockResolvedValue(Response.json({ error: "off" }, { status: 503 }))
    await expect(matchJob("Rust engineer", "", [resume("a", "Rust")], memoryStorage())).rejects.toMatchObject({ reason: "off" })
    fetched.mockResolvedValue(new Response("Too many", { status: 429 }))
    await expect(matchJob("Rust engineer", "", [resume("a", "Rust")], memoryStorage())).rejects.toMatchObject({ reason: "limit" })
  })
})
