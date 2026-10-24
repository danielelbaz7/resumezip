import { describe, expect, test } from "vitest"
import { asSaved } from "@/lib/testResume"
import { fingerprintOf, hasSource, profileSourceOf, readProfile } from "./profile"

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
      experience: ["Engineer · Stripe", "Built a Rust ledger"],
      projects: ["Atlas · Go", "Mapped cities"],
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
      highlights: [],
      experience: [],
      projects: [],
      skills: ["Go", "x".repeat(80)],
      coursework: [],
    })
  })

  test("keeps its highlights, each from experience or projects, cut to their length", () => {
    const read = readProfile({
      highlights: [{ group: "projects", text: "Redis clone, 100K ops/s" }, { group: "hobbies", text: "x".repeat(200) }, { text: " " }],
    })
    expect(read?.highlights).toEqual([
      { group: "projects", text: "Redis clone, 100K ops/s" },
      { group: "experience", text: "x".repeat(160) },
    ])
  })

  test("is nothing when it isn't an object", () => {
    for (const value of [null, "profile", [1], 3]) expect(readProfile(value)).toBeNull()
  })
})
