import { describe, expect, test } from "vitest"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { linesFromPages, readPdf } from "@/lib/import/lines"
import { render } from "@/lib/import/testRender"
import { TEMPLATES } from "@/lib/templates"
import { asSaved } from "@/lib/testResume"
import { toTemplateData } from "./resumeData"

// Half of an emoji: a surrogate without its pair, as an opened file or a
// paste can bring. JSON.stringify writes it as an escape that Typst won't read.
const HIGH_HALF = "\ud83d"
const LOW_HALF = "\ude80"
const extra = "b8911364-19cb-4f20-82c1-421bdbe40f7d"

async function printedText(resume: Record<string, unknown>): Promise<string> {
  const doc = (await getDocument({ data: await render(resume), isEvalSupported: false, fontExtraProperties: true })
    .promise) as unknown as PDFDocumentProxy
  try {
    return linesFromPages(await readPdf(doc))
      .map((line) => line.text)
      .join("\n")
  } finally {
    await doc.destroy()
  }
}

describe("half of an emoji", () => {
  test("is dropped from every printed field, and whole emoji are kept", () => {
    const data = toTemplateData(
      asSaved({
        profileSection: { fullName: `Ada ${HIGH_HALF}`, summary: `Ships 🚀 fast${LOW_HALF}` },
        workExperienceSection: [{ id: 1, companyName: `${LOW_HALF}${HIGH_HALF}Acme`, workDescription: `• Cut costs ${HIGH_HALF}` }],
        extraSections: { [extra]: { kind: "text", heading: `Talks ${HIGH_HALF}`, text: "Spoke at a meetup." } },
        sectionOrder: ["Work", `extra:${extra}`],
      }),
    )
    expect(data.profile.name).toBe("Ada")
    expect(data.summary).toEqual(["Ships 🚀 fast"])
    expect(data.work[0].company).toBe("Acme")
    expect(data.work[0].bullets).toEqual([[{ text: "Cut costs", bold: false, italic: false }]])
    expect(data.extras[`extra:${extra}`].heading).toBe("Talks")
    expect(JSON.stringify(data)).not.toMatch(/\\ud[89a-f]/i)
  })

  test.each(TEMPLATES.map(({ id }) => id))("doesn't stop %s from printing", async (id) => {
    // Some templates print the name in capitals.
    expect(await printedText({ selectedTemplate: id, profileSection: { fullName: `Ada ${HIGH_HALF}` } })).toMatch(/\bAda\b/i)
  })
})
