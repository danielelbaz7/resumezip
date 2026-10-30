import { describe, expect, test } from "vitest"
import type { Resume } from "@/lib/resume"
import { applyActions } from "./apply"
import type { Action } from "./schema"

const master: Resume = {
  id: "master",
  resumeTitle: "Master",
  selectedTemplate: "jake",
  profileSection: { fullName: "Ada Lovelace", email: "ada@example.com" },
  sectionOrder: ["Education", "Work", "Skills", "Projects"],
  sectionsChosen: true,
  workExperienceSection: [
    { id: 1, companyName: "Babbage & Co", workRole: "Analyst", workDescription: "• Wrote notes on 3 engines\n• Ran the numbers" },
    { id: 2, companyName: "Royal Society", workRole: "Fellow" },
  ],
  projectsSection: [{ id: 1, projectName: "Engine Notes" }],
}
const other: Resume = { id: "other", resumeTitle: "Frontend", selectedTemplate: "jake", projectsSection: [] }
const resumes = { master, other }

const action = (fields: Partial<Action> & Pick<Action, "op">): Action => ({
  resume: null,
  section: null,
  entry: null,
  fields: [],
  value: null,
  position: null,
  targets: [],
  ...fields,
})

const applied = (...actions: unknown[]) => applyActions(resumes, "master", actions)

describe("the assistant's changes", () => {
  test("rewrite an entry's bullets, bold and all, giving each line its bullet", () => {
    const { edits, done, failed } = applied(
      action({
        op: "edit_entry",
        section: "Work",
        entry: 1,
        fields: [{ key: "workDescription", value: "Wrote notes on **3** engines\n• Ran the numbers" }],
      }),
    )
    expect(failed).toEqual([])
    expect(done).toEqual(["Changed Babbage & Co."])
    expect(edits.master.workExperienceSection![0].workDescription).toBe("• Wrote notes on **3** engines\n• Ran the numbers")
    // Only the field that changed.
    expect(Object.keys(edits.master)).toEqual(["workExperienceSection"])
  })

  test("leave an entry out and put it back, keeping it", () => {
    const out = applied(action({ op: "leave_out_entry", section: "Work", entry: 2 }))
    expect(out.edits.master.workExperienceSection![1]).toEqual({ id: 2, companyName: "Royal Society", workRole: "Fellow", leftOut: true })
    expect(out.done).toEqual(["Left out Royal Society."])
    const back = applyActions({ ...resumes, master: { ...master, ...out.edits.master } }, "master", [
      action({ op: "include_entry", section: "Work", entry: 2 }),
    ])
    expect(back.edits.master.workExperienceSection![1]).toEqual({ id: 2, companyName: "Royal Society", workRole: "Fellow" })
  })

  test("add, move and delete entries, one building on the one before", () => {
    const { edits } = applied(
      action({ op: "add_entry", section: "Experience", fields: [{ key: "companyName", value: "Analytical Ltd" }], position: 0 }),
      action({ op: "move_entry", section: "Work", entry: 1, position: 2 }),
      action({ op: "delete_entry", section: "Work", entry: 2 }),
    )
    expect(edits.master.workExperienceSection!.map((entry) => entry.id)).toEqual([3, 1])
  })

  test("skip what doesn't fit the resume, saying why, and still do the rest", () => {
    const { edits, done, failed } = applied(
      action({ op: "edit_entry", section: "Work", entry: 9, fields: [{ key: "workRole", value: "Boss" }] }),
      action({
        op: "edit_entry",
        section: "Work",
        entry: 1,
        fields: [
          { key: "workRole", value: "Lead" },
          { key: "salary", value: "1" },
        ],
      }),
      action({ op: "set_template", value: "mono" }),
      { op: "fly" },
    )
    expect(failed).toEqual(["There's no entry 9 in Experience.", "Experience has no field called salary.", expect.any(String)])
    // The second is skipped whole, not halfway.
    expect(edits.master.workExperienceSection).toBeUndefined()
    expect(edits.master.selectedTemplate).toBe("mono")
    expect(done).toHaveLength(1)
  })

  test("change sections: leave one out, rename one, reorder them, add one of the person's own", () => {
    const { edits } = applied(
      action({ op: "leave_out_section", section: "Projects" }),
      action({ op: "rename_section", section: "Work", value: "Work History" }),
      action({ op: "order_sections", targets: ["Work", "Education"] }),
      action({ op: "add_custom_section", value: "Languages", fields: [{ key: "bullets", value: "French\nItalian" }] }),
    )
    expect(edits.master.leftOutSections).toEqual(["Projects"])
    expect(edits.master.headings).toEqual({ work: "Work History" })
    const [key] = Object.keys(edits.master.extraSections!)
    expect(edits.master.extraSections![key]).toEqual({ kind: "list", heading: "Languages", bullets: "• French\n• Italian" })
    expect(edits.master.sectionOrder).toEqual(["Work", "Education", "Skills", "Projects", `extra:${key}`])
  })

  test("change the style: Fine-tune within its range, a section's choice", () => {
    const { edits } = applied(
      action({
        op: "set_tune",
        fields: [
          { key: "size", value: "0.5" },
          { key: "onePage", value: "true" },
        ],
      }),
      action({ op: "set_choice", section: "Work", value: "role" }),
    )
    expect(edits.master.tune).toEqual({ size: 0.85, onePage: true })
    expect(edits.master.workFirst).toBe("role")
  })

  test("copy a section to another resume", () => {
    const { edits, done } = applied(action({ op: "copy_section", section: "Projects", targets: ["other"], value: "add" }))
    expect(edits.other.projectsSection).toEqual([{ id: 1, projectName: "Engine Notes" }])
    expect(edits.master).toBeUndefined()
    expect(done).toEqual(["Copied it to Frontend."])
  })

  test("never change the resumes they're given", () => {
    const before = structuredClone(resumes)
    applied(action({ op: "delete_entry", section: "Work", entry: 1 }), action({ op: "set_profile", fields: [{ key: "email", value: "" }] }))
    expect(resumes).toEqual(before)
  })
})
