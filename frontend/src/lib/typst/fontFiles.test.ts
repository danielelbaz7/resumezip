import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { beforeAll, describe, expect, test } from "vitest"
import { CompileFormatEnum, createTypstCompiler, createTypstFontBuilder, type TypstCompiler } from "@myriaddreamin/typst.ts/compiler"
import { loadFonts } from "@myriaddreamin/typst.ts/options.init"
import { fontsOf, templateById, TEMPLATES } from "@/lib/templates"
import { covers, FONT_FILES, FONT_INFO, FONT_URLS, filesOf, fontsFor, lazyFonts } from "./fontFiles"
import { toTemplateData } from "./resumeData"

const TYPST = path.resolve("src/lib/typst")
const FONTS = path.join(TYPST, "fonts")
const WASM = path.resolve("node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm")
const filesOnDisk = readdirSync(FONTS)
  .filter((file) => /\.(otf|ttf)$/.test(file))
  .sort()
const bytesOf = (file: string) => new Uint8Array(readFileSync(path.join(FONTS, file)))

// Characters from many scripts, and symbols, that the templates' fonts don't all have.
const MIXED =
  "Đặng Thị Ngọc Ánh — Œuvre façade naïve Ærø Łódź Řehoř Ștefan Ğüşİ · Ελένη Παπαδοπούλου · Жанна Петрова · 张伟 · € £ ¥ ₹ ₫ ₽ © ® ™ ° ± × ÷ ≤ ≥ ≠ ≈ → ← ↑ ↓ ★ ✓ ✗ ∑ √ ∞ ½ ¼ ² ³ ‰ † ‡ § ¶ “quoted” ‘single’ … – fi fl 😀"

describe("coverage", () => {
  // Without 0, with 1 and 2, without 3 to 9, with 10 and on to 14.
  const coverage = [1, 2, 7, 5]

  test("reads runs of characters, alternately without and with the font", () => {
    expect([0, 1, 2, 3, 9, 10, 14, 15].map((codePoint) => covers(coverage, codePoint))).toEqual([
      false,
      true,
      true,
      false,
      false,
      true,
      true,
      false,
    ])
  })

  test("a resume in plain English needs only its template's families", () => {
    expect(fontsFor([{ family: "Lato" }], "Ada Lovelace, London · ada@example.com").sort()).toEqual(filesOf("Lato").sort())
    expect(fontsFor([{ family: "Lato" }, { family: "Raleway-v4020" }], "Ada Lovelace").sort()).toEqual(
      [...filesOf("Lato"), ...filesOf("Raleway-v4020")].sort(),
    )
  })

  test("a template that uses only some of its family's weights needs only those", () => {
    expect(fontsFor([{ family: "Lato", weights: [400, 700] }], "Ada Lovelace").sort()).toEqual([
      "Lato-Bold.ttf",
      "Lato-BoldItalic.ttf",
      "Lato-Italic.ttf",
      "Lato-Regular.ttf",
    ])
  })

  test("a character the family lacks brings every font that has it", () => {
    // Lato has no ruble sign.
    const price = "₽ 1 500"
    const missing = [...price].find(
      (char) => !filesOf("Lato").every((file) => FONT_INFO[file].info.some((face) => covers(face.coverage, char.codePointAt(0)!))),
    )
    expect(missing).toBeDefined()
    const extra = fontsFor([{ family: "Lato" }], price).filter((file) => !filesOf("Lato").includes(file))
    expect(extra.length).toBeGreaterThan(0)
  })

  test("a character no font has brings nothing more", () => {
    expect(fontsFor([{ family: "EB Garamond" }], "张伟 😀").sort()).toEqual(filesOf("EB Garamond").sort())
  })

  describe("with a fallback", () => {
    const heros = filesOf("TeX Gyre Heros")
    const sourceSans = filesOf("Source Sans 3", [400, 700])
    const blueprint = fontsOf(templateById("levelsfyi"))
    const needs = (text: string) => fontsFor(blueprint, text).sort()

    test("is Blueprint's, in the weights it prints in", () => {
      expect(blueprint).toEqual([
        { family: "TeX Gyre Heros" },
        { family: "Source Sans 3", weights: [400, 700], fallback: true, script: "Greek" },
      ])
    })

    test("a resume in plain English doesn't need it", () => {
      expect(needs("Ada Lovelace, London · ada@example.com")).toEqual(heros.sort())
    })

    test("a character the family lacks and the fallback has brings only the fallback", () => {
      expect(needs("Иван Петров, Москва")).toEqual([...heros, ...sourceSans].sort())
    })

    test("a letter of the script left to the fallback brings it, even one the family has", () => {
      const alpha = "α".codePointAt(0)!
      expect(heros.every((file) => FONT_INFO[file].info.some((face) => covers(face.coverage, alpha)))).toBe(true)
      expect(needs("α")).toEqual([...heros, ...sourceSans].sort())
    })

    test("a character the fallback lacks too brings it, and every font that has it", () => {
      // Linux Biolinum has a star; neither Heros nor Source Sans 3 does.
      expect(needs("★")).toEqual([...heros, ...sourceSans, "LinBiolinum_R.otf"].sort())
      expect(needs("张伟")).toEqual([...heros, ...sourceSans].sort())
    })
  })
})

describe("the font files", () => {
  test("every file has its info and a URL, and nothing else does", () => {
    expect([...FONT_FILES].sort()).toEqual(filesOnDisk)
    expect(Object.keys(FONT_URLS).sort()).toEqual(filesOnDisk)
  })

  // After changing a font, run with UPDATE_FONT_INFO=1 to write fonts/info.json again.
  test("fonts/info.json says what each file has", async () => {
    const builder = createTypstFontBuilder()
    await builder.init({ getModule: () => readFileSync(WASM) })
    const lines: string[] = []
    const actual: Record<string, unknown> = {}
    for (const file of filesOnDisk) {
      actual[file] = await builder.getFontInfo(bytesOf(file))
      lines.push(`  ${JSON.stringify(file)}: ${JSON.stringify(actual[file])}`)
    }
    const file = path.join(FONTS, "info.json")
    if (process.env.UPDATE_FONT_INFO) writeFileSync(file, `{\n${lines.join(",\n")}\n}\n`)
    // Read afresh, so a file just written is the one checked.
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(actual)
  })

  test("each template's font is the one its text is set in, and its fonts are among the files", () => {
    for (const template of TEMPLATES) {
      const [text] = fontLists(sourceOf(template.id), "#set text(font: ")
      expect(text?.families[0], template.id).toBe(template.font)
      for (const { family, weights } of fontsOf(template))
        expect(filesOf(family, weights).length, `${template.id}: ${family}`).toBeGreaterThan(0)
    }
  })

  // fontsFor counts on this: a letter the fonts before the fallback lack, or
  // leave to it, is printed in the fallback whatever words it's in.
  test("each of a template's font lists ends with its fallback, and leaves it only the script it says", () => {
    for (const template of TEMPLATES) {
      const fonts = fontsOf(template)
      const named = fonts.map(({ family }) => family)
      const fallback = fonts.find((font) => font.fallback)
      const lists = fontLists(sourceOf(template.id))
      expect(lists.length, template.id).toBeGreaterThan(0)
      for (const { families, leaves } of lists) {
        expect(named, template.id).toEqual(expect.arrayContaining(families))
        if (fallback) expect(families.at(-1), template.id).toBe(fallback.family)
        else expect(families, template.id).toHaveLength(1)
        for (const script of leaves) expect(script, template.id).toBe(fallback?.script)
      }
      if (fallback?.script)
        expect(
          lists.flatMap(({ leaves }) => leaves),
          template.id,
        ).toContain(fallback.script)
    }
  })
})

const sourceOf = (template: string) => readFileSync(path.join(TYPST, "templates", `${template}.typ`), "utf8")

/**
 * The font lists a template's source sets, after each `start` it has: the
 * families each names, in order, and the scripts any of them leaves to the
 * families after it, as `(name: "Charis SIL", covers: regex("\P{Greek}"))`.
 */
function fontLists(source: string, start = "font: "): { families: string[]; leaves: string[] }[] {
  return source
    .split(start)
    .slice(1)
    .map((rest) => {
      // A family's name, or a list of them in brackets, which may hold brackets of its own.
      let depth = 0
      let end = 0
      do {
        if (rest[end] === "(") depth++
        else if (rest[end] === ")") depth--
        else if (rest[end] === '"') end = rest.indexOf('"', end + 1)
        end++
      } while (depth > 0 && end < rest.length)
      const list = rest.slice(0, end)
      return {
        families: [...list.replace(/regex\("[^"]*"\)/g, "").matchAll(/"([^"]+)"/g)].map(([, family]) => family),
        // Any other `covers` stays as it's written, to fail the test.
        leaves: [...list.matchAll(/covers: ("[^"]*"|regex\("[^"]*"\))/g)].map(
          ([, value]) => value.match(/^regex\("\\P\{(\w+)\}"\)$/)?.[1] ?? value,
        ),
      }
    })
}

describe("printing with only the fonts a resume needs", () => {
  let compiler: TypstCompiler

  beforeAll(async () => {
    compiler = createTypstCompiler()
    await compiler.init({ getModule: () => readFileSync(WASM), beforeBuild: [loadFonts(filesOnDisk.map(bytesOf), { assets: false })] })
    for (const file of readdirSync(path.join(TYPST, "templates"))) {
      compiler.addSource(`/${file}`, readFileSync(path.join(TYPST, "templates", file), "utf8"))
    }
  })

  // Every font loaded up front, as before, or each read only when it's printed with.
  async function useFonts(fonts: "all" | ((file: string) => Uint8Array)) {
    const builder = createTypstFontBuilder()
    await builder.init({ getModule: () => readFileSync(WASM) })
    if (fonts === "all") for (const file of filesOnDisk) await builder.addFontData(bytesOf(file))
    else for (const font of lazyFonts(fonts)) await builder.addLazyFont(font, font.blob)
    await builder.build(async (resolver) => compiler.setFonts(resolver))
  }

  async function print(template: string, data: unknown): Promise<string> {
    compiler.mapShadow("/resume.json", new TextEncoder().encode(JSON.stringify(data)))
    const { result, diagnostics } = await compiler.compile({
      mainFilePath: `/${template}.typ`,
      format: CompileFormatEnum.pdf,
      diagnostics: "unix",
    })
    if (!result) throw new Error(diagnostics?.join("\n"))
    // When it was made, and the ID Typst makes from that, are all that
    // differ between two PDFs of the same resume.
    return Buffer.from(result)
      .toString("latin1")
      .replace(/D:\d{14}Z|\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/g, (date) => date.replace(/\d/g, "0"))
      .replace(/<xmpMM:(Instance|Document)ID>[^<]*/g, "<xmpMM:$1ID>")
      .replace(/\/ID \[\([^)]*\) \([^)]*\)\]/g, "/ID []")
  }

  const samples = readdirSync(path.join(TYPST, "preview-samples")).map((file) =>
    JSON.parse(readFileSync(path.join(TYPST, "preview-samples", file), "utf8")),
  )
  const mixed = (template: string) => ({
    selectedTemplate: template,
    profileSection: { fullName: "Đặng Thị Ngọc Ánh", location: MIXED, email: "anh@example.com" },
    workExperienceSection: [
      {
        companyName: "Œuvre Łódź",
        workRole: "Kỹ sư phần mềm",
        workLocation: "Hà Nội",
        workStartDate: "Jan 2024",
        workEndDate: "Present",
        workDescription: MIXED.split(" · ")
          .map((part) => `• ${part}`)
          .join("\n"),
      },
    ],
  })
  // One script at a time, where a template's fallback is all fontsFor adds.
  const ONE_SCRIPT = {
    Cyrillic: "Иван Петров · Москва",
    Greek: "Αλέξανδρος Παπαδόπουλος · Θεσσαλονίκη",
    // The one Greek letter IBM Plex Mono and Raleway have, which TeX Gyre Heros
    // and Charis SIL have too, but leave to their fallbacks.
    "π alone": "π = 3.14159",
    Vietnamese: "Nguyễn Thị Ánh · Hà Nội",
  }
  // The text in each place a template prints, in bold and italic too.
  const inOneScript = (template: string, text: string) => {
    const [first] = text.split(" · ")
    return {
      selectedTemplate: template,
      profileSection: { fullName: first, location: text, email: "anh@example.com", summary: text },
      headings: { work: first },
      workExperienceSection: [
        {
          companyName: first,
          workRole: text,
          workLocation: text,
          workStartDate: "Jan 2024",
          workEndDate: first,
          workDescription: [`• ${text}`, `• **${text}**`, `• *${text}*`, `• ***${text}***`].join("\n"),
        },
      ],
    }
  }
  const cases = [
    ...samples.map((resume) => ({ name: `${resume.selectedTemplate}'s sample`, resume, sample: true })),
    ...TEMPLATES.map((template) => ({ name: `${template.id} with mixed scripts`, resume: mixed(template.id), sample: false })),
    ...TEMPLATES.flatMap((template) =>
      Object.entries(ONE_SCRIPT).map(([script, text]) => ({
        name: `${template.id} in ${script}`,
        resume: inOneScript(template.id, text),
        sample: false,
      })),
    ),
  ]

  test.each(cases)("$name prints the same, reading only the fonts expected", async ({ resume, sample }) => {
    const data = toTemplateData(resume)
    // The job has to reach the template, or only the profile is printed.
    if (!sample) expect(data.work).toHaveLength(1)
    const template = TEMPLATES.find((each) => each.id === resume.selectedTemplate)!
    await useFonts("all")
    const before = await print(template.id, data)

    const read = new Set<string>()
    await useFonts((file) => {
      read.add(file)
      return bytesOf(file)
    })
    expect(await print(template.id, data)).toBe(before)
    // The worker downloads these before compiling, so Typst never waits for one.
    const expected = fontsFor(fontsOf(template), JSON.stringify(data))
    expect([...read].filter((file) => !expected.includes(file))).toEqual([])
    // A sample, in English, needs only the template's own fonts, not even its fallback.
    if (sample) {
      const own = fontsOf(template).flatMap(({ family, weights, fallback }) => (fallback ? [] : filesOf(family, weights)))
      expect(expected.sort()).toEqual([...new Set(own)].sort())
    }
  })
})
