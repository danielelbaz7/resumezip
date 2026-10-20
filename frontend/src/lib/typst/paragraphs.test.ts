// A blank line in the summary or a text section starts a new paragraph, and
// each template has to show it: paragraphs set as close as lines read as one.
// It adds 0.6em to the space between two lines (prose in
// templates/common.typ), whatever paragraph spacing the template sets.

import { expect, test } from "vitest"
import type { PdfPage } from "@/lib/import/lines"
import { pagesOf, render } from "@/lib/import/testRender"
import { TEMPLATES } from "@/lib/templates"

const NOTES = "b8911364-19cb-4f20-82c1-421bdbe40f7d"

/** The printed piece of text starting with `text`. Throws unless all of them are on the first page. */
function find([page, ...rest]: PdfPage[], text: string): PdfPage["items"][number] {
  const item = page.items.find((item) => item.text.trimStart().startsWith(text))
  if (!item || rest.length > 0) throw new Error(`"${text}" isn't printed on the only page`)
  return item
}

test.each(TEMPLATES.map((template) => template.id))("%s leaves a gap between paragraphs in the summary and a text section", async (id) => {
  const pages = await pagesOf(
    await render({
      selectedTemplate: id,
      profileSection: { fullName: "Ada Lovelace", summary: "Alpha line one.\nBeta line two.\n\nGamma new paragraph." },
      extraSections: { [NOTES]: { kind: "text", heading: "Notes", text: "Delta line one.\nEpsilon line two.\n\nZeta new paragraph." } },
      sectionOrder: [`extra:${NOTES}`],
    }),
  )
  for (const words of [
    ["Alpha", "Beta", "Gamma"],
    ["Delta", "Epsilon", "Zeta"],
  ]) {
    const [first, second, next] = words.map((text) => find(pages, text))
    const lineBreak = first.baseline - second.baseline
    const paragraphBreak = second.baseline - next.baseline
    expect(lineBreak, `${words[0]}: lines go down the page`).toBeGreaterThan(0)
    expect((paragraphBreak - lineBreak) / next.size, `${words[2]}: the space a blank line adds, in ems`).toBeCloseTo(0.6, 1)
  }
})
