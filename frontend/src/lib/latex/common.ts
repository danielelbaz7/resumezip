// What every template's LaTeX file shares, as templates/common.typ is for the
// Typst templates: text escaped so it prints as typed, links, citations,
// project headers, Fine-tune's multiples as lengths, the resume's sections in
// its order, and the preamble every file starts with. Each template in
// templates/ writes its own preamble and body with these.

import { SECTIONS, type SectionName } from "@/components/editor/sections"
import type { ExtraTemplateSection, Run, TemplateData } from "@/lib/typst/resumeData"
import type { PrintedTune } from "@/lib/tune"

/** A template's LaTeX: its preamble, after \documentclass, and its body. */
export interface LatexTemplate {
  /**
   * Lines naming what it's drawn from, for the comment at the top of the
   * file, as "Based on Jake's Resume: https://github.com/jakegut/resume".
   */
  credit: string[]
  /** \documentclass and everything up to \begin{document}. `title` is the PDF's title, escaped. */
  preamble: (units: Units, title: string) => string
  /** Everything between \begin{document} and \end{document}. */
  body: (data: TemplateData, units: Units) => string
}

// ---------- Text ----------

// What TeX reads as markup rather than text, as text that prints it.
const SPECIAL: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
  // Not markup, but XeLaTeX and LuaLaTeX print a straight " as a closing ”.
  '"': "\\textquotedbl{}",
}

// Control characters pasted text can bring, and half of an emoji (a surrogate
// without its pair), which nothing prints. Whole emoji are matched so they're
// kept. Zero-width spaces and joiners print nothing either, but pdfLaTeX would
// stop at them.
const UNPRINTABLE = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF\0-\x08\x0B\x0C\x0E-\x1F\x7F​⁠﻿]/g

// Pairs the fonts join into one mark ("--" is a dash, "''" a closing quote,
// "<<" a guillemet, "!`" is "¡"): a zero kern goes between the two, so they
// print as typed. An empty group would do in pdfLaTeX but not in XeLaTeX or
// LuaLaTeX. A lone ' and ` still print as curly quotes, as LaTeX writes them.
const LIGATURE = /([-'`<>,])(?=\1)|[!?](?=`)/g

/**
 * Text as LaTeX that prints it as typed. Line breaks are `lineBreak`; tabs
 * are spaces. Letters are composed (NFC), since pdfLaTeX can print "é" but not
 * "e" followed by a combining accent, as macOS sometimes types it.
 */
export function latex(value: string, lineBreak = " "): string {
  return value
    .normalize("NFC")
    .replace(UNPRINTABLE, (match) => (match.length === 2 ? match : ""))
    .replace(/[\\{}&%$#_~^"]/g, (special) => SPECIAL[special])
    .replace(LIGATURE, "$&\\kern0pt ")
    .replace(/\t/g, " ")
    .replace(/\r\n?|\n/g, lineBreak)
}

/**
 * Prose, keeping its line breaks, each line indented by `indent`. \newline
 * rather than \\, which would read a line starting with [ or * as its own option.
 */
export const prose = (value: string, indent = "    ") => latex(value, `\\newline\n${indent}`)

/** Paragraphs of prose, a blank line between them, each line indented by `indent`. */
export const paragraphs = (texts: string[], indent = "    ") => texts.map((text) => indent + prose(text, indent)).join("\n\n")

export const bold = (body: string) => `\\textbf{${body}}`
export const italic = (body: string) => `\\textit{${body}}`

/** A bullet: its words in bold and italic where they were marked so (`rich` in templates/common.typ). */
export const runs = (pieces: Run[]) =>
  pieces
    .map((piece) => {
      let out = latex(piece.text)
      if (piece.italic) out = italic(out)
      if (piece.bold) out = bold(out)
      return out
    })
    .join("")

/** "Start - End", or whichever of the two is present, as the templates print dates. */
export const dateRange = (start: string, end: string) => (start && end ? `${start} - ${end}` : start + end)

/** The values that aren't empty, joined by `separator`, as `join-present` in templates/common.typ. */
export const joinPresent = (separator: string, ...values: string[]) => values.filter(Boolean).join(separator)

/** \item would read text starting with [ as its label. */
export const itemText = (text: string) => text.replace(/^\[/, "{}[")

// ---------- Links ----------

/**
 * An address as hyperref reads it inside another command's argument, where %,
 * # and & still need a backslash. What can't be escaped there (a backslash,
 * braces, spaces) is percent-encoded, and that % escaped in turn. So is ^, as
 * TeX reads ^^ and two hex digits as the character they name, before hyperref
 * sees it: ^^7d would close the link, and the address could run what follows.
 * One pass, so nothing it writes is read again.
 */
const address = (url: string) =>
  url.replace(/[\\{}\s^%#&]/g, (character) => `\\${/[%#&]/.test(character) ? character : encodeURIComponent(character)}`)

/** The address a link goes to, or null for one that isn't an address, which is printed without a link. */
function linkTarget(url: string): string | null {
  try {
    return new URL(url).href
  } catch {
    return null
  }
}

/** Profile and project links are stored without "https://" (see resumeData.ts). */
export const web = (url: string) => `https://${url}`

/** `body` linked to `url`, or `body` alone when `url` isn't an address. */
export const href = (url: string, body: string) => {
  const target = linkTarget(url)
  return target ? `\\href{${address(target)}}{${body}}` : body
}

/**
 * A link printed as its own text, in the template's `style` (as Jake's
 * underline); plain when it isn't an address.
 */
export const shownLink = (url: string, text: string, style = (body: string) => body) =>
  linkTarget(url) ? href(url, style(latex(text))) : latex(text)

/** How a template prints a link: its address, and the words it shows, already LaTeX. */
export type ShowLink = (url: string, text: string) => string

/** A link that's a profile or project address, stored without its "https://". */
export const webLink = (url: string, style?: (body: string) => string) => shownLink(web(url), url, style)

/** An email address, linked to write to it. */
export const emailLink = (address: string, style?: (body: string) => string) => shownLink(`mailto:${address}`, address, style)

/**
 * A project's first line, as `project-header` in templates/common.typ: its
 * name in bold, linked when the person chose to link names, its tech stack in
 * italics, then its links as text, drawn by `showLink`, `separator` between them.
 */
export function projectHeader(project: TemplateData["projects"][number], separator: string, showLink: ShowLink): string {
  const parts: string[] = []
  if (project.name) parts.push(bold(project.link ? href(web(project.link), latex(project.name)) : latex(project.name)))
  if (project.techStack) parts.push(`\\emph{${latex(project.techStack)}}`)
  for (const url of project.links) parts.push(showLink(web(url), url))
  return parts.join(separator)
}

// ---------- Publications ----------

/**
 * A publication as a citation, IEEE style, as the templates print it
 * (`citation` in templates/common.typ), with the resume owner's name in bold.
 * `showLink` draws the DOI or link in the template's link style:
 *   R. Conde, J. Smith, and A. Lee, “Title of the paper,” Venue, details, date, doi: 10.1/x.
 */
export function citation(
  { title, authors, venue, details, date, doi, link }: TemplateData["publications"][number],
  showLink: ShowLink,
): string {
  // Each part, and the text it ends with, for the closing full stop.
  const rest: [string, string][] = []
  if (venue) rest.push([italic(latex(venue)), venue])
  if (details) rest.push([latex(details), details])
  if (date) rest.push([latex(date), date])
  if (doi) rest.push([`doi: ${showLink(`https://doi.org/${doi}`, doi)}`, doi])
  else if (link) rest.push([showLink(web(link), link), link])

  // Names and what's between them are escaped together, up to the owner's,
  // so a pair split between two of them still prints as typed.
  let out = ""
  let others = ""
  for (const piece of authors) {
    if (!piece.me) others += piece.text
    else {
      out += latex(others) + bold(latex(piece.text))
      others = ""
    }
  }
  out += latex(others)
  if (title) {
    if (authors.length) out += ", "
    // The comma after the title, or the closing full stop, goes inside the quotes.
    const mark = /[.?!]$/.test(title) ? "" : rest.length ? "," : "."
    out += `“${latex(title)}${mark}”${rest.length ? " " : ""}`
  } else if (authors.length && rest.length) {
    out += ", "
  }
  if (rest.length) {
    out += rest.map(([part]) => part).join(", ")
    if (!rest.at(-1)![1].endsWith(".")) out += "."
  }
  return out
}

/**
 * Publications as a numbered list, [1], [2], ..., each hanging under its
 * number, as `citations` in templates/common.typ. Needs enumitem. `options`
 * are more of enumitem's, as the space between them and the margin's indent.
 */
export function citations(publications: TemplateData["publications"], showLink: ShowLink, options: string, indent = "  "): string {
  return [
    `${indent}\\begin{enumerate}[label={[\\arabic*]}, widest=${publications.length}, align=left, leftmargin=*, ${options}]`,
    ...publications.map((publication) => `${indent}  \\item ${itemText(citation(publication, showLink))}`),
    `${indent}\\end{enumerate}`,
  ].join("\n")
}

// ---------- Sections ----------

/** Where each section's entries and heading are in TemplateData. */
const SECTION_KEYS: Record<SectionName, keyof TemplateData["headings"]> = {
  Education: "education",
  Work: "work",
  Projects: "projects",
  Publications: "publications",
  Skills: "skills",
  Leadership: "leadership",
  Volunteership: "volunteer",
  Awards: "awards",
}

/** A section with something to print, and its heading, already LaTeX. */
export type Section = { heading: string; name: string } & (
  { kind: "extra"; extra: ExtraTemplateSection } | { kind: keyof TemplateData["headings"] }
)

/**
 * The resume's sections in its order, each with something to print: the
 * heading the person wrote, or the one every template prints (`heading-or`
 * in the .typ files). The summary isn't one; it's in `data.summary`.
 */
export function sectionsOf(data: TemplateData): Section[] {
  return data.order.flatMap((name): Section[] => {
    const extra = data.extras[name]
    if (extra) return [{ kind: "extra", name, heading: latex(extra.heading), extra }]
    const kind = SECTION_KEYS[name as SectionName]
    if (!kind || data[kind].length === 0) return []
    return [{ kind, name, heading: latex(data.headings[kind] || SECTIONS[name as SectionName].title) }]
  })
}

// ---------- Fine-tune ----------

/**
 * Fine-tune's settings as lengths, as `sized`, `spaced`, `gapped` and the
 * page's in templates/common.typ. At 1 each gives back what it's given. A
 * resume kept to one page prints with the person's own multiples: how far
 * the PDF tightened them was measured in Typst, which sets lines differently.
 */
export interface Units {
  /** A text size, or the space around a heading or between entries, in Typst's points: it follows the text size. */
  size: (pt: number) => string
  /** The space between lines, in Typst's points: it follows the text size and the line spacing. */
  space: (pt: number) => string
  /** The space above a section, in Typst's points: it follows the text size and the space between sections. */
  gap: (pt: number) => string
  /** A page margin, in inches: it follows the margins. */
  margin: (inches: number) => string
  /** The paper, as \documentclass and geometry name it: the person's, or the template's own. */
  paper: (own: "letterpaper" | "a4paper") => "letterpaper" | "a4paper"
}

// Lengths to a hundredth, which is finer than print shows. Typst's point is
// the PostScript point, 1/72 in, which TeX calls bp; TeX's own pt is 0.4%
// smaller, which over a page comes to a line's worth.
const length = (value: number, unit: "bp" | "in") => `${Math.round(value * 100) / 100}${unit}`

/** Lengths that `Units` gave, added up into one, so the .tex has a number rather than a \dimexpr. */
export const sum = (...lengths: string[]) =>
  length(
    lengths.reduce((total, part) => total + parseFloat(part), 0),
    "bp",
  )

export function unitsOf(tune: PrintedTune): Units {
  return {
    size: (pt) => length(pt * tune.size, "bp"),
    space: (pt) => length(pt * tune.size * tune.leading, "bp"),
    gap: (pt) => length(pt * tune.size * tune.gap, "bp"),
    margin: (inches) => length(inches * tune.margin, "in"),
    paper: (own) => (tune.paper === "a4" ? "a4paper" : tune.paper === "us-letter" ? "letterpaper" : own),
  }
}

// ---------- Preamble ----------

/**
 * What every preamble starts with, after \documentclass: iftex, to tell the
 * engines apart, and T1 for pdfLaTeX, so it prints accents, <, > and | as
 * typed. A template loads its fonts after it.
 */
export const ENGINES = `\\usepackage{iftex}
\\ifPDFTeX
  \\usepackage[T1]{fontenc}
\\fi`

/**
 * Links that print as text, without boxes around them, the PDF's title, and
 * text that hiring software reads back as it's printed: with pdfLaTeX,
 * glyphtounicode maps each letter back to its character and real spaces go
 * between words, which would otherwise read as one; with XeLaTeX, a font
 * that draws - as a hyphen character (Lato, Source Sans) gives back the -
 * that was typed. Loaded after the template's other packages, as hyperref asks.
 */
export const links = (title: string) => `\\usepackage[hidelinks]{hyperref}
\\hypersetup{pdftitle={${title}}}
\\urlstyle{same}
\\ifPDFTeX
  \\input{glyphtounicode}
  \\pdfgentounicode=1
  \\pdfinterwordspaceon
\\fi
\\ifXeTeX
  \\XeTeXgenerateactualtext=1
\\fi`

/**
 * \resumeRow{left}{right}: a line with one part flush left and one flush
 * right, as `row` in templates/common.typ. A long left part wraps, and the
 * right one sits on its last line, as Typst's bottom-aligned row has it:
 * tabularx's X columns are top-aligned unless they're told otherwise. Needs
 * tabularx.
 */
export const ROW = `\\newcolumntype{L}{>{\\raggedright\\arraybackslash}X}
\\newcommand{\\resumeRow}[2]{{%
  \\renewcommand{\\tabularxcolumn}[1]{b{##1}}%
  \\begin{tabularx}{\\linewidth}{@{}L@{\\hspace{0.8em}}r@{}}#1 & #2\\end{tabularx}%
}}`

/**
 * TeX Gyre Heros, as the Helvetica-style templates are set in: its Type 1
 * fonts with pdfLaTeX, its OpenType ones otherwise. Some TeX installs leave
 * out TeX Gyre's OpenType files; Nimbus Sans, which TeX Gyre Heros is drawn
 * from, stands in for them.
 */
export const HEROS = `\\ifPDFTeX
  \\usepackage{tgheros}
  \\renewcommand*\\familydefault{\\sfdefault}
\\else
  \\usepackage{fontspec}
  \\IfFontExistsTF{texgyreheros-regular.otf}{
    \\setmainfont{texgyreheros}[Extension=.otf, UprightFont=*-regular, BoldFont=*-bold, ItalicFont=*-italic, BoldItalicFont=*-bolditalic]
  }{
    \\setmainfont{zhv}[Extension=.otf, UprightFont=*-Reg, BoldFont=*-Bol, ItalicFont=*-RegIta, BoldItalicFont=*-BolIta]
  }
\\fi`

// ---------- What pdfLaTeX can print ----------

// What pdfLaTeX printed, character by character, with T1 and Latin Modern in
// TeX Live 2023; Overleaf's is newer and prints at least as much. Everything
// else stops it with "Unicode character ... not set up for use with LaTeX".
// prettier-ignore
const PDFLATEX_PRINTS = new RegExp(
  "[\\n\\x20-\\x7E\\u00A0-\\u0125\\u0128-\\u0137\\u0139-\\u013E\\u0141-\\u0148\\u014A-\\u0165\\u0168-\\u017E\\u0192" +
  "\\u01C4-\\u01D4\\u01E2\\u01E3\\u01E6-\\u01EB\\u01F0\\u01F4\\u01F5\\u0218-\\u021B\\u0232\\u0233\\u0237\\u02C6\\u02C7" +
  "\\u02D8\\u02D9\\u02DB-\\u02DD\\u1E02\\u1E03\\u1E0D\\u1E1E-\\u1E21\\u1E25\\u1E30\\u1E31\\u1E37\\u1E43\\u1E45\\u1E47" +
  "\\u1E5B\\u1E63\\u1E6D\\u1E8E-\\u1E91\\u1E9E\\u1EF2\\u1EF3\\u200C\\u2010-\\u2016\\u2018-\\u201A\\u201C-\\u201E" +
  "\\u2020-\\u2022\\u2026\\u2030\\u2031\\u2039-\\u203B\\u203D\\u2044\\u204E\\u2052\\u20A1\\u20A4\\u20A6\\u20A9" +
  "\\u20AB\\u20AC\\u20B1\\u2103\\u2116\\u2117\\u211E\\u2120\\u2122\\u2126\\u2127\\u212E\\u2190-\\u2193\\u2329\\u232A" +
  "\\u25E6\\u25EF\\u266A\\uFB00-\\uFB06]",
  "u",
)

/** The letters in `text` pdfLaTeX can't print, each once, in the order they first appear. */
export const beyondPdfLatex = (text: string) => [...new Set([...text].filter((character) => !PDFLATEX_PRINTS.test(character)))]
