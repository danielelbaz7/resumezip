import { describe, expect, test } from "vitest"
import { hasLeftOut, isLeftOutLine, leftOutSectionsOf, printedResume, withSectionLeftOut } from "./leftOut"
import { asSaved } from "./testResume"

const tailored = asSaved({
  resumeTitle: "For the bank",
  profileSection: { fullName: "Ada Lovelace" },
  workExperienceSection: [
    { id: 1, workRole: "Engineer", workDescription: "• Built a loom\n○ Fed the cat\n• Wrote the notes" },
    { id: 2, workRole: "Intern", leftOut: true, workDescription: "• Made tea" },
    // Older resumes kept bullets as a list.
    { id: 3, workRole: "Analyst", workDescription: ["Checked sums", "○ Sharpened pencils"] },
  ],
  skillsSection: [{ id: 1, skillName: "Languages", skillDetails: "English", leftOut: true }],
})

describe("what's printed", () => {
  test("is everything but the entries and bullets the person left out", () => {
    expect(printedResume(tailored)).toEqual({
      ...tailored,
      workExperienceSection: [
        { id: 1, workRole: "Engineer", workDescription: "• Built a loom\n• Wrote the notes" },
        { id: 3, workRole: "Analyst", workDescription: ["Checked sums"] },
      ],
      skillsSection: [],
    })
  })

  test("leaves the resume it's given as it was", () => {
    const before = structuredClone(tailored)
    printedResume(tailored)
    expect(tailored).toEqual(before)
  })

  test("is the whole resume when nothing is left out", () => {
    const { skillsSection, ...rest } = tailored
    const whole = { ...rest, workExperienceSection: [{ id: 1, workRole: "Engineer", workDescription: "• Built a loom" }] }
    expect(printedResume(whole)).toEqual(whole)
  })

  test("knows a left-out bullet by the ○ it starts with, and nothing else", () => {
    expect(["○ Fed the cat", "  ○ Fed the cat", "○"].map(isLeftOutLine)).toEqual([true, true, true])
    expect(["• Fed the cat", "• ○ marks the spot", "Fed the cat ○", ""].map(isLeftOutLine)).toEqual([false, false, false, false])
  })
})

describe("whether anything is left out", () => {
  test("counts a left-out entry or bullet, in a list or in text", () => {
    expect(hasLeftOut(tailored)).toBe(true)
    expect(hasLeftOut({ workExperienceSection: [{ id: 1, workDescription: "• Built a loom\n○ Fed the cat" }] })).toBe(true)
    expect(hasLeftOut(asSaved({ workExperienceSection: [{ id: 1, workDescription: ["Checked sums", "○ Sharpened pencils"] }] }))).toBe(true)
    expect(hasLeftOut({ projectsSection: [{ id: 1, leftOut: true }] })).toBe(true)
  })

  test("is nothing on a resume without any, whatever else starts with ○", () => {
    expect(hasLeftOut({})).toBe(false)
    expect(
      hasLeftOut({
        profileSection: { fullName: "○ Ada" },
        workExperienceSection: [{ id: 1, workRole: "○ Engineer", workDescription: "• Built a loom" }],
      }),
    ).toBe(false)
  })
})

describe("a section left out", () => {
  const master = asSaved({
    sectionOrder: ["Education", "Projects", "Skills"],
    sectionsChosen: true,
    leftOutSections: ["Projects"],
    projectsSection: [{ id: 1, projectName: "Ledger" }],
    skillsSection: [{ id: 1, skillName: "Languages", skillDetails: "Go" }],
  })

  test("isn't printed, though its entries are kept", () => {
    const printed = printedResume(master)
    expect(printed.projectsSection).toEqual([])
    expect(printed.sectionOrder).toEqual(["Education", "Skills"])
    expect(printed.skillsSection).toHaveLength(1)
    expect("leftOutSections" in printed).toBe(false)
    expect(master.projectsSection).toHaveLength(1)
    expect(hasLeftOut(master)).toBe(true)
  })

  test("is read as only the editor's section names", () => {
    expect(leftOutSectionsOf(asSaved({ leftOutSections: ["Skills", "Nonsense", 3, "Work"] }))).toEqual(["Work", "Skills"])
    expect(leftOutSectionsOf(asSaved({ leftOutSections: "Skills" }))).toEqual([])
  })

  test("is put back in, or another left out, keeping none once there's none", () => {
    expect(withSectionLeftOut(["Projects"], "Work", true)).toEqual(["Work", "Projects"])
    expect(withSectionLeftOut(["Projects"], "Projects", false)).toBeNull()
    expect(withSectionLeftOut(undefined, "Skills", true)).toEqual(["Skills"])
  })
})
