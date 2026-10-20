// Harvard's header, checked on the printed page: however tightly Fine-tune,
// or keeping to one page, sets the space between sections, the first heading
// stays clear of the contact line above it.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { expect, test } from "vitest"
import { readPdf, type PdfPage } from "@/lib/import/lines"
import { render, samples } from "@/lib/import/testRender"
import type { Tune } from "@/lib/tune"

const sample: Record<string, unknown> = samples.find((resume) => resume.selectedTemplate === "resumeworded")

// EB Garamond's capital height and the depth of its descenders, in em, from
// its OS/2 table. Its deepest letters (g, j, p, q, y) and the contact line's
// "|" go 0.285 to 0.29 em down.
const CAP_HEIGHT = 0.65
const DESCENDER = 0.298

// Harvard sets a line's capitals 5.78 pt under the baseline of the line
// above, at its 10.8 pt text size, which leaves this much clear under that
// line's descenders, in em. The first heading shouldn't come any closer to
// the contact line.
const CLEAR = 5.78 / 10.8 - DESCENDER

async function firstPage(pdf: Uint8Array): Promise<PdfPage> {
  const doc = (await getDocument({ data: pdf, isEvalSupported: false, fontExtraProperties: true }).promise) as unknown as PDFDocumentProxy
  try {
    return (await readPdf(doc))[0]
  } finally {
    await doc.destroy()
  }
}

/**
 * Where the sample's first heading and the line above it, the contact line,
 * are printed: their baselines, the contact line's text size, and the space
 * between the bottom of its descenders and the top of the heading's capitals.
 */
async function header(tune?: Tune) {
  const page = await firstPage(await render({ ...sample, tune }))
  const heading = page.items.find((item) => item.text === "EDUCATION")
  if (!heading) throw new Error("EDUCATION isn't printed on the first page")
  const contact = Math.min(...page.items.filter((item) => item.baseline > heading.baseline + 1).map((item) => item.baseline))
  const size = Math.max(...page.items.filter((item) => Math.abs(item.baseline - contact) < 1).map((item) => item.size))
  return {
    contact,
    heading: heading.baseline,
    size,
    clear: contact - DESCENDER * size - (heading.baseline + CAP_HEIGHT * heading.size),
  }
}

// The least space between sections, at the smallest and the largest text; where
// keeping to one page first stops; and the most.
test.each<Tune>([{ gap: 0.3, size: 0.85, leading: 0.8, margin: 0.6 }, { gap: 0.3, size: 1.15 }, { gap: 0.5 }, { gap: 1.7, size: 0.85 }])(
  "keeps the first heading clear of the contact line, tuned %o",
  async (tune) => {
    const { clear, size } = await header(tune)
    expect(clear).toBeGreaterThanOrEqual(CLEAR * size)
  },
)

test("takes 3.5 pt off the space above the first heading, at the template's own spacing", async () => {
  const { contact, heading } = await header()
  // The space above every heading, less 3.5 pt, then the heading's 12 pt capitals.
  expect(contact - heading).toBeCloseTo(17.85 - 3.5 + CAP_HEIGHT * 12, 2)
})
