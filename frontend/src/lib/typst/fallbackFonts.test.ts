// Letters a template's fonts lack, printed in the fallback it names rather
// than in whatever font Typst finds, often a serif, and all of a word in one
// font: Cyrillic in Source Sans 3 where TeX Gyre Heros has none, Cyrillic and
// Greek in EB Garamond where TeX Gyre Termes has none or only some, and Greek
// in Source Sans 3, Lato or EB Garamond where IBM Plex Mono, Raleway and
// Charis SIL have only a few Greek letters.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFDocumentProxy } from "pdfjs-dist"
import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { describe, expect, test } from "vitest"
import { render } from "@/lib/import/testRender"
import { toTemplateData } from "./resumeData"

const CYRILLIC = "Иван Петров, Москва"
const GREEK = "Αλέξανδρος Παπαδόπουλος"

/** Each piece of text the PDF prints, with the font pdf.js says it's drawn in, without the subset's tag ("SourceSans3-Bold"). */
async function printed(pdf: Uint8Array): Promise<{ text: string; font: string }[]> {
  const doc = (await getDocument({ data: pdf, isEvalSupported: false, fontExtraProperties: true }).promise) as unknown as PDFDocumentProxy
  try {
    const pieces: { text: string; font: string }[] = []
    for (let number = 1; number <= doc.numPages; number++) {
      const page = await doc.getPage(number)
      // The fonts' names are only there once the page's fonts are loaded.
      await page.getOperatorList()
      for (const item of (await page.getTextContent()).items as TextItem[]) {
        const name = String((page.commonObjs.get(item.fontName) as { name?: string }).name)
        pieces.push({ text: item.str, font: name.replace(/^[A-Z]{6}\+/, "") })
      }
    }
    return pieces
  } finally {
    await doc.destroy()
  }
}

const SCRIPT = /[\p{Script=Cyrillic}\p{Script=Greek}]/u
const lettersOf = (text: string) => [...new Set(text.match(/\p{L}/gu))]

/**
 * The fonts `text`'s Cyrillic and Greek letters are printed in, and the
 * letters printed in `font`, which should be every one of them.
 */
async function fontsOfLetters(resume: Record<string, unknown>, text: string, font: RegExp) {
  const pieces = (await printed(await render(resume))).filter((piece) => SCRIPT.test(piece.text))
  const inFont = pieces
    .filter((piece) => font.test(piece.font))
    .map((piece) => piece.text)
    .join("")
  return {
    fonts: [...new Set(pieces.map((piece) => piece.font))].sort(),
    missing: lettersOf(text).filter((letter) => !inFont.includes(letter)),
  }
}

// The text in the profile and a job, in bold and italic too.
const resumeIn = (template: string, text: string) => ({
  selectedTemplate: template,
  profileSection: { fullName: text, location: text, summary: text },
  workExperienceSection: [
    {
      id: 1,
      companyName: text,
      workRole: text,
      workLocation: text,
      workStartDate: "Jan 2024",
      workDescription: `• ${text}\n• **${text}**\n• *${text}*`,
    },
  ],
})

describe.each([
  { template: "levelsfyi", name: "Blueprint", text: CYRILLIC },
  { template: "referme", name: "Compact", text: CYRILLIC },
  { template: "swiss", name: "Swiss", text: CYRILLIC },
  { template: "mono", name: "Mono", text: GREEK },
])("$name", ({ template, text }) => {
  test(`prints ${text} in Source Sans 3, regular, bold and italic`, async () => {
    expect(toTemplateData(resumeIn(template, text)).work).toHaveLength(1)
    const { fonts, missing } = await fontsOfLetters(resumeIn(template, text), text, /^SourceSans3-/)
    expect(fonts.filter((font) => !font.startsWith("SourceSans3-"))).toEqual([])
    expect(fonts).toEqual(expect.arrayContaining(["SourceSans3-Regular", "SourceSans3-Bold", "SourceSans3-Italic"]))
    expect(missing).toEqual([])
  })
})

test("Deedy prints Greek roles, dates and places, which it sets in Raleway, in Lato", async () => {
  // Only the lines in Raleway are in Greek: the job's role (in small
  // capitals), place and dates, and the profile's place.
  const resume = {
    selectedTemplate: "deedy",
    profileSection: { fullName: "Alex Papadopoulos", location: "Αθήνα" },
    workExperienceSection: [
      {
        id: 1,
        companyName: "Acme",
        workRole: GREEK,
        workLocation: "Θεσσαλονίκη",
        workStartDate: "Ιαν 2024",
        workEndDate: "Σήμερα",
        workDescription: "• Built things",
      },
    ],
  }
  const greek = [GREEK, "Αθήνα", "Θεσσαλονίκη", "Ιαν", "Σήμερα"].join(" ")
  // Raleway prints at weight 500, for which Lato's nearest is its Regular.
  const { fonts, missing } = await fontsOfLetters(resume, greek, /^Lato-Regular$/)
  expect(fonts).toEqual(["Lato-Regular"])
  expect(missing).toEqual([])
})

test("Margin prints a Greek word in EB Garamond, all of it, as Charis SIL has only some Greek letters", async () => {
  const word = "Θεσσαλονίκη"
  const { fonts, missing } = await fontsOfLetters(resumeIn("margin", word), word, /^EBGaramond-/)
  expect(fonts.filter((font) => !font.startsWith("EBGaramond-"))).toEqual([])
  expect(fonts).toEqual(expect.arrayContaining(["EBGaramond-Regular", "EBGaramond-Bold", "EBGaramond-Italic"]))
  expect(missing).toEqual([])
})

describe.each([CYRILLIC, GREEK])("zero2sudo", (text) => {
  test(`prints ${text} in EB Garamond, regular, bold and italic, as TeX Gyre Termes has none of it or only some`, async () => {
    const { fonts, missing } = await fontsOfLetters(resumeIn("zero2sudo", text), text, /^EBGaramond-/)
    expect(fonts.filter((font) => !font.startsWith("EBGaramond-"))).toEqual([])
    expect(fonts).toEqual(expect.arrayContaining(["EBGaramond-Regular", "EBGaramond-Bold", "EBGaramond-Italic"]))
    expect(missing).toEqual([])
  })
})

test("Margin's headings keep Greek in Linux Biolinum, which has it all", async () => {
  const word = "Εμπειρία"
  const resume = { ...resumeIn("margin", "Thessaloniki"), headings: { work: word } }
  const { fonts, missing } = await fontsOfLetters(resume, word, /^LinBiolinumO$/)
  expect(fonts).toEqual(["LinBiolinumO"])
  expect(missing).toEqual([])
})

test("the Latin around those letters stays in the template's own font", async () => {
  const text = `Ivan Petrov, ${CYRILLIC}`
  const pieces = await printed(await render(resumeIn("swiss", text)))
  const latin = pieces.filter((piece) => /[A-Za-z]/.test(piece.text) && !SCRIPT.test(piece.text))
  expect(latin.length).toBeGreaterThan(0)
  expect([...new Set(latin.map((piece) => piece.font))].filter((font) => !font.startsWith("TeXGyreHeros-"))).toEqual([])
})
