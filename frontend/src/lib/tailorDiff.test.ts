import { describe, expect, test } from "vitest"
import { asSaved } from "./testResume"
import { addedWords, changesOf, tailoredFromOf } from "./tailorDiff"

describe("the words added to a field", () => {
  test("are each run of them the original doesn't have, without the comma after one", () => {
    expect(addedWords("Go, Python", "Go, Python, TypeScript")).toEqual(["TypeScript"])
    expect(addedWords("Go, Python", "Go, Rust, Python, TypeScript, Kafka")).toEqual(["Rust", "TypeScript, Kafka"])
    expect(addedWords("Built a ledger", "Built a **Rust** ledger")).toEqual(["Rust"])
  })

  test("are none for the same words, whatever the punctuation or case", () => {
    expect(addedWords("Go, Python", "go,  python")).toEqual([])
  })
})

describe("what a tailored copy changed", () => {
  const original = asSaved({
    skillsSection: [{ id: 1, skillName: "Languages", skillDetails: "Go, Python" }],
    workExperienceSection: [
      { id: 1, workRole: "Engineer", companyName: "Stripe", workDescription: "• Built a payments API\n• Mentored two interns" },
    ],
    projectsSection: [{ id: 1, projectName: "Atlas", techStack: "Go", leftOut: true }],
  })

  test("is the words added to each field, a group added to Skills, and a bullet rewritten, by where they are", () => {
    const copy = asSaved({
      ...original,
      skillsSection: [
        { id: 1, skillName: "Languages", skillDetails: "Go, Python, Rust" },
        { id: 2, skillName: "Databases", skillDetails: "PostgreSQL" },
      ],
      workExperienceSection: [
        {
          id: 1,
          workRole: "Engineer",
          companyName: "Stripe",
          workDescription: "• Built a payments API in Rust\n• Mentored two interns\n• Ran the on-call rotation",
        },
      ],
    })
    expect(changesOf(copy, original)).toEqual([
      { section: "Work", label: "Experience · Stripe", added: ["in Rust", "Ran the on-call rotation"] },
      { section: "Skills", label: "Skills · Languages", added: ["Rust"] },
      { section: "Skills", label: "Skills · Databases (new)", added: ["Databases", "PostgreSQL"] },
    ])
  })

  test("is nothing when it's the same, or what changed is left out of the PDF", () => {
    expect(changesOf(original, original)).toEqual([])
    const copy = asSaved({ ...original, projectsSection: [{ id: 1, projectName: "Atlas", techStack: "Go, Rust", leftOut: true }] })
    expect(changesOf(copy, original)).toEqual([])
  })
})

describe("where a resume was tailored from", () => {
  test("is read defensively, and is nothing for one that wasn't", () => {
    const from = { resumeId: "a", title: "Rust resume", jobId: "j", at: "2026-07-01T00:00:00.000Z" }
    expect(tailoredFromOf(asSaved({ tailoredFrom: from }))).toEqual(from)
    expect(tailoredFromOf(asSaved({ tailoredFrom: { resumeId: "a", title: 7 } }))).toEqual({ resumeId: "a", title: "", jobId: "", at: "" })
    expect(tailoredFromOf(asSaved({}))).toBeNull()
    expect(tailoredFromOf(asSaved({ tailoredFrom: { title: "x" } }))).toBeNull()
  })
})
