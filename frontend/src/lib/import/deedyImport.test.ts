// Deedy sets a narrow column of schools and skills on the left and a wide one
// on the right (templates/deedy.typ). Opened without the resume it carries,
// the columns are read one after the other, and lines that wrap in the narrow
// one stay with their school.

import { describe, expect, test } from "vitest"
import type { Tune } from "@/lib/tune"
import { readBack, render, samples } from "./testRender"

const sample = samples.find((resume) => resume.selectedTemplate === "deedy")
const [school] = sample.educationSection

const involvement = "Society of Women Engineers, Hackathon organizing committee, Robotics club, Puzzle Hunt team, Math & Sets reading group"
const coursework = "Advanced Topics in Distributed Systems Engineering, Probabilistic Graphical Models and Statistical Learning Theory"

async function schoolsOf(resume: Record<string, unknown>) {
  const { resume: got } = await readBack(await render(resume))
  return got.educationSection ?? []
}

describe("a Deedy PDF opened without its resume", () => {
  test("keeps a wrapped Involvement line with its school", async () => {
    // "Society of Women" ends a line, and "Engineers, ..." starts the next.
    const schools = await schoolsOf({ ...sample, educationSection: [{ ...school, involvement }] })
    expect(schools).toHaveLength(1)
    expect(schools[0]).toMatchObject({ involvement, coursework: school.coursework })
  })

  // Each wraps a line between two words of a list, or a place, where the
  // sample doesn't.
  test.each<Tune>([
    { size: 0.85, margin: 1 },
    { size: 0.9, margin: 0.6 },
    { size: 1.1, margin: 0.6 },
  ])("keeps wrapped Coursework, Involvement and place lines with their school, with Fine-tune at %o", async (tune) => {
    const schools = await schoolsOf({ ...sample, tune, educationSection: [{ ...school, coursework, involvement }] })
    expect(schools).toHaveLength(1)
    expect(schools[0]).toMatchObject({
      coursework,
      involvement,
      schoolLocation: school.schoolLocation,
      gpa: school.gpa.replace(/\s+/g, ""),
    })
  })

  test("reads both columns of a resume too short to fill them", async () => {
    // The columns' lines are level with each other: "EDUCATION" beside
    // "EXPERIENCE", "CMU" beside "NVIDIA | Intern".
    const resume = {
      selectedTemplate: "deedy",
      sectionOrder: ["Education", "Skills", "Work"],
      profileSection: { fullName: "Rohan Mehta" },
      educationSection: [{ id: 1, schoolName: "CMU", degree: "B.S. CS" }],
      workExperienceSection: [{ id: 1, workRole: "Intern", companyName: "NVIDIA", workEndDate: "2025" }],
    }
    const { parsed, resume: got } = await readBack(await render(resume))
    expect(parsed.unplaced).toEqual([])
    expect(parsed.sections.map((section) => section.name)).toEqual(["Education", "Work"])
    expect(got.profileSection?.fullName).toBe("Rohan Mehta")
    expect(got.educationSection).toMatchObject([{ schoolName: "CMU", degree: "B.S. CS" }])
    expect(got.workExperienceSection).toMatchObject([{ companyName: "NVIDIA", workRole: "Intern", workEndDate: "2025" }])
  })

  test("reads both columns of a short resume with a few bullets", async () => {
    // Long enough (150 characters or more) for findGutter to look for its
    // usual columns first, with too few lines for those: shortGutter finds these.
    const bullets = [
      "Wrote CUDA kernels for the attention layers",
      "Built a benchmark suite for four GPU types",
      "Profiled memory use across 30 models",
    ]
    const resume = {
      selectedTemplate: "deedy",
      sectionOrder: ["Education", "Skills", "Work"],
      profileSection: { fullName: "Rohan Mehta", email: "rohan@example.com" },
      educationSection: [{ id: 1, schoolName: "CMU", degree: "B.S. CS" }],
      workExperienceSection: [
        {
          id: 1,
          workRole: "Software Engineering Intern",
          companyName: "NVIDIA",
          workStartDate: "May 2025",
          workEndDate: "Aug 2025",
          workDescription: bullets.map((bullet) => `• ${bullet}`).join("\n"),
        },
      ],
    }
    const { parsed, resume: got } = await readBack(await render(resume))
    expect(parsed.unplaced).toEqual([])
    expect(got.educationSection).toMatchObject([{ schoolName: "CMU", degree: "B.S. CS" }])
    expect(got.workExperienceSection).toMatchObject([{ companyName: "NVIDIA", workRole: "Software Engineering Intern" }])
  })
})
