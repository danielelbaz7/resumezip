// The resume as a LaTeX file (.tex), to keep editing on Overleaf or with any
// TeX install, laid out as the PDF's template is. Each template in
// templates/ is a LaTeX twin of the .typ file of the same name in
// lib/typst/templates/: its fonts, sizes, spaces and layout, set with the
// page and sizes Fine-tune gives. The words come from toTemplateData, as the
// PDF's do, so the headings and their order match, and what's left out of the
// PDF isn't in it either. A file can't match its PDF line for line: TeX
// breaks lines and pages its own way.
//
// It compiles with pdfLaTeX, Overleaf's default. pdfLaTeX's fonts only have
// Latin letters, so a resume with others (Иван, Nguyễn) gets a file that asks
// for XeLaTeX, where the template's fonts print what the PDF prints. Every
// file works with both engines, and with LuaLaTeX; iftex tells them apart.
//
// Unlike the PDF and the Word file, it doesn't carry its resume, so
// resumezip can't open it again.
//
// The editor downloads this module when LaTeX is first chosen.

import type { Resume } from "@/lib/resume"
import type { TemplateId } from "@/lib/templates"
import { templateIdOf, toTemplateData } from "@/lib/typst/resumeData"
import { beyondPdfLatex, latex, unitsOf, type LatexTemplate } from "./common"
import { accent } from "./templates/accent"
import { deedy } from "./templates/deedy"
import { ian } from "./templates/ian"
import { jake } from "./templates/jake"
import { levelsfyi } from "./templates/levelsfyi"
import { margin } from "./templates/margin"
import { modernjack } from "./templates/modernjack"
import { mono } from "./templates/mono"
import { referme } from "./templates/referme"
import { resumeworded } from "./templates/resumeworded"
import { swiss } from "./templates/swiss"

/** A LaTeX file's type, for a download. */
export const LATEX_TYPE = "application/x-tex"

/** Every template's LaTeX twin. A new template doesn't compile without one. */
const TEMPLATES: Record<TemplateId, LatexTemplate> = {
  accent,
  deedy,
  ian,
  jake,
  levelsfyi,
  margin,
  modernjack,
  mono,
  referme,
  resumeworded,
  swiss,
}

export interface LatexFile {
  text: string
  /**
   * The letters in it pdfLaTeX can't print, in the order they first appear.
   * When there are any, the file says to compile it with XeLaTeX.
   */
  beyondPdfLatex: string[]
}

// How many of them the file's first lines name.
const NAMED = 10

/** The resume as a LaTeX file, laid out as its template is. */
export function toLatexFile(resume: Resume): LatexFile {
  const data = toTemplateData(resume)
  const template = TEMPLATES[templateIdOf(resume.selectedTemplate)]
  const units = unitsOf(data.tune)
  const title = latex(data.profile.name || "Resume")
  // An empty resume is an empty page, as its PDF is, rather than no PDF at all.
  const document = template.body(data, units) || "\\mbox{}"
  const letters = beyondPdfLatex(document + title)

  const named = letters.slice(0, NAMED).join(" ") + (letters.length > NAMED ? " ..." : "")
  // Editors that read the first line (TeXShop, TeXworks, VS Code) switch to
  // XeLaTeX by themselves; Overleaf doesn't, so pdfLaTeX stops first with
  // what to do, before an error for each letter.
  const head = letters.length
    ? `% !TeX program = xelatex
% This resume has letters pdfLaTeX can't print: ${named}
% Compile it with XeLaTeX. On Overleaf, set Compiler to XeLaTeX in the project's settings.
`
    : ""
  const stop = letters.length
    ? `
\\ifPDFTeX
  \\PackageError{resume}{This resume has letters pdfLaTeX can't print. Compile it with XeLaTeX}{On Overleaf, set Compiler to XeLaTeX in the project's settings.}
\\fi
`
    : ""

  const text = `${head}%-------------------------
% Resume in LaTeX, from resumezip
${template.credit.map((line) => `% ${line}`).join("\n")}
%-------------------------

${template.preamble(units, title).trimEnd()}
${stop}
%-------------------------------------------
%%%%%%  RESUME STARTS HERE  %%%%%%%%%%%%%%%%%%%%%%%%%%%%

\\begin{document}

${document}

\\end{document}
`
  return { text, beyondPdfLatex: letters }
}
