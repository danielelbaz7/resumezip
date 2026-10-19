import { expect, test } from "vitest"
import { pdfLayoutOf } from "@/lib/check/extraPdf"
import { viewOf } from "@/lib/check/resume"
import { readForChecks } from "@/lib/import/read"
import { readBack, render, samples } from "@/lib/import/testRender"
import { notesOf } from "./answer"
import { userPrompt } from "./prompt"
import { unitsOf, type Unit } from "./units"

const sample = samples.find((resume) => resume.selectedTemplate === "jake")!

async function unitsOfSample(): Promise<Unit[]> {
  const { parsed, pages } = await readBack(await render(sample))
  const view = viewOf(sample)
  const read = readForChecks(parsed.lines, pdfLayoutOf(view))
  return unitsOf(view, { lines: read.parsed.lines, pages, ...read })
}

test("numbers the printed lines in order, a wrapped bullet as one", async () => {
  const units = await unitsOfSample()
  expect(units.map((unit) => unit.id)).toEqual(units.map((_, index) => `u${index + 1}`))
  expect(units[0].text).toBe(sample.profileSection.fullName)
  // Each typed bullet is one line for the model, however many lines it's printed on.
  const bullets = (sample.workExperienceSection[0].workDescription as string).split("\n").map((bullet) => bullet.slice(2))
  for (const bullet of bullets) expect(units.filter((unit) => unit.text === bullet)).toHaveLength(1)
  expect(units.some((unit) => unit.lines.length > 1)).toBe(true)
  // Relevant Coursework isn't one of the form's bullets, and wraps: it's kept whole too.
  const coursework = units.find((unit) => unit.text.startsWith("Relevant Coursework"))!
  expect(coursework.text).toContain("Machine Learning")
  expect(coursework.bullet).toBe(true)
  expect(userPrompt(units)).toContain(`[${coursework.id}] • Relevant Coursework`)
})

const unit = (id: string, text: string): Unit => ({ id, bullet: true, text, page: 1, lines: [] })
const units = [unit("u1", "Responsible for working on backend services"), unit("u2", "Built a dashboard for 40 release engineers")]
const note = (fields: Record<string, unknown>) => ({
  tone: "red",
  title: "Vague",
  why: "Says nothing.",
  suggestion: "Rewrite it",
  ...fields,
})

test("places each note on its line, by its quote when the id is wrong", () => {
  const notes = notesOf(
    {
      notes: [
        note({ line: "u1", quote: "Responsible for" }),
        note({ line: "[u2]", quote: "40 release engineers", tone: "green" }),
        // The wrong id: its quote is on u2.
        note({ line: "u1", quote: "Built a dashboard" }),
        // A quote that isn't on the resume: the whole line is marked.
        note({ line: "u1", quote: "led a team of nine", tone: "green" }),
        // Neither: listed under the page.
        note({ line: "u9", quote: "nowhere at all" }),
      ],
    },
    units,
  )
  expect(notes.map(({ unit, quote }) => [unit?.id ?? null, quote])).toEqual([
    ["u1", "Responsible for"],
    ["u2", "40 release engineers"],
    ["u2", "Built a dashboard"],
    ["u1", null],
    [null, null],
  ])
  expect(notes[1].suggestion).toBeNull()
})

test("keeps one note of each kind per line, and at most 10 red and 6 green", () => {
  expect(
    notesOf({ notes: [note({ line: "u1", quote: "Responsible" }), note({ line: "u1", quote: "backend services" })] }, units),
  ).toHaveLength(1)
  const many = Array.from({ length: 12 }, (_, index) => [note({ line: `u${index}` }), note({ line: `u${index}`, tone: "green" })]).flat()
  const notes = notesOf({ notes: many }, units)
  expect(notes.filter((each) => each.tone === "red")).toHaveLength(10)
  expect(notes.filter((each) => each.tone === "green")).toHaveLength(6)
})

test("leaves out what isn't a note", () => {
  expect(notesOf(null, units)).toEqual([])
  expect(notesOf({ notes: "none" }, units)).toEqual([])
  expect(notesOf({ notes: [null, 3, note({ tone: "amber" }), note({ title: "" }), note({ why: 4 })] }, units)).toEqual([])
})
