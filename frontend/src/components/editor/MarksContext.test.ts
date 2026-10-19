// The checks' marks on the editor's preview, rendered as the server renders
// them: the first render, before any effect runs.

import { createElement, type ComponentProps } from "react"
import { renderToString } from "react-dom/server"
import { expect, test, vi } from "vitest"
import { runChecks, type Rule } from "@/lib/check/engine"
import { pdfLayoutOf } from "@/lib/check/extraPdf"
import { viewOf } from "@/lib/check/resume"
import { readForChecks } from "@/lib/import/read"
import { readBack, render, samples } from "@/lib/import/testRender"
import { MarksProvider, PreviewMarks } from "./MarksContext"

vi.mock("@/context/ResumeContext", () => ({ useOpenResume: () => ({ id: "sample" }) }))

const sample = samples.find((resume) => resume.selectedTemplate === "jake")!

// A finding on the first job's first bullet, which is printed on page 1.
const rule: Rule = {
  id: "T1",
  category: "bullets",
  level: "look",
  title: "Test",
  why: "Test",
  reads: "form",
  check: () => ({
    checked: 1,
    problems: [{ place: { kind: "entry", section: "Work", entry: 0, field: "workDescription", line: 0 }, message: "A duty" }],
  }),
}

test("the preview's marks are drawn over the PDF they were measured on, not one still on screen from before", async () => {
  const { parsed, pages } = await readBack(await render(sample))
  const read = readForChecks(parsed.lines, pdfLayoutOf(viewOf(sample)))
  const pdf = { lines: read.parsed.lines, pages, ...read }
  const report = runChecks(sample, { rules: [rule], pdf })
  const marked = (drawn: string) => {
    const props: ComponentProps<typeof MarksProvider> = {
      report,
      reading: pdf,
      file: "blob:new",
      mode: "check",
      open: () => {},
      children: createElement(PreviewMarks, { page: 1, file: drawn }),
    }
    return renderToString(createElement(MarksProvider, props))
  }
  expect(marked("blob:new")).toContain("A duty")
  expect(marked("blob:old")).not.toContain("A duty")
})
