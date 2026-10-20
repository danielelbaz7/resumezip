// Names in Vietnamese, Central European, Turkish, Cyrillic and Greek letters,
// printed by the templates set in Lato, all in Lato: a letter it lacked would
// come from a serif (Charis SIL or EB Garamond) in the middle of a word, even
// in the bold name at the top.

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFDocumentProxy } from "pdfjs-dist"
import type { TextItem } from "pdfjs-dist/types/src/display/api"
import { describe, expect, test } from "vitest"
import { render } from "@/lib/import/testRender"
import { TEMPLATES } from "@/lib/templates"
import { covers, filesOf, FONT_INFO } from "./fontFiles"
import { toTemplateData } from "./resumeData"

const NAMES = ["Nguyễn Thị Ánh, Hà Nội", "Tomáš Kovačević, Česko", "Şahin Ştefănescu", "Иван Петров", "Ελένη Παπαδοπούλου"]
const LATO_TEMPLATES = TEMPLATES.filter((template) => template.font === "Lato").map((template) => template.id)

// The name at the top, and a job's company (bold in every template) and
// bullets, one plain and one bold. Deedy prints the profile's places in
// Raleway, so they're left out.
const resumeWith = (template: string, name: string) => ({
  selectedTemplate: template,
  profileSection: { fullName: name },
  workExperienceSection: [{ id: 1, companyName: name, workDescription: `• ${name}\n• **${name}**` }],
})

/** Each piece of text the PDF prints, with the font pdf.js says it's drawn in, without the subset's tag ("Lato-Bold"). */
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

const lettersOf = (text: string) => [...new Set(text.match(/\p{L}/gu))]

test("the Lato templates are the ones tested", () => {
  expect(LATO_TEMPLATES.sort()).toEqual(["deedy", "ian", "modernjack"])
})

describe.each(LATO_TEMPLATES)("%s", (template) => {
  test.each(NAMES)("prints %s in Lato, bold and regular", async (name) => {
    expect(toTemplateData(resumeWith(template, name)).work).toHaveLength(1)
    const pieces = await printed(await render(resumeWith(template, name)))

    // No letter is drawn from another font, like Charis SIL or EB Garamond.
    const elsewhere = pieces.filter(({ text, font }) => /\p{L}/u.test(text) && !font.startsWith("Lato-"))
    expect(elsewhere.map(({ text, font }) => `"${text}" in ${font}`)).toEqual([])

    // Every letter of the name is printed in a bold Lato and in the text's
    // own (Lato Light in Deedy).
    const inFaces = (faces: RegExp) =>
      pieces
        .filter(({ font }) => faces.test(font))
        .map(({ text }) => text)
        .join("")
    const bold = inFaces(/^Lato-Bold$/)
    const regular = inFaces(/^Lato-(Regular|Light)$/)
    expect(lettersOf(name).filter((letter) => !bold.includes(letter))).toEqual([])
    expect(lettersOf(name).filter((letter) => !regular.includes(letter))).toEqual([])
  })
})

test("every Lato file has the letters of Vietnamese, Central European, Turkish, Greek and Cyrillic names, and combining accents", () => {
  // prettier-ignore
  const letters = [
    ...NAMES.join(""),
    ..."ăâđêôơư ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ", // Vietnamese
    ..."čćđšžřěůďťň şğıİ șțăî őű āēīūģķļņ", // Czech, Croatian, Turkish, Romanian, Hungarian, Latvian
    ..."ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρσςτυφχψω άέήίόύώ",
    ..."АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдежзийклмнопрстуфхцчшщъыьэюяёіїєґў",
  ].filter((char) => /\p{L}/u.test(char))
  const combining = Array.from({ length: 0x0323 - 0x0300 + 1 }, (_, i) => String.fromCodePoint(0x0300 + i))
  for (const char of [...letters.flatMap((letter) => [letter, letter.toUpperCase()]), ...combining]) {
    const lacking = filesOf("Lato").filter((file) => !FONT_INFO[file].info.some((face) => covers(face.coverage, char.codePointAt(0)!)))
    expect(lacking, `U+${char.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} ${char}`).toEqual([])
  }
})
