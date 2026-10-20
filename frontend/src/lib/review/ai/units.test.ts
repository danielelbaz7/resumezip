import { expect, test } from "vitest"
import { pdfLayoutOf } from "@/lib/check/extraPdf"
import { viewOf } from "@/lib/check/resume"
import { readForChecks } from "@/lib/import/read"
import { reading } from "@/lib/check/testPdf"
import { readBack, render, samples } from "@/lib/import/testRender"
import { userPrompt } from "./prompt"
import { unitsOf, unitsToSend, type Unit } from "./units"

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

test("there's nothing to send without a reading of the PDF, or without a line on it", () => {
  const view = viewOf(sample)
  expect(unitsToSend(view, null)).toBeNull()
  expect(unitsToSend(view, reading([]))).toBeNull()
})
