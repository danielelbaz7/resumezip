import { expect, test } from "vitest"
import { matchPrompt, profilesPrompt } from "./prompt"

test("a resume is sent to be summed up a job and project at a time, each with its id", () => {
  const text = profilesPrompt([
    {
      id: "r1",
      experience: [{ title: "Engineer · Stripe", lines: ["Built a ledger"] }],
      projects: [
        { title: "Atlas · Go", lines: ["Mapped cities"] },
        { title: "Redis Clone · C++", lines: [] },
      ],
      skills: ["Languages · Go"],
      coursework: [],
    },
  ])
  expect(text).toContain(
    "experience:\n[x1] Engineer · Stripe\n  - Built a ledger\nprojects:\n[p1] Atlas · Go\n  - Mapped cities\n[p2] Redis Clone · C++",
  )
  expect(text).toContain("skills:\n- Languages · Go")
})

test("a profile is matched with each of its jobs and projects, their themes, skills and claim", () => {
  const text = matchPrompt("A posting", [
    {
      id: "r1",
      targets: ["Backend Engineer"],
      level: "mid",
      summary: "",
      domains: [],
      entries: [
        { group: "projects", title: "Redis Clone · C++", themes: ["key-value stores"], skills: ["C++"], claim: "100K ops/s" },
        { group: "experience", title: "Engineer · Stripe", themes: [], skills: ["Go"], claim: "" },
      ],
      experience: [],
      projects: [],
      skills: [],
      coursework: [],
    },
  ])
  expect(text).toContain(
    "jobs:\n- Engineer · Stripe | skills: Go\nprojects:\n- Redis Clone · C++ | themes: key-value stores | skills: C++ | claim: 100K ops/s",
  )
})
