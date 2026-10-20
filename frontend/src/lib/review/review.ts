// Reviews a resume file in the browser, as the editor's Check would: it's
// opened as "Open a file" opens it, its pages are read the way hiring software
// reads them (lib/check/preview.ts), its words are checked by the grammar
// checker, then every rule runs over it. A PDF is reviewed as it is, its own
// pages read, shown and marked, so it's judged as the person would send it.
// A Word or JSON file has no pages of its own, so it's printed with its
// template, which for a Word file from elsewhere is the default one. Opened in
// the editor, a resume is printed in its template, so a PDF from elsewhere
// can score differently there.
// Nothing leaves the browser: the PDF engine and the grammar checker are
// downloaded, not called.

import { runChecks, type GrammarLint, type PdfReading, type Report } from "@/lib/check/engine"
import { pdfLayoutOf } from "@/lib/check/extraPdf"
import { hasEnoughToCheck } from "@/lib/check/labels"
import { viewOf, type ResumeView } from "@/lib/check/resume"
import { scoreOf, type Score } from "@/lib/check/score"
import { grammarTexts } from "@/lib/check/spelling"
import { kindOf, OpenFileError, openResumeFile, until } from "@/lib/import/open"
import { toResumeContent } from "@/lib/import/parse"
import type { Resume, ResumeContent } from "@/lib/resume"
import { imported } from "@/lib/resumeStore"
import { templateById } from "@/lib/templates"
import { compileResume } from "@/lib/typst/compile"

/** What's done, in the order the page lists them: the file opened, the PDF read, the text checked. */
export type ReviewStep = "open" | "read" | "spell"

export interface Review {
  /** The file's name without its extension, as the dashboard names what it opens. */
  title: string
  /** What the file holds, as "Fix it in the editor" adds it. */
  content: ResumeContent
  /** The resume as checked. */
  resume: Resume
  report: Report
  score: Score & { total: number }
  /** Its pages, which the marks are drawn on: the PDF as it came, or as its template prints it. */
  pdf: Uint8Array
  /** That PDF as hiring software reads it; null if it couldn't be read, and then the PDF rules don't count. */
  reading: PdfReading | null
  /** Whether the grammar checker ran; when it couldn't load, spelling doesn't count. */
  spelled: boolean
  /** The template a Word file from elsewhere was printed in to be reviewed; null when the file's own pages, or its own template, were. */
  setIn: string | null
}

/** Whether `file` is reviewed as it is, its own pages read and marked: a PDF is. */
export const reviewedAsIs = (file: File) => kindOf(file) === "pdf"

/** The resume's pages, as the PDF came or as printed, and as read back, once they are; its spelling may still be checked. */
export interface Printed {
  pdf: Uint8Array
  reading: PdfReading | null
  view: ResumeView
}

/**
 * Reviews `file`, calling `onDone` as each step finishes, and `onPrinted` with
 * its pages as soon as they're read back, which the AI can be asked
 * about while the rest goes on. Rejects with an OpenFileError, worded for the
 * person, when the file can't be reviewed, and with the signal's reason once it aborts.
 */
export async function reviewFile(
  file: File,
  signal: AbortSignal,
  onDone: (step: ReviewStep) => void,
  onPrinted?: (printed: Printed) => void,
): Promise<Review> {
  const opened = await openResumeFile(file, { signal })
  if (opened.kind === "all") throw new OpenFileError("This file has several resumes in it. Review a PDF or Word file of one.")
  if (opened.kind === "parsed") void opened.pdf?.doc.destroy()
  const content = opened.kind === "parsed" ? toResumeContent(opened.parsed) : opened.resume
  const resume = imported(content, "personal")
  const asIs = reviewedAsIs(file)
  const setIn = !asIs && opened.kind === "parsed" ? templateById(resume.selectedTemplate).name : null
  const view = viewOf(resume)
  if (!hasEnoughToCheck(view)) throw new OpenFileError("There’s no name and no section in this file to check. Is it a resume?")
  onDone("open")

  const printing = (async () => {
    const pdf = asIs ? new Uint8Array(await until(file.arrayBuffer(), signal)) : await until(compileResume(resume), signal)
    const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }))
    try {
      const { readPreview } = await import("@/lib/check/preview")
      const reading = await readPreview(url, signal, pdfLayoutOf(view))
      onDone("read")
      onPrinted?.({ pdf, reading, view })
      return { pdf, reading }
    } finally {
      URL.revokeObjectURL(url)
    }
  })()
  const spelling = (async () => {
    const texts = [...new Set(grammarTexts(view).map(({ text }) => text))]
    try {
      const { checkGrammar } = await import("@/lib/check/grammar")
      const lints = await until(checkGrammar(texts), signal)
      return new Map<string, readonly GrammarLint[]>(texts.map((text, index) => [text, lints[index]]))
    } catch (error) {
      if (signal.aborted) throw error
      // The editor says the same when Harper can't load: spelling waits, and doesn't count.
      console.warn("The grammar checker couldn't check the resume:", error)
      return undefined
    } finally {
      onDone("spell")
    }
  })()
  const [{ pdf, reading }, grammar] = await Promise.all([printing, spelling])

  const report = runChecks(resume, { pdf: reading ?? undefined, grammar })
  const score = scoreOf(report)
  // hasEnoughToCheck held, so there's a total.
  return {
    title: opened.title,
    content,
    resume,
    report,
    score: { ...score, total: score.total ?? 0 },
    pdf,
    reading,
    spelled: !!grammar,
    setIn,
  }
}
