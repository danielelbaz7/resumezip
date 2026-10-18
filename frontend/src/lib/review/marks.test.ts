import { expect, test } from "vitest"
import { runChecks, type Rule } from "@/lib/check/engine"
import { pdfLayoutOf } from "@/lib/check/extraPdf"
import { viewOf } from "@/lib/check/resume"
import { readForChecks } from "@/lib/import/read"
import { readBack, render, samples } from "@/lib/import/testRender"
import { marksOf } from "./marks"

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

  const textAt = (box: [number, number, number, number]) => pdf.lines.find((line) => line.box === box)?.text ?? ""
  expect(bullet?.page).toBe(1)
  expect(bullet!.boxes.map(textAt).join(" ")).toContain("Responsible for various tasks related to testing")
  // Each of the second job's bullets, from its first line to its last.
  const [first, ...rest] = (sample.workExperienceSection[1].workDescription as string).split("\n").map((bullet) => bullet.slice(2))
  const marked = role!.boxes.map(textAt).join(" ")
  expect(marked.startsWith(first.slice(0, 40))).toBe(true)
  for (const bullet of rest) expect(marked).toContain(bullet.split(" ").slice(-3).join(" "))
  expect(email?.boxes.map(textAt).join(" ")).toContain(sample.profileSection.email)
  expect(section).toBeNull()
})

test("nothing is marked without a reading of the PDF", () => {
  const report = runChecks(weak, { rules: [notes] })
  expect(marksOf(report.view, report.findings, null)).toEqual([null, null, null, null])
})
