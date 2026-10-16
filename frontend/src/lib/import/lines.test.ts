import { readFileSync } from "node:fs"
import { describe, expect, test, vi } from "vitest"
import { convertToHtml } from "mammoth"
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { MAX_CHARACTERS, MAX_PAGES, MAX_UNZIPPED_BYTES, TooMuchTextError } from "./limits"
import { cleanLink, linesFromDocx, linesFromPages, readPdf, UnreadableWordFileError, type Line } from "./lines"
import { parseResume, toResumeContent } from "./parse"
import { pdfOf, textPdf, wordFile, type WordParagraph, type WordTable } from "./testFiles"

// mammoth as it is, with its converter watched.
vi.mock("mammoth", async (importOriginal) => {
  const mammoth = await importOriginal<typeof import("mammoth")>()
  return { ...mammoth, convertToHtml: vi.fn(mammoth.convertToHtml) }
})

const bytes = (buffer: Buffer) => new Uint8Array(buffer).buffer

/** A zip whose headers say `name` unzips to 100 bytes, whatever it really unzips to. */
function sizeUnderstated(zip: Buffer, name: string): Buffer {
  const copy = Buffer.from(zip)
  for (const [signature, sizeAt, nameAt] of [
    ["PK\x03\x04", 22, 30],
    ["PK\x01\x02", 24, 46],
  ] as const) {
    for (let at = copy.indexOf(signature, 0, "latin1"); at >= 0; at = copy.indexOf(signature, at + 4, "latin1")) {
      const nameLength = copy.readUInt16LE(at + nameAt - (signature === "PK\x03\x04" ? 4 : 18))
      if (copy.toString("latin1", at + nameAt, at + nameAt + nameLength) === name) copy.writeUInt32LE(100, at + sizeAt)
    }
  }
  return copy
}

/** A zip whose directory lists `name` as `listed`, while the file's own header still says `name`. */
function listedAs(zip: Buffer, name: string, listed: string): Buffer {
  const copy = Buffer.from(zip)
  for (let at = copy.indexOf("PK\x01\x02", 0, "latin1"); at >= 0; at = copy.indexOf("PK\x01\x02", at + 4, "latin1")) {
    if (copy.toString("latin1", at + 46, at + 46 + copy.readUInt16LE(at + 28)) === name) copy.write(listed, at + 46, "latin1")
  }
  return copy
}

/** A zip marked as ZIP64 by the record a ZIP64 file has just before its directory's end. */
function zip64(zip: Buffer): Buffer {
  const locator = Buffer.alloc(20)
  locator.writeUInt32LE(0x07064b50)
  return Buffer.concat([zip.subarray(0, -22), locator, zip.subarray(-22)])
}

async function withPdf(pdf: Buffer, check: (doc: PDFDocumentProxy) => Promise<void>) {
  const doc = (await getDocument({ data: new Uint8Array(pdf), isEvalSupported: false, fontExtraProperties: true })
    .promise) as unknown as PDFDocumentProxy
  try {
    await check(doc)
  } finally {
    await doc.destroy()
  }
}

describe("cleanLink", () => {
  test("drops what pdf.js adds to a LaTeX link written without https://", () => {
    expect(cleanLink('www.linkedin.com/in/someone/.pdf#[0,{"name":"Fit"}]')).toBe("www.linkedin.com/in/someone")
    expect(cleanLink("http://www.linkedin.com/in/someone/.pdf#[0,{%22name%22:%22Fit%22}]")).toBe("http://www.linkedin.com/in/someone")
  })

  test("leaves real links alone, including links to PDFs", () => {
    expect(cleanLink("https://github.com/someone")).toBe("https://github.com/someone")
    expect(cleanLink("https://example.com/paper.pdf#page=2")).toBe("https://example.com/paper.pdf#page=2")
    expect(cleanLink("mailto:someone@example.com")).toBe("mailto:someone@example.com")
  })
})

describe("reading a PDF", () => {
  test(`one of ${MAX_PAGES} full pages comes back whole, in order`, async () => {
    const pages = Array.from({ length: MAX_PAGES }, (_, page) =>
      Array.from({ length: 45 }, (_, line) => `Page ${page + 1}, line ${line + 1}`),
    )
    await withPdf(textPdf(pages), async (doc) => {
      const lines = linesFromPages(await readPdf(doc))
      expect(lines.map((line) => line.text)).toEqual(pages.flat())
      expect(lines.map((line) => line.page)).toEqual(pages.flatMap((page, index) => page.map(() => index + 1)))
    })
  })

  test("stops at the page that takes it over the text limit", async () => {
    // A page of 1-point text, with room for more than the limit.
    const tiny = Array.from({ length: MAX_CHARACTERS / 1000 + 1 }, () => "x".repeat(1000))
    await withPdf(textPdf([["Mara Lin"], tiny, ["Never read"]], { size: 1 }), async (doc) => {
      const getPage = vi.spyOn(doc, "getPage")
      await expect(readPdf(doc)).rejects.toThrow(TooMuchTextError)
      expect(getPage.mock.calls.map(([number]) => number)).toEqual([1, 2])
    })
  })

  test("reads a page that nests its marked spans deeply in time linear in them", async () => {
    // 20,000 spans, each inside the one before, each with 50 glyphs: what a
    // small PDF can hold. Keeping each span's text took about 10 seconds.
    const depth = 20_000
    const glyphs = [Array.from({ length: 50 }, () => ({ unicode: "a" }))]
    const operators = {
      fnArray: [...Array.from({ length: depth }, () => [70, 44]).flat(), ...Array.from({ length: depth }, () => 71)],
      argsArray: [
        ...Array.from({ length: depth }, (_, mcid) => [["Span", mcid], glyphs]).flat(),
        ...Array.from({ length: depth }, () => null),
      ],
    }
    await withPdf(textPdf([["Mara Lin"]]), async (doc) => {
      const getPage = doc.getPage.bind(doc)
      vi.spyOn(doc, "getPage").mockImplementation(async (number) => {
        const page = await getPage(number)
        const getOperatorList = page.getOperatorList.bind(page)
        vi.spyOn(page, "getOperatorList").mockImplementation(async () => ({ ...(await getOperatorList()), ...operators }))
        return page
      })
      const start = performance.now()
      const lines = linesFromPages(await readPdf(doc))
      expect(performance.now() - start).toBeLessThan(1000)
      expect(lines.map((line) => line.text)).toEqual(["Mara Lin"])
    })
  }, 30_000)

  test("reads no further once cancelled", async () => {
    await withPdf(textPdf([["Mara Lin"], ["Never read"]]), async (doc) => {
      // Cancelled while the first page is being read.
      const cancel = new AbortController()
      const getPage = doc.getPage.bind(doc)
      const reads = vi.spyOn(doc, "getPage").mockImplementation((number) => {
        cancel.abort()
        return getPage(number)
      })
      await expect(readPdf(doc, cancel.signal)).rejects.toSatisfy((error: Error) => error.name === "AbortError")
      expect(reads).toHaveBeenCalledTimes(1)
    })
  })
})

describe("reading a Word file", () => {
  test("one that unzips to too much text isn't converted", async () => {
    vi.mocked(convertToHtml).mockClear()
    await expect(linesFromDocx(bytes(wordFile(["Mara Lin"], { padding: MAX_UNZIPPED_BYTES })))).rejects.toThrow(TooMuchTextError)
    expect(convertToHtml).not.toHaveBeenCalled()
  })

  test("one that says it unzips to less than it does isn't converted", async () => {
    vi.mocked(convertToHtml).mockClear()
    const file = sizeUnderstated(wordFile(["Mara Lin"], { padding: MAX_UNZIPPED_BYTES }), "word/document.xml")
    await expect(linesFromDocx(bytes(file))).rejects.toThrow(TooMuchTextError)
    expect(convertToHtml).not.toHaveBeenCalled()
  })

  test("one whose directory lists its text as a picture isn't converted", async () => {
    vi.mocked(convertToHtml).mockClear()
    // mammoth's unzipper goes by the name in the file's own header.
    const file = listedAs(wordFile(["Mara Lin"], { padding: MAX_UNZIPPED_BYTES }), "word/document.xml", "word/media/a1.png")
    await expect(linesFromDocx(bytes(file))).rejects.toThrow(TooMuchTextError)
    expect(convertToHtml).not.toHaveBeenCalled()
  })

  test("one that says it's over 4 GB (ZIP64) isn't converted either", async () => {
    vi.mocked(convertToHtml).mockClear()
    await expect(linesFromDocx(bytes(zip64(wordFile(["Mara Lin"]))))).rejects.toThrow(TooMuchTextError)
    expect(convertToHtml).not.toHaveBeenCalled()
  })

  test("one with something else before the zip is read and measured all the same", async () => {
    const prefixed = (zip: Buffer) => Buffer.concat([Buffer.from("Something else first. "), zip])
    await expect(linesFromDocx(bytes(prefixed(wordFile(["Mara Lin"]))))).resolves.toMatchObject([{ text: "Mara Lin" }])
    vi.mocked(convertToHtml).mockClear()
    await expect(linesFromDocx(bytes(prefixed(wordFile(["Mara Lin"], { padding: MAX_UNZIPPED_BYTES }))))).rejects.toThrow(TooMuchTextError)
    expect(convertToHtml).not.toHaveBeenCalled()
  })

  test("a damaged zip, or a file that isn't one, can't be read", async () => {
    vi.mocked(convertToHtml).mockClear()
    const file = wordFile(["Mara Lin"])
    // Says the directory is bigger than the whole file.
    file.writeUInt32LE(file.length, file.length - 22 + 12)
    await expect(linesFromDocx(bytes(file))).rejects.toThrow(UnreadableWordFileError)
    await expect(linesFromDocx(bytes(Buffer.from("not a zip")))).rejects.toThrow(UnreadableWordFileError)
    expect(convertToHtml).not.toHaveBeenCalled()
  })

  test("its paragraphs become lines", async () => {
    vi.mocked(convertToHtml).mockClear()
    await expect(linesFromDocx(bytes(wordFile(["Mara Lin", "mara@example.com"])))).resolves.toMatchObject([
      { text: "Mara Lin" },
      { text: "mara@example.com" },
    ])
    expect(convertToHtml).toHaveBeenCalledTimes(1)
  })
})

describe("tables in a Word file", () => {
  const read = (content: (WordParagraph | WordTable)[]) => linesFromDocx(bytes(wordFile(content)))
  const parts = (lines: Line[]) => lines.map((line) => line.parts.map(({ text, x }) => [text, x]))

  const skills: WordTable = [
    [["Python"], ["SQL"]],
    [["React"], ["AWS"]],
  ]
  const experience: WordParagraph[] = [
    { heading: "Experience" },
    "Software Engineer, Acme Corp",
    "Jun 2021 – Present",
    "• Built the billing service",
    { heading: "Education" },
    "State University",
    "B.S. in Computer Science, 2017 – 2021",
  ]
  // A resume template's two columns: the name and a table of skills on the
  // left, everything else on the right.
  const left = ["Jordan Lee", skills]
  const right = ["jordan@example.com", "EXPERIENCE", "Software Engineer, Acme Corp", "Jun 2021 – Present", "EDUCATION", "State University"]

  test("with a paragraph a cell are read across, a line a row, as before", async () => {
    const titled: WordTable = [[["Software Engineer, Acme Corp"], ["Jun 2021 – Present"]]]
    // prettier-ignore
    expect(parts(await read([titled, skills]))).toEqual([
      [["Software Engineer, Acme Corp", 0], ["Jun 2021 – Present", 200]],
      [["Python", 0], ["SQL", 200]],
      [["React", 0], ["AWS", 200]],
    ])
  })

  test("with a heading beside several paragraphs read it with the first, as before", async () => {
    const margin: WordTable = [[["Experience"], ["Software Engineer, Acme Corp", "Jun 2021 – Present", "• Built the billing service"]]]
    // prettier-ignore
    expect(parts(await read([margin]))).toEqual([
      [["Experience", 0], ["Software Engineer, Acme Corp", 200]],
      [["Jun 2021 – Present", 200]],
      [["Built the billing service", 200]],
    ])
  })

  test("with an entry's dates and place beside it read them beside its lines, as before", async () => {
    const entry: WordTable = [
      [
        ["Software Engineer, Acme Corp", "• Built the billing service"],
        ["Jun 2021 – Present", "Boston, MA"],
      ],
    ]
    // prettier-ignore
    expect(parts(await read([entry]))).toEqual([
      [["Software Engineer, Acme Corp", 0], ["Jun 2021 – Present", 200]],
      [["Built the billing service", 0], ["Boston, MA", 200]],
    ])
    const resume = toResumeContent(parseResume(await read(["Jordan Lee", "EXPERIENCE", entry])))
    expect(resume.workExperienceSection).toMatchObject([
      { workRole: "Software Engineer", companyName: "Acme Corp", workStartDate: "Jun 2021", workEndDate: "Present" },
    ])
  })

  test("leave out paragraphs of only spaces, which would push the text beside them down a line", async () => {
    const margin: WordTable = [
      [
        [" ", "Experience"],
        ["Software Engineer, Acme Corp", "Jun 2021 – Present"],
      ],
    ]
    // prettier-ignore
    expect(parts(await read([margin]))).toEqual([
      [["Experience", 0], ["Software Engineer, Acme Corp", 200]],
      [["Jun 2021 – Present", 200]],
    ])
  })

  test("laid out in columns are read a column at a time", async () => {
    const sidebar = ["Jordan Lee", "jordan@example.com", { heading: "Skills" }, "Python, SQL", "React, AWS"]
    expect(await read([[[sidebar, experience]]])).toEqual(await read([...sidebar, ...experience]))
  })

  test("with a section in each of two cells read one after the other, however short", async () => {
    const technical = [{ heading: "Skills" }, "Python, SQL", "React, AWS"]
    const spoken = [{ heading: "Languages" }, "English", "Spanish"]
    expect(await read([[[technical, spoken]]])).toEqual(await read([...technical, ...spoken]))
  })

  test("in another table's cell are read there, losing nothing after them", async () => {
    const lines = await read([[[left, right]]])
    expect(lines.map((line) => line.text)).toEqual(["Jordan Lee", "Python SQL", "React AWS", ...right])
    expect(lines).toEqual(await read([...left, ...right]))
  })

  test("keep the style of a paragraph alone on its line, like a heading's", async () => {
    // A heading in a cell of its own, like a bar across the page.
    const bar: WordTable = [[[{ heading: "Things I Built" }]]]
    expect(await read([bar, "Resume Parser"])).toEqual(await read([{ heading: "Things I Built" }, "Resume Parser"]))
    expect(await read([[[experience]]])).toEqual(await read(experience))
    // Beside an empty cell, like one holding a photo, which isn't read, the text sits a cell over.
    const styles = (lines: Line[]) => lines.map(({ text, size, heading, bullet }) => ({ text, size, heading, bullet }))
    expect(styles(await read([[[[], experience]]]))).toEqual(styles(await read(experience)))
  })

  test("laid out in columns, with a table in one, keep everything in the resume or Couldn't place", async () => {
    const parsed = parseResume(await read([[[left, right]]]))
    const resume = toResumeContent(parsed)
    expect(resume.profileSection).toMatchObject({ fullName: "Jordan Lee", email: "jordan@example.com" })
    expect(resume.workExperienceSection).toMatchObject([
      { workRole: "Software Engineer", companyName: "Acme Corp", workStartDate: "Jun 2021", workEndDate: "Present" },
    ])
    expect(resume.educationSection).toMatchObject([{ schoolName: "State University" }])
    // The skills have no heading to go under.
    expect(parsed.unplaced.flatMap((group) => group.text)).toEqual(["Python SQL", "React AWS"])
  })

  test("laid out in columns have their sections found", async () => {
    const parsed = parseResume(await read([[[["Jordan Lee", "SKILLS", skills], right]]]))
    expect(parsed.sections.map((section) => section.name)).toEqual(["Skills", "Work", "Education"])
    expect(toResumeContent(parsed).skillsSection).toMatchObject([
      { skillName: "Python", skillDetails: "SQL" },
      { skillName: "React", skillDetails: "AWS" },
    ])
    expect(parsed.unplaced).toEqual([])
  })
})

describe("hyphens", () => {
  test("one a typesetter added to break a word at the end of a line comes back as a soft hyphen", async () => {
    // Typst marks those hyphens as soft ones; a hyphen in "motion-capture" is part of the word.
    await withPdf(readFileSync("src/lib/import/corpus/marcus/typst-academic.pdf"), async (doc) => {
      const texts = linesFromPages(await readPdf(doc)).map((line) => line.text)
      expect(texts.some((text) => text.endsWith(" coor\u00AD"))).toBe(true)
      expect(texts.some((text) => text.endsWith(" motion-"))).toBe(true)
    })
  })

  test("one alone in a span is soft however many spans are around it, and one sharing a span isn't", async () => {
    const depth = 5000
    const content = [
      "BT /F1 12 Tf 72 720 Td",
      "/P << >> BDC ".repeat(depth),
      "(It helps coor) Tj /Span << /ActualText <FEFF00AD> >> BDC (-) Tj EMC",
      "0 -16 Td (dinate the team) Tj",
      // A hyphen in a span with a span of text in it isn't alone.
      "0 -16 Td (Not so well) Tj /Span << >> BDC (-) Tj 0 -16 Td /Span << >> BDC (known) Tj EMC EMC",
      "EMC ".repeat(depth),
      "ET",
    ].join(" ")
    await withPdf(pdfOf([content]), async (doc) => {
      const texts = linesFromPages(await readPdf(doc)).map((line) => line.text)
      expect(texts).toEqual(["It helps coor\u00AD", "dinate the team", "Not so well-", "known"])
    })
  })

  test("one alone in a span that's part of the document's structure, or has nothing to say about it, is a hyphen", async () => {
    const content = [
      "BT /F1 12 Tf 72 720 Td",
      // A span in the document's structure, numbered by an MCID.
      "(A well) Tj /Span << /MCID 3 >> BDC (-) Tj EMC",
      "0 -16 Td (known name) Tj",
      // A span with no properties, which can't say what it stands for.
      "0 -16 Td (A long) Tj /Span BMC (-) Tj EMC",
      "0 -16 Td (term plan) Tj",
      "ET",
    ].join(" ")
    await withPdf(pdfOf([content]), async (doc) => {
      const texts = linesFromPages(await readPdf(doc)).map((line) => line.text)
      expect(texts).toEqual(["A well-", "known name", "A long-", "term plan"])
    })
  })
})

/** Text on a page, half its size wide a letter, as pdf.js gives it. */
const item = (text: string, x: number, baseline: number, size = 10) => ({
  text,
  x,
  right: x + text.length * size * 0.5,
  baseline,
  size,
  bold: false,
  italic: false,
})
const page = (items: ReturnType<typeof item>[]) => ({ width: 612, height: 792, items, links: [] })

describe("bullets", () => {
  test("a dash set apart from its text starts a bullet, as a dot does", () => {
    const lines = linesFromPages([
      page([item("-", 40, 700), item("Ran the storefront cache", 56, 700), item("-", 40, 688), item("Led incident reviews", 56, 688)]),
    ])
    expect(lines.map(({ bullet, text, x }) => ({ bullet, text, x }))).toEqual([
      { bullet: true, text: "Ran the storefront cache", x: 56 },
      { bullet: true, text: "Led incident reviews", x: 56 },
    ])
  })
})

describe("columns", () => {
  // A narrow column on the left and a wider one on the right, their lines
  // level with each other, under a name across both.
  const name = item("Dana Cole", 150, 740, 24)
  const left = ["Education", "State University", "B.S. in Cell Biology, 2022", "Skills", "Python, R, SQL, ImageJ", "Lab safety, PCR"]
  const right = [
    "Experience",
    "Acme Labs | Research Assistant",
    "Jun 2022 - Present | Boston, MA",
    "Ran 300 assays a week for the drug screening team and kept",
    "the lab's sample records up to date in its tracking system",
    "Wrote the scripts that turned plate readings into reports",
    "Trained six new assistants on the plate readers and robots",
    "Ordered the lab's supplies and kept its budget each quarter",
    "Kept the freezer inventory and logged where each sample was",
    "Presented results at the team's weekly meeting with the leads",
  ]
  const leftItems = left.map((text, i) => item(text, 36, 700 - 12 * i))
  const rightItems = right.map((text, i) => item(text, 230, 700 - 12 * i))

  test("one written whole before the other is read as a column, however narrow", () => {
    const texts = linesFromPages([page([name, ...leftItems, ...rightItems])]).map((line) => line.text)
    expect(texts).toEqual(["Dana Cole", ...left, ...right])
  })

  // A name short enough to sit all on the right of the gap.
  const short = item("Al Li", 260, 740, 24)

  test("a short name over a centered contact line reads first, though it's all on one side of the gap", () => {
    const contact = item("al@li.dev | (555) 012-3307 | Boston, MA", 120, 724)
    const texts = linesFromPages([page([short, contact, ...leftItems, ...rightItems])]).map((line) => line.text)
    expect(texts).toEqual(["Al Li", contact.text, ...left, ...right])
  })

  test("a name and contact line above both are marked as in neither, and nothing is on a page without columns", () => {
    const contact = item("al@li.dev | (555) 012-3307 | Boston, MA", 120, 724)
    const lines = linesFromPages([page([short, contact, ...leftItems, ...rightItems])])
    expect(lines.filter((line) => line.spans).map((line) => line.text)).toEqual(["Al Li", contact.text])
    expect(linesFromPages([page([short, contact, ...rightItems])]).filter((line) => line.spans)).toEqual([])
  })

  test("a contact line that starts on the left of the gap is above the columns, not in them", () => {
    const contact = [item("al@li.dev", 100, 724), item("| linkedin.com/in/alli | Boston, MA", 150, 724)]
    const texts = linesFromPages([page([short, ...contact, ...leftItems, ...rightItems])]).map((line) => line.text)
    expect(texts[0]).toBe("Al Li")
    expect(texts.slice(2)).toEqual([...left, ...right])
  })

  test("dates set flush right, written after the rest of a one-column page, aren't one", () => {
    // Too few to make a column of their own, they'd still pass for one of a
    // short resume's two columns, like Deedy's, all starting at one place.
    const top = [
      item("Dana Cole", 250, 740, 20),
      item("dana@cole.dev | (555) 012-3307 | Boston, MA", 196, 720),
      item("Experience", 36, 696),
    ]
    const labs = ["A", "B", "C"].map((lab, i) => ({
      lines: [`Research Assistant, Lab ${lab}`, "• Ran assays for the screening team", "• Wrote the plate reader scripts"],
      dates: `20${10 + 2 * i} - 20${11 + 2 * i}`,
      baseline: 680 - 40 * i,
    }))
    const entries = labs.flatMap((lab) => lab.lines.map((text, i) => item(text, i === 0 ? 36 : 46, lab.baseline - 12 * i)))
    // Each date ends at 576, the right margin.
    const dates = labs.map((lab) => item(lab.dates, 521, lab.baseline))
    const texts = linesFromPages([page([...top, ...entries, ...dates])]).map((line) => line.text)
    expect(texts.filter((text) => text.startsWith("Research Assistant"))).toEqual(labs.map((lab) => `${lab.lines[0]} ${lab.dates}`))
  })

  test("text written line by line across both, like dates beside entries, isn't", () => {
    const written = rightItems.flatMap((rightItem, i) => (leftItems[i] ? [leftItems[i], rightItem] : [rightItem]))
    const texts = linesFromPages([page([name, ...written])]).map((line) => line.text)
    expect(texts).toEqual(["Dana Cole", ...right.map((text, i) => (left[i] ? `${left[i]} ${text}` : text))])
  })
})

describe("where a line sits", () => {
  test("is where most of its text sits, not a heading in the margin set a little higher", () => {
    const [line] = linesFromPages([page([item("AWARDS", 60, 700.5, 8), item("Dean's List, State University", 125, 698)])])
    // Boxes measure down from the top of the 792-point page: the text's baseline is 94 down.
    expect(line.box?.[3]).toBeCloseTo(94 + 0.3 * 10)
  })
})
