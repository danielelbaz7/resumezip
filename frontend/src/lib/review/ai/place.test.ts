import { expect, test } from "vitest"
import { viewOf } from "@/lib/check/resume"
import { samples } from "@/lib/import/testRender"
import { placeOfNote, placeOfQuote } from "./place"
import type { SavedNote } from "./saved"

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

test("a bullet rewritten after its first words isn't found by them", () => {
  const start = first.split(" ").slice(0, 4).join(" ")
  expect(placeOfQuote(view, `${start} for customer support teams`)).toBeNull()
})

test("finds words in a custom section's text, which has no bullets", () => {
  const id = "11111111-1111-4111-8111-111111111111"
  const custom = viewOf({
    ...sample,
    extraSections: { [id]: { kind: "text", heading: "About", text: "I build **tools** that teams rely on every day." } },
    sectionOrder: [...(sample.sectionOrder ?? []), `extra:${id}`],
  })
  expect(placeOfQuote(custom, "tools that teams rely on")).toEqual({ kind: "extra-text", sectionId: id, field: "text" })
})

test("an empty quote has no place", () => {
  expect(placeOfQuote(view, "")).toBeNull()
  expect(placeOfQuote(view, " – ")).toBeNull()
})

const note = (fields: Partial<SavedNote>): SavedNote => ({
  tone: "red",
  line: "",
  quote: "",
  title: "Vague",
  why: "Says nothing.",
  suggestion: null,
  text: null,
  ...fields,
})

test("a note about a whole line, or with a reworded quote, is found by its line's words", () => {
  expect(placeOfNote(view, note({ text: second }))).toMatchObject({ field: "workDescription", line: 1 })
  expect(placeOfNote(view, note({ quote: "Added tracing and found a slow lookup", text: second }))).toMatchObject({ line: 1 })
  // A printed line that starts with a two-word job title, then its dates.
  const [job, ...jobs] = sample.workExperienceSection
  const analyst = viewOf({ ...sample, workExperienceSection: [{ ...job, workRole: "Data Analyst" }, ...jobs] })
  expect(placeOfNote(analyst, note({ text: `Data Analyst ${job.workStartDate} – ${job.workEndDate}` }))).toMatchObject({
    field: "workRole",
  })
  // Never on a line, or its line rewritten since: no place.
  expect(placeOfNote(view, note({ quote: "nowhere on this resume" }))).toBeNull()
  expect(placeOfNote(view, note({ text: "Responsible for synergy across many teams" }))).toBeNull()
})
