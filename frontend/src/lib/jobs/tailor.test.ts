import { describe, expect, test } from "vitest"
import { asSaved } from "@/lib/testResume"
import { savedTailoringOf, tailorAnswerOf, tailoringOf, tailorRequestOf, tailorSourceOf, withSkills, type TailorSource } from "./tailor"

const POSTING = `Backend Engineer at Acme. You'll build event pipelines with Kafka and Go, and store them in PostgreSQL.
Experience with Kubernetes is a must, and Terraform is a plus. A degree in Computer Science is preferred.`

const source: TailorSource = {
  experience: [{ title: "Engineer · Stripe", lines: ["Streamed payment events through Kafka to a Go service"] }],
  projects: [{ title: "Ledger · Go", lines: ["Stored balances in Postgres with row-level locks"] }],
  skillGroups: [
    { entryId: 1, name: "Languages", details: "Go, Python" },
    { entryId: 4, name: "Tools", details: "Docker, Git" },
  ],
  coursework: [],
}

const add = (skill: string, entry: string, quote: string, group = "s2", newGroup = "") => ({ skill, group, newGroup, entry, quote })
const gap = (requirement: string, quote: string, group = "s2", newGroup = "") => ({
  requirement,
  quote,
  why: "The team runs on it.",
  suggestion: "Deploy a small project to a cluster.",
  group,
  newGroup,
})

describe("what's sent of a resume to tailor it", () => {
  test("is its jobs and projects, its skill groups by their entry ids, and its coursework, as printed", () => {
    const resume = asSaved({
      workExperienceSection: [{ id: 1, workRole: "Engineer", companyName: "Stripe", workDescription: "• Built **it**" }],
      skillsSection: [
        { id: 3, skillName: "Languages", skillDetails: "Go" },
        { id: 5, skillName: "Hidden", skillDetails: "COBOL", leftOut: true },
      ],
    })
    expect(tailorSourceOf(resume)).toEqual({
      experience: [{ title: "Engineer · Stripe", lines: ["Built it"] }],
      projects: [],
      skillGroups: [{ entryId: 3, name: "Languages", details: "Go" }],
      coursework: [],
    })
  })
})

describe("a tailoring answer", () => {
  test("adds the skills a job or project shows, with its words, and keeps the gaps the posting asks for", () => {
    const answer = {
      add: [
        add("Kafka", "x1", "Streamed payment events through Kafka"),
        add("PostgreSQL", "p1", "Stored balances in Postgres", "new", "Databases"),
      ],
      gaps: [gap("Kubernetes", "Experience with Kubernetes is a must")],
    }
    expect(tailorAnswerOf(answer, source, POSTING)).toEqual(answer)
  })

  test("drops a skill whose words aren't in its job or project, one the resume lists, a repeat, or one with no group", () => {
    const answer = {
      add: [
        add("Terraform", "x1", "Provisioned infrastructure with Terraform"),
        add("Kafka", "p1", "Streamed payment events through Kafka"),
        add("Go", "x1", "a Go service"),
        add("Kafka", "x1", "Kafka"),
        add("Kafka", "x1", "Kafka"),
        add("Postgres", "p1", "Postgres", "s9"),
        add("SQL", "p1", "Postgres", "new", ""),
      ],
      gaps: [],
    }
    expect(tailorAnswerOf(answer, source, POSTING)?.add.map((added) => added.skill)).toEqual(["Kafka"])
  })

  test("drops a gap the posting doesn't ask for, one about hiring rather than the work, or one the Skills list", () => {
    const answer = {
      add: [],
      gaps: [
        gap("Rust", "Rust is required"),
        gap("Computer Science degree", "A degree in Computer Science is preferred"),
        gap("Go", "event pipelines with Kafka and Go"),
        gap("Terraform", "Terraform is a plus", "s9"),
      ],
    }
    // A gap with a group the resume doesn't have goes in a new group.
    expect(tailorAnswerOf(answer, source, POSTING)?.gaps).toEqual([
      { ...gap("Terraform", "Terraform is a plus"), group: "new", newGroup: "Skills" },
    ])
  })

  test("is nothing when it isn't whole, rather than filled in", () => {
    expect(tailorAnswerOf({ add: [] }, source, POSTING)).toBeNull()
    expect(tailorAnswerOf({ add: [{ skill: "Kafka" }], gaps: [] }, source, POSTING)).toBeNull()
    expect(tailorAnswerOf({ add: [], gaps: [{ requirement: "Kubernetes" }] }, source, POSTING)).toBeNull()
    expect(tailorAnswerOf("busy", source, POSTING)).toBeNull()
  })
})

describe("skills added to a copy", () => {
  const section = [
    { id: 1, skillName: "Languages", skillDetails: "Go, Python" },
    { id: 4, skillName: "Tools", skillDetails: "" },
  ]

  test("go after the others in their group, or in a new group at the end, once each", () => {
    expect(
      withSkills(section, [
        { skill: "TypeScript", entryId: 1, newGroup: "" },
        { skill: "Kafka", entryId: 4, newGroup: "" },
        { skill: "PostgreSQL", entryId: null, newGroup: "Databases" },
        { skill: "Redis", entryId: null, newGroup: "databases" },
        { skill: "go", entryId: 4, newGroup: "" },
      ]),
    ).toEqual([
      { id: 1, skillName: "Languages", skillDetails: "Go, Python, TypeScript" },
      { id: 4, skillName: "Tools", skillDetails: "Kafka" },
      { id: 5, skillName: "Databases", skillDetails: "PostgreSQL, Redis" },
    ])
  })

  test("leave the section they're added to as it was", () => {
    withSkills(section, [{ skill: "Rust", entryId: 1, newGroup: "" }])
    expect(section[0].skillDetails).toBe("Go, Python")
  })
})

describe("a tailoring kept with a job", () => {
  test("says which group each skill went in, which job or project shows it, and where each gap goes", () => {
    const answer = {
      add: [
        add("Kafka", "x1", "Streamed payment events through Kafka"),
        add("PostgreSQL", "p1", "Stored balances in Postgres", "new", "Databases"),
      ],
      gaps: [gap("Kubernetes", "Experience with Kubernetes is a must", "s2")],
    }
    const made = tailoringOf(answer, source, {
      fromResumeId: "a",
      copyId: "b",
      copyTitle: "Backend – Acme",
      now: new Date("2026-07-01T00:00:00Z"),
    })
    expect(made).toEqual({
      fromResumeId: "a",
      copyId: "b",
      copyTitle: "Backend – Acme",
      madeAt: "2026-07-01T00:00:00.000Z",
      added: [
        { skill: "Kafka", group: "Tools", from: "Engineer · Stripe", quote: "Streamed payment events through Kafka" },
        { skill: "PostgreSQL", group: "Databases", from: "Ledger · Go", quote: "Stored balances in Postgres" },
      ],
      gaps: [
        {
          requirement: "Kubernetes",
          quote: "Experience with Kubernetes is a must",
          why: "The team runs on it.",
          suggestion: "Deploy a small project to a cluster.",
          place: { skill: "Kubernetes", entryId: 4, newGroup: "" },
          added: false,
        },
      ],
    })
    expect(savedTailoringOf(JSON.parse(JSON.stringify(made)))).toEqual(made)
    expect(savedTailoringOf({ copyId: "b" })).toBeNull()
  })
})

describe("a tailoring request", () => {
  const request = { kind: "tailor", posting: POSTING, requirements: [{ name: "Kafka", tier: 2, keyword: "Kafka" }], resume: source }

  test("is read when it's what the page sends", () => {
    expect(tailorRequestOf(request)).toEqual(request)
  })

  test("isn't, with no posting, a requirement in another shape, or a resume that isn't one", () => {
    expect(tailorRequestOf({ ...request, posting: " " })).toBeNull()
    expect(tailorRequestOf({ ...request, requirements: [{ name: "Kafka", tier: 7, keyword: "" }] })).toBeNull()
    expect(tailorRequestOf({ ...request, resume: { ...source, skillGroups: [{ name: "Languages", details: "Go" }] } })).toBeNull()
    expect(tailorRequestOf({ ...request, resume: { ...source, experience: [{ title: "x".repeat(201), lines: [] }] } })).toBeNull()
    expect(tailorRequestOf({ ...request, kind: "match" })).toBeNull()
  })
})
