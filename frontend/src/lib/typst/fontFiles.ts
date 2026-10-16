// The fonts templates can use. The compiler knows every one from the start,
// from what fonts/info.json says about it, but only reads a font's data when
// it prints with it. So a resume only needs its template's fonts, plus, for a
// character those fonts lack, the fallback the template names; and when that
// lacks it too, or there's none, every font with it, as Typst then picks one
// from every font it knows, the same as if all were loaded.

import type { FontUse } from "@/lib/templates"
import INFO from "./fonts/info.json"

/**
 * What Typst knows about a font without its data: its family, style and
 * which characters it has, for each font in the file, and the file's SHA-256.
 */
export interface FontInfo {
  info: { family: string; variant: { style: string; weight: number; stretch: number }; flags: string; coverage: number[] }[]
  conditions: { t: string; v: string }[]
}

/** Each font file's info, by file name. fontFiles.test.ts checks it against the files. */
export const FONT_INFO: Record<string, FontInfo> = INFO

export const FONT_FILES = Object.keys(FONT_INFO)

// Where each file is served. They're bundled, so each is served under a name
// with its content's hash that browsers keep for good; a changed font gets a
// new name. The bundler only finds paths written out in full, so each one is.
export const FONT_URLS: Record<string, string> = {
  "CharisSIL-Bold.ttf": new URL("./fonts/CharisSIL-Bold.ttf", import.meta.url).href,
  "CharisSIL-BoldItalic.ttf": new URL("./fonts/CharisSIL-BoldItalic.ttf", import.meta.url).href,
  "CharisSIL-Italic.ttf": new URL("./fonts/CharisSIL-Italic.ttf", import.meta.url).href,
  "CharisSIL-Regular.ttf": new URL("./fonts/CharisSIL-Regular.ttf", import.meta.url).href,
  "EBGaramond-Bold.ttf": new URL("./fonts/EBGaramond-Bold.ttf", import.meta.url).href,
  "EBGaramond-BoldItalic.ttf": new URL("./fonts/EBGaramond-BoldItalic.ttf", import.meta.url).href,
  "EBGaramond-Italic.ttf": new URL("./fonts/EBGaramond-Italic.ttf", import.meta.url).href,
  "EBGaramond-Regular.ttf": new URL("./fonts/EBGaramond-Regular.ttf", import.meta.url).href,
  "IBMPlexMono-Italic.ttf": new URL("./fonts/IBMPlexMono-Italic.ttf", import.meta.url).href,
  "IBMPlexMono-Regular.ttf": new URL("./fonts/IBMPlexMono-Regular.ttf", import.meta.url).href,
  "IBMPlexMono-SemiBold.ttf": new URL("./fonts/IBMPlexMono-SemiBold.ttf", import.meta.url).href,
  "IBMPlexMono-SemiBoldItalic.ttf": new URL("./fonts/IBMPlexMono-SemiBoldItalic.ttf", import.meta.url).href,
  "Lato-Bold.ttf": new URL("./fonts/Lato-Bold.ttf", import.meta.url).href,
  "Lato-BoldItalic.ttf": new URL("./fonts/Lato-BoldItalic.ttf", import.meta.url).href,
  "Lato-Hairline.ttf": new URL("./fonts/Lato-Hairline.ttf", import.meta.url).href,
  "Lato-Italic.ttf": new URL("./fonts/Lato-Italic.ttf", import.meta.url).href,
  "Lato-Light.ttf": new URL("./fonts/Lato-Light.ttf", import.meta.url).href,
  "Lato-LightItalic.ttf": new URL("./fonts/Lato-LightItalic.ttf", import.meta.url).href,
  "Lato-Regular.ttf": new URL("./fonts/Lato-Regular.ttf", import.meta.url).href,
  "LinBiolinum_R.otf": new URL("./fonts/LinBiolinum_R.otf", import.meta.url).href,
  "NewCM10-Bold.otf": new URL("./fonts/NewCM10-Bold.otf", import.meta.url).href,
  "NewCM10-BoldItalic.otf": new URL("./fonts/NewCM10-BoldItalic.otf", import.meta.url).href,
  "NewCM10-Italic.otf": new URL("./fonts/NewCM10-Italic.otf", import.meta.url).href,
  "NewCM10-Regular.otf": new URL("./fonts/NewCM10-Regular.otf", import.meta.url).href,
  "Raleway-v4020-Medium.otf": new URL("./fonts/Raleway-v4020-Medium.otf", import.meta.url).href,
  "SourceSans3-Bold.ttf": new URL("./fonts/SourceSans3-Bold.ttf", import.meta.url).href,
  "SourceSans3-BoldItalic.ttf": new URL("./fonts/SourceSans3-BoldItalic.ttf", import.meta.url).href,
  "SourceSans3-Italic.ttf": new URL("./fonts/SourceSans3-Italic.ttf", import.meta.url).href,
  "SourceSans3-Light.ttf": new URL("./fonts/SourceSans3-Light.ttf", import.meta.url).href,
  "SourceSans3-Regular.ttf": new URL("./fonts/SourceSans3-Regular.ttf", import.meta.url).href,
  "texgyreheros-bold.otf": new URL("./fonts/texgyreheros-bold.otf", import.meta.url).href,
  "texgyreheros-bolditalic.otf": new URL("./fonts/texgyreheros-bolditalic.otf", import.meta.url).href,
  "texgyreheros-italic.otf": new URL("./fonts/texgyreheros-italic.otf", import.meta.url).href,
  "texgyreheros-regular.otf": new URL("./fonts/texgyreheros-regular.otf", import.meta.url).href,
  "texgyretermes-bold.otf": new URL("./fonts/texgyretermes-bold.otf", import.meta.url).href,
  "texgyretermes-bolditalic.otf": new URL("./fonts/texgyretermes-bolditalic.otf", import.meta.url).href,
  "texgyretermes-italic.otf": new URL("./fonts/texgyretermes-italic.otf", import.meta.url).href,
  "texgyretermes-regular.otf": new URL("./fonts/texgyretermes-regular.otf", import.meta.url).href,
}

/** The files of a font family, such as "EB Garamond", in only `weights` when given. */
export const filesOf = (family: string, weights?: readonly number[]) =>
  FONT_FILES.filter((file) => {
    const [face] = FONT_INFO[file].info
    return face.family === family && (!weights || weights.includes(face.variant.weight))
  })

/**
 * Whether a font's coverage includes a character. Coverage is runs of code
 * points from 0, alternately without and with the font, as Typst keeps it.
 */
export function covers(coverage: number[], codePoint: number): boolean {
  let end = 0
  for (let run = 0; run < coverage.length; run++) {
    end += coverage[run]
    if (codePoint < end) return run % 2 === 1
  }
  return false
}

const has = (file: string, codePoint: number) => FONT_INFO[file].info.some((face) => covers(face.coverage, codePoint))

// Characters that are never drawn, so need no font: spaces, controls, and
// ones shaping hides, like a zero-width joiner or a variation selector.
const NEVER_DRAWN = /^[\p{White_Space}\p{Cc}\p{Cs}\p{Default_Ignorable_Code_Point}]$/u

// noFontHas's answers by code point, as each goes through every font's coverage.
const withoutFont = new Map<number, boolean>()

/**
 * Whether no font has a character, so every template prints it as nothing or
 * as a box: Typst looks through every font it knows for one the template's
 * fonts lack. pdf.js reads U+0000 in its place in the PDF's text.
 */
export function noFontHas(char: string): boolean {
  const codePoint = char.codePointAt(0)!
  let missing = withoutFont.get(codePoint)
  if (missing === undefined) {
    missing = !NEVER_DRAWN.test(char) && !FONT_FILES.some((file) => has(file, codePoint))
    withoutFont.set(codePoint, missing)
  }
  return missing
}

/**
 * The font files a resume printed in `fonts` needs, given its `text`: the
 * families' own, and for each character not in all of them, or in the script
 * they leave to the fallback, the fallback's. A character the fallback lacks
 * too, or with no fallback, brings every font that has it, since Typst may
 * print it with any of those.
 */
export function fontsFor(fonts: readonly FontUse[], text: string): string[] {
  const own = fonts.filter((font) => !font.fallback).flatMap(({ family, weights }) => filesOf(family, weights))
  const fallback = fonts.find((font) => font.fallback)
  const fallbackFiles = fallback ? filesOf(fallback.family, fallback.weights) : []
  const leftToFallback = fallback?.script ? new RegExp(`\\p{Script=${fallback.script}}`, "u") : null
  const needed = new Set(own)
  const seen = new Set<number>()
  for (const char of text) {
    const codePoint = char.codePointAt(0)!
    if (codePoint < 0x20 || seen.has(codePoint)) continue
    seen.add(codePoint)
    if (!leftToFallback?.test(char) && own.every((file) => has(file, codePoint))) continue
    // Typst reads the fallback to find out whether it has the character.
    for (const file of fallbackFiles) needed.add(file)
    if (fallbackFiles.length > 0 && fallbackFiles.every((file) => has(file, codePoint))) continue
    for (const file of FONT_FILES) if (has(file, codePoint)) needed.add(file)
  }
  return [...needed]
}

/** Every font, for typst.ts's loadFonts, with `data` asked for a file's bytes only when Typst prints with it. */
export const lazyFonts = (data: (file: string) => Uint8Array) => FONT_FILES.map((file) => ({ ...FONT_INFO[file], blob: () => data(file) }))
