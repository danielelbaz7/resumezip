import { expect, test } from "vitest"
import { runChecks, type Finding, type Rule } from "@/lib/check/engine"
import { pdfLayoutOf } from "@/lib/check/extraPdf"
import { viewOf } from "@/lib/check/resume"
import type { Level } from "@/lib/check/settings"
import { readForChecks } from "@/lib/import/read"
import { readBack, render, samples } from "@/lib/import/testRender"
import type { AiNote } from "./ai/answer"
import { aiScribbleOf, marksOf, scribbleOf, wordBox, type Box, type MarkedLine } from "./marks"

const sample = samples.find((resume) => resume.selectedTemplate === "jake")!
// The first job's first bullet, made a duty with nothing to show for it.
const weak = {
  ...sample,
  workExperienceSection: sample.workExperienceSection.map((entry: Record<string, unknown>, index: number) =>
    index === 0 ? { ...entry, workDescription: `• Responsible for various tasks related to testing\n${entry.workDescription}` } : entry,
  ),
}

// A rule that finds something at four places: a bullet, a role's bullets as a whole, a field, and a
// whole section, which has no line of its own.
const notes: Rule = {
  id: "T1",
  category: "bullets",
  level: "look",
  title: "Test",
  why: "Test",
  reads: "form",
  check: () => ({
    checked: 4,
    problems: [
      { place: { kind: "entry", section: "Work", entry: 0, field: "workDescription", line: 0 }, message: "A duty" },
      { place: { kind: "entry", section: "Work", entry: 1, field: "workDescription" }, message: "No results" },
      { place: { kind: "profile", field: "email" }, message: "An email" },
      { place: { kind: "section", section: "Skills" }, message: "A section", text: "" },
    ],
  }),
}

test("marks a bullet on its lines, a role's bullets on all of theirs, a field on its line, and leaves out what has no line", async () => {
  const { parsed, pages } = await readBack(await render(weak))
  const read = readForChecks(parsed.lines, pdfLayoutOf(viewOf(weak)))
  const pdf = { lines: read.parsed.lines, pages, ...read }
  const report = runChecks(weak, { rules: [notes], pdf })
  const [bullet, role, email, section] = marksOf(report.view, report.findings, pdf)

  const textOf = (mark: typeof bullet) => mark!.lines.map((line) => line.text).join(" ")
  expect(bullet?.page).toBe(1)
  expect(textOf(bullet)).toContain("Responsible for various tasks related to testing")
  // Each of the second job's bullets, from its first line to its last.
  const [first, ...rest] = (sample.workExperienceSection[1].workDescription as string).split("\n").map((bullet) => bullet.slice(2))
  const marked = textOf(role)
  expect(marked.startsWith(first.slice(0, 40))).toBe(true)
  for (const bullet of rest) expect(marked).toContain(bullet.split(" ").slice(-3).join(" "))
  expect(textOf(email)).toContain(sample.profileSection.email)
  expect(section).toBeNull()
})

test("nothing is marked without a reading of the PDF", () => {
  const report = runChecks(weak, { rules: [notes] })
  expect(marksOf(report.view, report.findings, null)).toEqual([null, null, null, null])
})

// Every character as wide as the next, so where a word is printed is easy to work out.
const measure = (text: string) => text.length
const printed = (parts: [string, number][], box: Box): MarkedLine => ({
  parts: parts.map(([text, x]) => ({ text, x, runs: [] })),
  text: parts.map(([text]) => text).join(" "),
  bullet: true,
  left: box[0],
  x: parts[0][1],
  size: 10,
  bold: false,
  italic: false,
  links: [],
  page: 1,
  box,
})
// 29 characters printed across 290 points, after a bullet: 10 points each.
const duty = printed([["Responsible for various tasks", 60]], [50, 100, 350, 112])
const more = printed([["across the release", 60]], [50, 113, 240, 125])
// Two parts, the last 17 characters across 85 points: 5 points each.
const role = printed(
  [
    ["Google", 50],
    ["Mountain View, CA", 400],
  ],
  [50, 130, 485, 142],
)

test("finds a word where it's printed, as a whole word, in the part of its line it's in", () => {
  expect(wordBox([duty], "various", measure)).toEqual([220, 100, 290, 112])
  expect(wordBox([duty], "RESPONSIBLE FOR", measure)).toEqual([60, 100, 210, 112])
  expect(wordBox([duty], "task", measure)).toBeNull()
  expect(wordBox([role], "View", measure)).toEqual([445, 130, 465, 142])
  expect(wordBox([role], "Google", measure)).toEqual([50, 130, 80, 142])
  expect(wordBox([duty, role], "Google", measure)?.[1]).toBe(130)
})

test("finds a quoted word on a real template's line", async () => {
  const { parsed, pages } = await readBack(await render(weak))
  const read = readForChecks(parsed.lines, pdfLayoutOf(viewOf(weak)))
  const pdf = { lines: read.parsed.lines, pages, ...read }
  const report = runChecks(weak, { rules: [notes], pdf })
  const [mark] = marksOf(report.view, report.findings, pdf)
  const [line] = mark!.lines
  const [left, top, right, bottom] = wordBox(mark!.lines, "various", measure)!
  // After “Responsible for ”, on the same line, and about as wide as the word.
  expect(left).toBeGreaterThan(line.x + 30)
  expect([top, bottom]).toEqual([line.box[1], line.box[3]])
  expect(right).toBeLessThan(line.box[2])
  expect(right - left).toBeGreaterThan(15)
})

const note = (message: string, level: Level = "look", advisory?: boolean): Finding => ({
  rule: "T1",
  level,
  advisory,
  category: "bullets",
  place: { kind: "section", section: "Skills" },
  message,
  why: "",
  text: "",
  key: message,
  dismissed: false,
})

test("scribbles round the words a note quotes where they're printed, or else beside its lines", () => {
  const one = { page: 1, lines: [duty] }
  const two = { page: 1, lines: [duty, more] }
  expect(scribbleOf(note("“Responsible for” is a weak start"), two, measure)).toEqual({ kind: "box", boxes: [[60, 100, 210, 112]] })
  expect(scribbleOf(note("“various” is vague"), two, measure)).toEqual({ kind: "circle", boxes: [[220, 100, 290, 112]] })
  expect(scribbleOf(note("“various” may be misspelled", "fix"), one, measure).kind).toBe("strike")
  expect(scribbleOf(note("“various” may be misspelled", "fix", true), one, measure).kind).toBe("circle")
  // Quoting nothing, or what isn't printed there.
  expect(scribbleOf(note("Could you add the scope or result?"), two, measure)).toEqual({ kind: "bracket", boxes: [duty.box, more.box] })
  expect(scribbleOf(note("“Led” starts 2 nearby bullets"), one, measure)).toEqual({ kind: "underline", boxes: [duty.box] })
  expect(scribbleOf(note("A date in the future", "fix"), one, measure)).toEqual({ kind: "box", boxes: [duty.box] })
})

test("an AI's red flag circles a few words, underlines more, and marks a whole bullet beside it; a green flag underlines", () => {
  const unit = { id: "u1", bullet: true, text: `${duty.text} ${more.text}`, page: 1, lines: [duty, more] }
  const flag = (tone: AiNote["tone"], quote: string | null): AiNote => ({
    index: 0,
    tone,
    title: "",
    why: "",
    suggestion: null,
    unit,
    quote,
  })
  expect(aiScribbleOf(flag("red", "various"), measure)).toEqual({ kind: "circle", boxes: [[220, 100, 290, 112]] })
  const long = printed([["Built a deploy tool for the team", 60]], [50, 140, 350, 152])
  expect(aiScribbleOf({ ...flag("red", "a deploy tool for the team"), unit: { ...unit, lines: [long] } }, measure)?.kind).toBe("underline")
  expect(aiScribbleOf(flag("red", null), measure)).toEqual({ kind: "bracket", boxes: [duty.box, more.box] })
  // A green flag only underlines: its words, or its lines.
  expect(aiScribbleOf(flag("green", "various"), measure)).toEqual({ kind: "underline", boxes: [[220, 100, 290, 112]] })
  expect(aiScribbleOf(flag("green", null), measure)).toEqual({ kind: "underline", boxes: [duty.box, more.box] })
  expect(aiScribbleOf({ ...flag("red", "various"), unit: null }, measure)).toBeNull()
})
