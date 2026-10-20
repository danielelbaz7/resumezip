import { expect, test } from "vitest"
import type { SavedNote } from "./saved"
import { keptNotesOf, notesNowOf, notesOf } from "./answer"
import type { Unit } from "./units"

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
        // A quote that's its line reworded: the whole line is marked.
        note({ line: "u1", quote: "Responsible for work on the backend services", tone: "green" }),
        // A quote that isn't on the resume, and isn't about the line it names: listed under the page.
        note({ line: "u1", quote: "led a team of nine" }),
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

const saved = (fields: Partial<SavedNote>): SavedNote => ({
  tone: "red",
  line: "",
  quote: "",
  title: "Vague",
  why: "Says nothing.",
  suggestion: null,
  text: null,
  ...fields,
})

test("notes are kept as they're shown: capped and one per line, each with its line and that line's words", () => {
  const kept = keptNotesOf(
    [
      saved({ line: "u1", quote: "Responsible for" }),
      saved({ line: "u1", quote: "backend services" }),
      saved({ line: "u1", quote: "Built a dashboard" }),
      saved({ line: "u7", quote: "nowhere at all" }),
    ],
    units,
  )
  expect(kept.map(({ line, quote, text }) => [line, quote, text])).toEqual([
    ["u1", "Responsible for", units[0].text],
    ["u2", "Built a dashboard", units[1].text],
    ["", "nowhere at all", null],
  ])
  // Read back against the same lines, they're the same notes on the same lines.
  expect(notesOf({ notes: kept }, units).map(({ unit }) => unit?.id ?? null)).toEqual(["u1", "u2", null])
})

test("on an edited resume, a kept note is found by its words or its line's, never by an id that's moved", () => {
  const kept = keptNotesOf(
    [
      // About the whole line: no quote.
      saved({ line: "u2", quote: "" }),
      // Reworded by the AI.
      saved({ line: "u1", quote: "Responsible for work on the backend services", tone: "green" }),
    ],
    units,
  )
  // A line added at the top: every id moves down one, and u2 is now the first bullet.
  const added = [unit("u1", "Led the move to a new billing system"), ...units.map((each, index) => ({ ...each, id: `u${index + 2}` }))]
  expect(notesNowOf(kept, added).map(({ unit }) => unit?.text ?? null)).toEqual([units[1].text, units[0].text])
  // The first bullet rewritten: its note has no line, rather than landing on the one that took its id.
  const rewritten = [unit("u1", "Cut API errors by half by retrying timeouts"), units[1]]
  expect(notesNowOf(kept, rewritten).map(({ unit }) => unit?.id ?? null)).toEqual(["u2", null])
})
