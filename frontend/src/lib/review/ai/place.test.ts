import { expect, test } from "vitest"
import { viewOf } from "@/lib/check/resume"
import { samples } from "@/lib/import/testRender"
import { placeOfQuote } from "./place"

const sample = samples.find((resume) => resume.selectedTemplate === "jake")!
const view = viewOf(sample)
const [first, second] = (sample.workExperienceSection[0].workDescription as string).split("\n").map((bullet) => bullet.slice(2))

test("finds the bullet, profile field or entry field the quoted words are in", () => {
  expect(placeOfQuote(view, first.split(" ").slice(2, 7).join(" "))).toEqual({
    kind: "entry",
    section: "Work",
    entry: 0,
    field: "workDescription",
    line: 0,
  })
  expect(placeOfQuote(view, second.split(" ").slice(0, 5).join(" "))).toMatchObject({ field: "workDescription", line: 1 })
  expect(placeOfQuote(view, sample.profileSection.email)).toEqual({ kind: "profile", field: "email" })
  expect(placeOfQuote(view, sample.workExperienceSection[1].companyName)).toMatchObject({ kind: "entry", section: "Work", entry: 1 })
})

test("a quote across two printed fields is found by its first words, and one that's been rewritten isn't found", () => {
  const { degree, gpa } = sample.educationSection[0]
  expect(placeOfQuote(view, `${degree} (GPA: ${gpa})`)).toMatchObject({ kind: "entry", section: "Education", field: "degree" })
  expect(placeOfQuote(view, "Responsible for synergy across many teams")).toBeNull()
})
