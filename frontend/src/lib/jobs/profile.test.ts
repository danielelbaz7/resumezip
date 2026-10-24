import { describe, expect, test } from "vitest"
import { asSaved } from "@/lib/testResume"
import { fingerprintOf, groundedClaim, hasSource, profileSourceOf, readProfile } from "./profile"

const resume = asSaved({
  workExperienceSection: [
    { id: 1, workRole: "Engineer", companyName: "Stripe", workDescription: "• Built a **Rust** ledger\n○ Left out of the PDF" },
    { id: 2, workRole: "Intern", companyName: "Hidden", leftOut: true },
  ],
  projectsSection: [{ id: 1, projectName: "Atlas", techStack: "Go", projectDescription: "• Mapped *cities*" }],
  skillsSection: [{ id: 1, skillName: "Languages", skillDetails: "Python, Go" }],
  educationSection: [{ id: 1, schoolName: "MIT", coursework: "Algorithms, Databases" }],
  profileSection: { fullName: "Ada", summary: "Not sent" },
})

describe("what's sent of a resume to make its profile", () => {
  test("is its experience, projects, skills and coursework as printed, without marks or what's left out", () => {
    expect(profileSourceOf(resume)).toEqual({
      experience: [{ title: "Engineer · Stripe", lines: ["Built a Rust ledger"] }],
      projects: [{ title: "Atlas · Go", lines: ["Mapped cities"] }],
      skills: ["Languages · Python, Go"],
      coursework: ["MIT · Algorithms, Databases"],
    })
  })

  test("is nothing to match for a resume with none of them", () => {
    expect(hasSource(profileSourceOf(asSaved({ profileSection: { fullName: "Ada" } })))).toBe(false)
    expect(hasSource(profileSourceOf(resume))).toBe(true)
  })
})

describe("a profile's fingerprint", () => {
  test("is the same for the same text, and changes when the text does", () => {
    const source = profileSourceOf(resume)
    expect(fingerprintOf(source)).toBe(fingerprintOf(profileSourceOf(resume)))
    expect(fingerprintOf({ ...source, skills: ["Languages · Python, Go, Rust"] })).not.toBe(fingerprintOf(source))
  })

  test("doesn't change with what isn't sent, as the summary or the template", () => {
    const changed = { ...resume, selectedTemplate: "deedy", profileSection: { fullName: "Ada", summary: "Something else" } }
    expect(fingerprintOf(profileSourceOf(changed))).toBe(fingerprintOf(profileSourceOf(resume)))
  })
})

describe("a profile read back", () => {
  test("keeps what it should, cut to its limits, and an unknown level is entry", () => {
    const read = readProfile({
      targets: ["A", "B", "C", "D", "E", "F", 7],
      level: "wizard",
      summary: " Builds. ",
      skills: ["Go", "Go", "x".repeat(200)],
    })
    expect(read).toEqual({
      targets: ["A", "B", "C", "D", "E"],
      level: "entry",
      summary: "Builds.",
      domains: [],
      entries: [],
      experience: [],
      projects: [],
      skills: ["Go", "x".repeat(80)],
      coursework: [],
    })
  })

  test("keeps each job and project with its title, themes, skills and claim, cut to their limits", () => {
    const read = readProfile({
      entries: [
        {
          group: "projects",
          title: "Redis Clone · C++",
          themes: ["key-value stores", ...Array(9).fill("x")],
          skills: ["C++"],
          claim: "100K ops/s",
        },
        { group: "hobbies", title: "Engineer · Stripe", themes: [], skills: [], claim: "x".repeat(200) },
        { group: "projects", title: " ", themes: [], skills: [], claim: "" },
      ],
    })
    expect(read?.entries).toEqual([
      { group: "projects", title: "Redis Clone · C++", themes: ["key-value stores", "x"], skills: ["C++"], claim: "100K ops/s" },
      { group: "experience", title: "Engineer · Stripe", themes: [], skills: [], claim: "x".repeat(160) },
    ])
  })

  test("is nothing when it isn't an object", () => {
    for (const value of [null, "profile", [1], 3]) expect(readProfile(value)).toBeNull()
  })
})

describe("a job or project's claim", () => {
  const entry = { title: "Redis Clone · C++", lines: ["Sharded engine sustaining 100,000+ ops/s under 256 clients"] }

  test("is kept when every number in it is in that job or project", () => {
    expect(groundedClaim("Sharded engine, 100K+ ops/s under 256 clients", entry)).toBe("Sharded engine, 100K+ ops/s under 256 clients")
    expect(groundedClaim("Sharded concurrent key-value engine", entry)).toBe("Sharded concurrent key-value engine")
  })

  test("is dropped when it has a number that isn't there", () => {
    expect(groundedClaim("Sharded engine, 1M ops/s under 512 clients", entry)).toBe("")
    expect(groundedClaim("Cut p99 latency by 40%", entry)).toBe("")
  })
})
