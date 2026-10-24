import { describe, expect, test } from "vitest"
import { arrangedSection, SECTIONS } from "./sections"

describe("Experience with the role printed first", () => {
  const keys = (chosen: unknown) => arrangedSection(SECTIONS.Work, chosen).fields.map((field) => field.key)

  test("swaps the role and company in the form, each with its own label and placeholder, and names the card by the role", () => {
    const arranged = arrangedSection(SECTIONS.Work, "role")
    expect(keys("role").slice(0, 2)).toEqual(["companyName", "workRole"])
    expect(arranged.card).toEqual(["workRole"])
    const company = arranged.fields.find((field) => field.key === "companyName")
    expect(company).toEqual(SECTIONS.Work.fields.find((field) => field.key === "companyName"))
    // The rest stay where they are.
    expect(keys("role").slice(2)).toEqual(keys(undefined).slice(2))
  })

  test("leaves the section as it's defined with the company first, or a value it doesn't know", () => {
    for (const chosen of [undefined, "company", "manager"]) expect(arrangedSection(SECTIONS.Work, chosen)).toBe(SECTIONS.Work)
  })
})
