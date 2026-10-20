import { describe, expect, test } from "vitest"
import { linesFromPages } from "@/lib/import/lines"
import { pagesOf, render } from "@/lib/import/testRender"
import { TEMPLATES } from "@/lib/templates"
import { asSaved } from "@/lib/testResume"
import { toTemplateData } from "./resumeData"

// Half of an emoji: a surrogate without its pair, as an opened file or a
// paste can bring. JSON.stringify writes it as an escape that Typst won't read.
const HIGH_HALF = "\ud83d"
const LOW_HALF = "\ude80"
const extra = "b8911364-19cb-4f20-82c1-421bdbe40f7d"

async function printedText(resume: Record<string, unknown>): Promise<string> {
  return linesFromPages(await pagesOf(await render(resume)))
    .map((line) => line.text)
    .join("\n")
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
    expect(data.summary).toEqual([[[{ text: "Ships 🚀 fast", bold: false, italic: false }]]])
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

// Accents as separate combining marks (NFD), as text pasted from macOS or a
// PDF, and some Vietnamese keyboards, give them.
const NAME = "Nguyễn Thị Ánh".normalize("NFC")
const DECOMPOSED = NAME.normalize("NFD")
// A zero-width space, a soft hyphen, a word joiner and a byte order mark.
const INVISIBLE = "\u200b\u00ad\u2060\ufeff"

describe("typed text as printed", () => {
  test("accents are composed, and saved data stays as typed", () => {
    const resume = asSaved({ profileSection: { fullName: DECOMPOSED } })
    expect(toTemplateData(resume).profile.name).toBe(NAME)
    expect(resume.profileSection?.fullName).toBe(DECOMPOSED)
  })

  test("a field of only invisible characters is empty", () => {
    const data = toTemplateData(
      asSaved({
        profileSection: { fullName: "Ada Lovelace", summary: INVISIBLE },
        headings: { work: "\u200b" },
        workExperienceSection: [
          { id: 1, companyName: "\u00ad", workRole: "\u2060" },
          { id: 2, companyName: "Acme", workDescription: "• Shipped it\n• \u200b" },
        ],
        extraSections: { [extra]: { kind: "text", heading: INVISIBLE, text: "\u200b\n\n\ufeff" } },
        sectionOrder: ["Work", `extra:${extra}`],
      }),
    )
    expect(data.summary).toEqual([])
    expect(data.headings.work).toBe("")
    expect(data.work.map((entry) => entry.company)).toEqual(["Acme"])
    expect(data.work[0].bullets).toEqual([[{ text: "Shipped it", bold: false, italic: false }]])
    expect(data.extras).toEqual({})
  })

  test("control characters are dropped, and a tab is a space", () => {
    const data = toTemplateData(asSaved({ profileSection: { fullName: "Ada\tLovelace", location: "Lon\u0007don\u0001" } }))
    expect(data.profile.name).toBe("Ada Lovelace")
    expect(data.profile.location).toBe("London")
  })

  test.each(TEMPLATES.map(({ id }) => id))("%s prints separate accents without boxes, and no empty Summary", async (id) => {
    const text = await printedText({ selectedTemplate: id, profileSection: { fullName: DECOMPOSED, summary: "\u200b" } })
    // A letter no font can print is read back as U+0000.
    expect(text).not.toContain("\0")
    expect(text.normalize("NFC").toLowerCase()).toContain(NAME.toLowerCase())
    expect(text).not.toMatch(/summary/i)
  })
})
