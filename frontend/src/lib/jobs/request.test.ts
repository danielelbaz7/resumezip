import { describe, expect, test } from "vitest"
import {
  inPosting,
  jobsRequestOf,
  linkOf,
  matchAnswerOf,
  MOST_PER_PROFILES,
  MOST_POSTING_CHARS,
  postingProblem,
  profilesAnswerOf,
  sendable,
  workName,
} from "./request"

const source = (id = "r1") => ({
  id,
  experience: [{ title: "Engineer · Stripe", lines: ["Built a payments API serving 2K requests a second"] }],
  projects: [{ title: "Atlas · Go", lines: ["Mapped cities"] }],
  skills: ["Go"],
  coursework: [],
})
const answeredEntries = [
  { id: "x1", themes: ["payments infrastructure"], skills: ["Go"], claim: "Payments API, 2K requests/s" },
  { id: "p1", themes: ["mapping"], skills: ["Go"], claim: "Mapped 40 cities" },
]
const profile = (id = "r1") => ({
  id,
  targets: ["Backend Engineer"],
  level: "mid",
  summary: "",
  domains: [],
  entries: answeredEntries,
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
    expect(read).toMatchObject({ kind: "match", posting: "Go engineer", link: "", profiles: [{ id: "r1", skills: ["Go"] }] })
  })

  test("for a match is read with a link instead of the posting, or both", () => {
    expect(jobsRequestOf({ kind: "match", link: " https://jobs.acme.com/1 ", profiles: [profile()] })).toMatchObject({
      posting: "",
      link: "https://jobs.acme.com/1",
    })
    expect(jobsRequestOf({ kind: "match", posting: "Go engineer", link: "https://jobs.acme.com/1", profiles: [profile()] })).toMatchObject({
      posting: "Go engineer",
      link: "https://jobs.acme.com/1",
    })
    expect(jobsRequestOf({ kind: "match", posting: "", link: " ", profiles: [profile()] })).toBeNull()
    expect(jobsRequestOf({ kind: "match", link: "x".repeat(2_001), profiles: [profile()] })).toBeNull()
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
  graduation: { asked: false, earliest: "", latest: "", quote: "" },
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
    const read = profilesAnswerOf(answer, [source("r1"), source("r2")])
    expect(Object.keys(read!)).toEqual(["r1", "r2"])
    expect(read!.r2.targets).toHaveLength(1)
  })

  test("has each job and project with its title from the resume, and its claim only with numbers its text has", () => {
    const read = profilesAnswerOf({ profiles: [profile("r1")] }, [source("r1")])
    expect(read!.r1.entries).toEqual([
      {
        group: "experience",
        title: "Engineer · Stripe",
        themes: ["payments infrastructure"],
        skills: ["Go"],
        claim: "Payments API, 2K requests/s",
      },
      // "40 cities" isn't in the project's text.
      { group: "projects", title: "Atlas · Go", themes: ["mapping"], skills: ["Go"], claim: "" },
    ])
  })

  test("is nothing when it leaves one out, or a job or project of one, or one isn't whole, rather than made up", () => {
    expect(profilesAnswerOf({ profiles: [profile("r1")] }, [source("r1"), source("r2")])).toBeNull()
    const { domains: _, ...partial } = profile("r1")
    expect(profilesAnswerOf({ profiles: [partial] }, [source("r1")])).toBeNull()
    expect(profilesAnswerOf({ profiles: [{ ...profile("r1"), level: "wizard" }] }, [source("r1")])).toBeNull()
    expect(profilesAnswerOf({ profiles: [{ ...profile("r1"), entries: [answeredEntries[0]] }] }, [source("r1")])).toBeNull()
    expect(profilesAnswerOf({ profiles: [{ ...profile("r1"), entries: [{ id: "x1", themes: "payments" }] }] }, [source("r1")])).toBeNull()
    expect(profilesAnswerOf("busy", [source("r1")])).toBeNull()
  })
})

describe("an answer with a match", () => {
  test("keeps what the posting says, each resume's evidence for each requirement, and ratings in range", () => {
    expect(matchAnswerOf({ job: job(), resumes: [resume("r1")] }, ["r1"], POSTING)).toEqual({
      isPosting: true,
      // Whether it's a posting is beside the job, not in it.
      job: {
        ...job(),
        isPosting: undefined,
        graduation: null,
        requirements: [{ name: "C++", tier: 1, keyword: "C++", quote: "proficiency in C++" }],
      },
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

  test("has the posting's graduation window, when it asks for one in the words quoted", () => {
    const posting = `${POSTING} Applicants should be graduating between December 2026 and June 2027.`
    const asked = (graduation: object) => matchAnswerOf({ job: { ...job(), graduation }, resumes: [resume("r1")] }, ["r1"], posting)
    const quote = "graduating between December 2026 and June 2027"
    expect(asked({ asked: true, earliest: "2026-12", latest: "2027-06", quote })?.job.graduation).toEqual({
      earliest: "2026-12",
      latest: "2027-06",
      quote,
    })
    // The wrong way round, it's the same window.
    expect(asked({ asked: true, earliest: "2027-06", latest: "2026-12", quote })?.job.graduation).toMatchObject({ earliest: "2026-12" })
    // A quote that isn't in the posting, or no ends, isn't a window.
    expect(asked({ asked: true, earliest: "2026-12", latest: "2027-06", quote: "Class of 2027" })?.job.graduation).toBeNull()
    expect(asked({ asked: true, earliest: "", latest: "", quote })?.job.graduation).toBeNull()
    // A date in another shape makes the answer incomplete.
    expect(asked({ asked: true, earliest: "December 2026", latest: "2027-06", quote })).toBeNull()
    expect(matchAnswerOf({ job: { ...job(), graduation: undefined }, resumes: [resume("r1")] }, ["r1"], posting)).toBeNull()
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

describe("a requirement's name", () => {
  test("is dropped when it's about hiring rather than the work, which a resume doesn't prove", () => {
    for (const name of [
      "Graduation date",
      "Full-time availability",
      "Available to start in June",
      "BS in Computer Science",
      "Bachelor's degree",
      "Work authorization",
      "Security clearance",
      "Relocation",
      "Remote",
      "Communication skills",
      "Teamwork",
      "Years of experience",
    ]) {
      expect(workName(name), name).toBe("")
    }
  })

  test("is kept for the work, with a count of years before it taken off", () => {
    expect(workName("3+ years of C++")).toBe("C++")
    expect(workName("5-7 years experience with Go")).toBe("Go")
    for (const name of [
      "High availability",
      "Inter-process communication",
      "Hybrid cloud",
      "Job scheduling",
      "Remote procedure calls",
      "MS Excel",
    ]) {
      expect(workName(name), name).toBe(name)
    }
  })

  test("about hiring is left out of a match, with each resume's evidence for it", () => {
    const requirements = [
      { name: "Graduation date", tier: 1, keyword: "", quote: "Systems Engineer at Northwind Labs" },
      { name: "3+ years of C++", tier: 1, keyword: "C++", quote: "proficiency in C++" },
    ]
    const evidence = [
      { strength: "none", place: "nowhere" },
      { strength: "good", place: "projects" },
    ]
    const read = matchAnswerOf({ job: job(requirements), resumes: [resume("r1", evidence)] }, ["r1"], POSTING)
    expect(read?.job.requirements).toEqual([{ name: "C++", tier: 1, keyword: "C++", quote: "proficiency in C++" }])
    expect(read?.resumes.r1.evidence).toEqual([{ strength: "good", place: "projects" }])
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
    const job = { title: "Engineer · Stripe", lines: Array(40).fill("x".repeat(1_500)) }
    const long = { experience: Array(40).fill(job), projects: [{ title: "Atlas", lines: [] }], skills: [], coursework: [] }
    const sent = sendable(long)
    expect(sent.experience.flatMap((entry) => entry.lines).every((line) => line.length <= 1_000)).toBe(true)
    expect(sent.experience.length + sent.projects.length).toBeLessThanOrEqual(30)
    expect(jobsRequestOf({ kind: "profiles", resumes: [{ id: "r1", ...sent }] })).not.toBeNull()
  })
})

describe("a link as typed", () => {
  test("is made a web address, https:// before it when it has none", () => {
    expect(linkOf(" jobs.acme.com/backend ")).toBe("https://jobs.acme.com/backend")
    expect(linkOf("http://jobs.acme.com/1")).toBe("http://jobs.acme.com/1")
    expect(linkOf("")).toBe("")
  })

  test("isn't one when it can't be", () => {
    for (const typed of ["not a link", "ftp://jobs.acme.com", "javascript:alert(1)", "acme"]) expect(linkOf(typed), typed).toBeNull()
  })
})
