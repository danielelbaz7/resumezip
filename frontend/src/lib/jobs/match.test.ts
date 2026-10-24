import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { memoryStorage } from "@/lib/memoryStorage"
import type { ResumeWithId } from "@/lib/resume"
import { asSaved } from "@/lib/testResume"
import { JobsError, matchesOf, matchJob, profilesFor, scoreFor } from "./match"
import { fingerprintOf, profileSourceOf, type ResumeProfile } from "./profile"
import type { MatchAnswer } from "./request"
import { readSavedProfile, saveProfile } from "./storage"

const resume = (id: string, skills: string, updatedAt = "2026-06-01T00:00:00Z"): ResumeWithId => ({
  ...asSaved({ resumeTitle: `Resume ${id}`, updatedAt, skillsSection: [{ id: 1, skillName: "Languages", skillDetails: skills }] }),
  id,
})
const profile = (skills: string[]): ResumeProfile => ({
  targets: ["Engineer"],
  level: "mid",
  summary: "",
  domains: [],
  entries: [],
  experience: [],
  projects: [],
  skills,
  coursework: [],
})

const POSTING = `Engineer at Acme. We build the storage layer behind our payments platform, and we're hiring.
You must have shipped production systems in Rust and be comfortable on Linux. You'll work on reliability with a small team.`

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
  test("scores each resume in layers from the AI's answer, best first, as a job to save", async () => {
    const storage = memoryStorage()
    fetched.mockResolvedValueOnce(Response.json({ profiles: { r1: profile(["Go"]), r2: profile(["Rust"]) } })).mockResolvedValueOnce(
      Response.json({
        match: {
          job: {
            isPosting: true,
            title: "Engineer",
            company: "Acme",
            location: "",
            level: "mid",
            role: "systems/infrastructure",
            domain: "storage",
            requirements: [{ name: "Rust", tier: 1, keyword: "Rust", quote: "shipped production systems in Rust" }],
            advice: "",
            graduation: { asked: false, earliest: "", latest: "", quote: "" },
          },
          resumes: [
            {
              id: "r1",
              evidence: [{ strength: "weak", place: "skills" }],
              projects: 40,
              experience: 30,
              domain: 50,
              narrative: 60,
              reason: "Rust is listed.",
            },
            {
              id: "r2",
              evidence: [{ strength: "none", place: "nowhere" }],
              projects: 10,
              experience: 10,
              domain: 20,
              narrative: 20,
              reason: "No Rust.",
            },
          ],
        },
        posting: POSTING,
        note: "",
      }),
    )
    const { job, note } = await matchJob(
      ` ${POSTING} `,
      " acme.com/jobs/1 ",
      [resume("go", "Go", "2026-01-01T00:00:00Z"), resume("rust", "Rust")],
      storage,
    )
    // Matched newest first, so the Rust resume, edited last, is r1.
    expect(sent()[1].profiles.map((sent: { skills: string[] }) => sent.skills)).toEqual([["Rust"], ["Go"]])
    expect(note).toBe("")
    expect(sent()[1]).toMatchObject({ kind: "match", posting: POSTING, link: "https://acme.com/jobs/1" })
    expect(job).toMatchObject({
      link: "https://acme.com/jobs/1",
      posting: POSTING,
      title: "Engineer",
      role: "systems/infrastructure",
      status: "saved",
      chosenResumeId: null,
    })
    // Rust: only listed (40) at 35%, projects 40 at 25%, experience 30 at 20%, domain 50 at 10%, its keyword on it (100)
    // and a story of 60 at 5% each: 43. Go misses the must-have, so a fifth comes off its 7.5: 6.
    expect(job.matches.map((match) => [match.resumeId, match.score])).toEqual([
      ["rust", 43],
      ["go", 6],
    ])
    expect(job.matches[0]).toMatchObject({
      parts: { core: 40, projects: 40, experience: 30, domain: 50, keywords: 100, narrative: 60 },
      missedScreening: 0,
      evidence: [{ strength: "weak", place: "skills", onResume: true }],
      found: { skills: 1, missing: 0 },
    })
    expect(job.matches[1]).toMatchObject({ missedScreening: 1, missing: ["Rust"] })
  })

  test("says so when no resume has anything to match on, without asking the AI", async () => {
    const empty = { ...asSaved({ profileSection: { fullName: "Ada" } }), id: "empty" }
    await expect(matchJob(POSTING, "", [empty], memoryStorage())).rejects.toEqual(new JobsError("empty"))
    expect(fetched).not.toHaveBeenCalled()
  })

  test("sends a link with no posting pasted, and saves the posting the route read from it", async () => {
    const answer = {
      match: {
        job: {
          isPosting: true,
          title: "Engineer",
          company: "Acme",
          location: "",
          level: "unknown",
          role: "backend/product",
          domain: "",
          requirements: [],
          advice: "",
          graduation: { asked: false, earliest: "", latest: "", quote: "" },
        },
        resumes: [{ id: "r1", evidence: [], projects: 50, experience: 50, domain: 50, narrative: 50, reason: "Close." }],
      },
      posting: POSTING,
      note: "",
    }
    fetched.mockResolvedValueOnce(Response.json({ profiles: { r1: profile(["Rust"]) } })).mockResolvedValueOnce(Response.json(answer))
    const steps: string[] = []
    const { job } = await matchJob("", "acme.com/jobs/2", [resume("a", "Rust")], memoryStorage(), {
      onStep: (step) => steps.push(step.kind),
    })
    expect(sent()[1]).toMatchObject({ posting: "", link: "https://acme.com/jobs/2" })
    expect(job.posting).toBe(POSTING)
    expect(steps).toEqual(["profiles", "link"])
  })

  test("says when the link couldn't be read and only the paste was matched", async () => {
    const answer = {
      match: {
        job: {
          isPosting: true,
          title: "",
          company: "",
          location: "",
          level: "unknown",
          role: "other",
          domain: "",
          requirements: [],
          advice: "",
          graduation: { asked: false, earliest: "", latest: "", quote: "" },
        },
        resumes: [{ id: "r1", evidence: [], projects: 50, experience: 50, domain: 50, narrative: 50, reason: "" }],
      },
      posting: POSTING,
      note: "link-unread",
    }
    fetched.mockResolvedValueOnce(Response.json({ profiles: { r1: profile(["Rust"]) } })).mockResolvedValueOnce(Response.json(answer))
    expect((await matchJob(POSTING, "linkedin.com/jobs/view/1", [resume("a", "Rust")], memoryStorage())).note).toBe("link-unread")
  })

  test("says a link isn't a web address, before anything's sent", async () => {
    await expect(matchJob(POSTING, "not a link", [resume("a", "Rust")], memoryStorage())).rejects.toMatchObject({ reason: "bad-link" })
    expect(fetched).not.toHaveBeenCalled()
  })

  test("says a word or a name is too short to be a posting, before anything's sent", async () => {
    for (const posting of ["RTX", "ABC", "SDAS"]) {
      await expect(matchJob(posting, "", [resume("a", "Rust")], memoryStorage())).rejects.toMatchObject({ reason: "short" })
    }
    expect(fetched).not.toHaveBeenCalled()
  })

  test("says the answer came back incomplete when a resume's profile is missing from it, rather than leaving it out", async () => {
    fetched.mockResolvedValue(Response.json({ profiles: { r1: profile(["Go"]) } }))
    await expect(matchJob(POSTING, "", [resume("a", "Go"), resume("b", "Rust")], memoryStorage())).rejects.toMatchObject({
      reason: "answer",
    })
  })

  test("says why when the route can't answer", async () => {
    fetched.mockResolvedValue(Response.json({ error: "off" }, { status: 503 }))
    await expect(matchJob(POSTING, "", [resume("a", "Rust")], memoryStorage())).rejects.toMatchObject({ reason: "off" })
    fetched.mockResolvedValue(new Response("Too many", { status: 429 }))
    await expect(matchJob(POSTING, "", [resume("a", "Rust")], memoryStorage())).rejects.toMatchObject({ reason: "limit" })
  })
})

describe("resumes scored for a job", () => {
  const project = (id: number, techStack: string) => ({ id, projectName: `Project ${id}`, techStack, projectDescription: "• Built it" })
  const withProjects = (id: string, projects: ReturnType<typeof project>[], schoolEndDate: string): ResumeWithId => ({
    ...asSaved({
      resumeTitle: id,
      projectsSection: projects,
      educationSection: [{ id: 1, schoolName: "State University", schoolEndDate }],
    }),
    id,
  })
  const answer = (graduation: MatchAnswer["job"]["graduation"]): MatchAnswer => ({
    isPosting: true,
    job: {
      title: "",
      company: "",
      location: "",
      level: "",
      role: "low-level C++",
      domain: "",
      requirements: [{ name: "C++", tier: 1, keyword: "C++", quote: "C++" }],
      advice: "",
      graduation,
    },
    // The AI says the same of both: C++ shown in projects.
    resumes: Object.fromEntries(
      ["r1", "r2"].map((id) => [
        id,
        { evidence: [{ strength: "good", place: "projects" }], projects: 70, experience: 50, domain: 50, narrative: 50, reason: "" },
      ]),
    ),
  })

  test("favor the one with more jobs and projects showing a requirement: two C++ projects over one", () => {
    const one = withProjects("one", [project(1, "C++, CMake"), project(2, "Python")], "May 2027")
    const two = withProjects("two", [project(1, "C++, CMake"), project(2, "Modern C++")], "May 2027")
    const [best, next] = matchesOf(answer(null), [one, two])
    expect([best.resumeId, next.resumeId]).toEqual(["two", "one"])
    expect(best.score).toBeGreaterThan(next.score)
    expect(best.evidence[0].examples).toBe(2)
    expect(next.evidence[0].examples).toBe(1)
  })

  test("take a fifth off one whose graduation date is outside the posting's window, and say which fits", () => {
    const fits = withProjects("fits", [project(1, "C++")], "Expected May 2027")
    const late = withProjects("late", [project(1, "C++")], "May 2029")
    const none = withProjects("none", [project(1, "C++")], "")
    const window = { earliest: "2026-12", latest: "2027-06", quote: "" }
    const matched = matchesOf({ ...answer(window), resumes: { ...answer(window).resumes, r3: answer(window).resumes.r1 } }, [
      fits,
      late,
      none,
    ])
    const of = (id: string) => matched.find((match) => match.resumeId === id)!
    expect([of("fits").graduation, of("late").graduation, of("none").graduation]).toEqual(["fits", "outside", "unknown"])
    expect(of("late").score).toBe(Math.round(of("fits").score * 0.8))
    // With no date to check, there's nothing to take off.
    expect(of("none").score).toBe(of("fits").score)
    expect(of("fits").graduationDate).toBe("2027-05")
  })
})

describe("the resumes kept with a job", () => {
  test("are the five that fit it best, best first", () => {
    const resumes = Array.from({ length: 7 }, (_, index): ResumeWithId => ({ ...asSaved({ resumeTitle: `r${index}` }), id: `r${index}` }))
    const answer: MatchAnswer = {
      isPosting: true,
      job: { title: "", company: "", location: "", level: "", role: "other", domain: "", requirements: [], advice: "", graduation: null },
      // Each resume's projects rating is its place, so the last fits best.
      resumes: Object.fromEntries(
        resumes.map((_, index) => [
          `r${index + 1}`,
          { evidence: [], projects: index * 10, experience: 0, domain: 0, narrative: 0, reason: "" },
        ]),
      ),
    }
    expect(matchesOf(answer, resumes).map((match) => match.resumeId)).toEqual(["r6", "r5", "r4", "r3", "r2"])
  })
})

describe("a tailored copy, scored", () => {
  test("is judged against the requirements the job was matched on, its profile made first, and remembers what it was scored on", async () => {
    const copy = resume("copy", "Rust, Go")
    const job = {
      id: "j",
      savedAt: "2026-06-01T00:00:00Z",
      link: "",
      posting: POSTING,
      title: "Engineer",
      company: "Acme",
      location: "",
      level: "mid" as const,
      role: "systems/infrastructure" as const,
      domain: "",
      requirements: [{ name: "Rust", tier: 1 as const, keyword: "Rust", quote: "shipped production systems in Rust" }],
      advice: "",
      graduation: null,
      matches: [],
      chosenResumeId: null,
      status: "saved" as const,
      appliedAt: null,
      tailorings: [],
    }
    fetched.mockResolvedValueOnce(Response.json({ profiles: { r1: profile(["Rust", "Go"]) } })).mockResolvedValueOnce(
      Response.json({
        resumes: [
          {
            id: "r1",
            evidence: [{ strength: "weak", place: "skills" }],
            projects: 40,
            experience: 30,
            domain: 50,
            narrative: 60,
            reason: "",
          },
        ],
      }),
    )
    const match = await scoreFor(job, copy, memoryStorage(), { tailoredFrom: "rust" })
    expect(sent().map((body) => body.kind)).toEqual(["profiles", "score"])
    expect(sent()[1].requirements).toEqual([{ name: "Rust", tier: 1, keyword: "Rust" }])
    // As matching scores it: only listed (40) at 35%, and the rest as for the Rust resume above.
    expect(match).toMatchObject({ resumeId: "copy", score: 43, tailoredFrom: "rust", scoredHash: fingerprintOf(profileSourceOf(copy)) })
  })
})
