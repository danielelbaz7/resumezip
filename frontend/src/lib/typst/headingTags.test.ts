// Every template's headings are tagged as headings in its PDF (issue #261):
// the name as H1, then each section's title as H2 (H1 on a resume without a
// name), in reading order. A screen reader lists a PDF's headings from these
// tags and moves between them, as it does a web page's. The tags don't change
// how the templates print them: each goes through `tagged-heading` in
// templates/common.typ.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { describe, expect, test } from "vitest"
import { comparable } from "@/lib/check/pdf"
import { printedHeadings, render, samples } from "@/lib/import/testRender"
import { toTemplateData } from "./resumeData"

/** A node of pdf.js's structure tree: an element with its role, or a piece of marked content by its id. */
interface StructNode {
  role?: string
  type?: string
  id?: string
  children?: StructNode[]
}

/** The PDF's headings, from its structure tree, as their tag and text, in reading order. */
async function headingTags(pdf: Uint8Array): Promise<{ tag: string; text: string }[]> {
  const doc = (await getDocument({ data: pdf, isEvalSupported: false }).promise) as unknown as PDFDocumentProxy
  try {
    const headings: { tag: string; text: string }[] = []
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number)
      // The text of each piece of marked content, which the tree's leaves name by id.
      const { items } = await page.getTextContent({ includeMarkedContent: true })
      const texts = new Map<string, string>()
      const open: string[] = []
      for (const item of items as { type?: string; id?: string; str?: string }[]) {
        if (item.type === "beginMarkedContentProps" || item.type === "beginMarkedContent") open.push(item.id ?? "")
        else if (item.type === "endMarkedContent") open.pop()
        else if (item.str !== undefined) for (const id of open) if (id) texts.set(id, (texts.get(id) ?? "") + item.str)
      }
      const textOf = (node: StructNode): string =>
        node.type === "content" ? (texts.get(node.id ?? "") ?? "") : (node.children ?? []).map(textOf).join(" ")
      const walk = (node: StructNode) => {
        if (node.role && /^H\d$/.test(node.role)) headings.push({ tag: node.role, text: textOf(node) })
        else for (const child of node.children ?? []) walk(child)
      }
      const tree = (await page.getStructTree()) as StructNode | null
      if (tree) walk(tree)
    }
    return headings
  } finally {
    await doc.destroy()
  }
}

/**
 * The headings the resume should have tagged: its name as H1, then each printed
 * section's title as H2, or as H1 when there's no name to go under.
 */
function expectedHeadings(resume: Record<string, unknown>) {
  const { profile } = toTemplateData(resume)
  const section = profile.name ? "H2" : "H1"
  return [
    ...(profile.name ? [{ tag: "H1", text: comparable(profile.name) }] : []),
    ...printedHeadings(resume).map((heading) => ({ tag: section, text: comparable(heading) })),
  ]
}

const tagged = async (resume: Record<string, unknown>) =>
  (await headingTags(await render(resume))).map(({ tag, text }) => ({ tag, text: comparable(text) }))

const talks = "11111111-1111-4111-8111-111111111111"
const notes = "22222222-2222-4222-8222-222222222222"

describe.each(samples.map((sample) => [sample.selectedTemplate as string, sample]))("the %s sample's PDF", (template, sample) => {
  test("tags the name as H1 and each section's title as H2, in reading order", async () => {
    expect(await tagged(sample), template).toEqual(expectedHeadings(sample))
  })

  test("tags the summary's heading, a heading the person wrote, and sections they added too", async () => {
    const resume = {
      ...sample,
      profileSection: { ...sample.profileSection, summary: "Engineer who keeps systems fast and boring." },
      headings: { ...sample.headings, work: "Where I've worked" },
      sectionOrder: [...sample.sectionOrder, `extra:${talks}`, `extra:${notes}`],
      extraSections: {
        [talks]: { kind: "list", heading: "Talks", bullets: "• On fast tools" },
        [notes]: { kind: "text", heading: "Interests", text: "Climbing and bread." },
      },
    }
    const expected = expectedHeadings(resume)
    expect(expected.map(({ text }) => text)).toEqual(expect.arrayContaining(["summary", "whereiveworked", "talks", "interests"]))
    expect(await tagged(resume), template).toEqual(expected)
  })
})

// A screen reader would announce an empty heading with nothing in it, and
// headings that start at H2 read as if one above them is missing.
test("a resume without a name tags no empty heading, and its section titles as H1", async () => {
  for (const sample of samples) {
    const resume = { ...sample, profileSection: { ...sample.profileSection, fullName: "" } }
    const tags = await tagged(resume)
    expect(
      tags.filter(({ text }) => text === ""),
      sample.selectedTemplate,
    ).toEqual([])
    expect(tags[0]?.tag, sample.selectedTemplate).toBe("H1")
    expect(tags, sample.selectedTemplate).toEqual(expectedHeadings(resume))
  }
}, 60_000)
