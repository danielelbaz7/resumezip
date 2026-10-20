import { expect, test } from "vitest"
import { runChecks } from "@/lib/check/engine"
import type { Resume } from "@/lib/resume"
import { reviewRules } from "./rules"

// A name the templates' fonts can't print, which a PDF made elsewhere printed fine.
const resume: Resume = {
  profileSection: { fullName: "王小明", email: "xiaoming@example.com", phoneNumber: "(512) 555-0142" },
  workExperienceSection: [
    {
      id: 1,
      workRole: "Software Engineer",
      companyName: "Stripe",
      workStartDate: "Jan 2024",
      workEndDate: "Present",
      workDescription: "• Built the ledger",
    },
  ],
}
const printed = (asIs: boolean) => runChecks(resume, { rules: reviewRules(asIs) }).findings.filter(({ rule }) => rule === "R8")

test("a PDF reviewed as it came isn't checked against what the templates' fonts can print", () => {
  expect(printed(true)).toEqual([])
})

test("a file the review prints in a template still is", () => {
  expect(printed(false).map(({ message }) => message)).toEqual(["“王小明” doesn't print"])
})
