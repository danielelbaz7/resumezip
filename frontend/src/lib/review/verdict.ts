// What the review page says about a resume: a verdict from its score, in the
// editor's own bands (SCORE_BANDS), so the page and the editor's Check never
// disagree, and one line on what cost it most.

import type { Finding, Report } from "@/lib/check/engine"
import { bandOf, type Score } from "@/lib/check/score"
import type { CategoryId, SCORE_BANDS } from "@/lib/check/settings"

export type Verdict = "ready" | "almost" | "drafts"

/** The words each verdict is shown as, after "Your resume is". */
export const VERDICT_WORDS: Record<Verdict, string> = {
  ready: "Ready to send",
  almost: "Almost there",
  drafts: "Back to drafts",
}

const VERDICT_OF_BAND: Record<(typeof SCORE_BANDS)[number]["name"], Verdict> = {
  Perfect: "ready",
  Strong: "ready",
  Good: "almost",
  "Needs work": "drafts",
}

export const verdictOf = (total: number): Verdict => VERDICT_OF_BAND[bandOf(total).name]

// What a category that cost the most points says about the resume.
const COST: Record<CategoryId, string> = {
  contact: "Your contact details need a look.",
  readable: "Hiring software can’t read all of it.",
  sections: "A section or an entry is missing something.",
  dates: "Some dates are missing or don’t line up.",
  bullets: "Your bullets say what you did more than what changed.",
  length: "Its length or layout needs a look.",
  spelling: "There are typos to fix.",
  polish: "A few small things to tidy.",
}

/**
 * One plain line on why: for a resume that's ready, whether anything is left,
 * and otherwise what the category that lost the most points is about.
 */
export function reasonOf(score: Score, report: Report): string {
  if (score.total !== null && verdictOf(score.total) === "ready")
    return report.findings.length === 0 ? "Nothing left that a recruiter would trip on." : "A few small things left to look at."
  const costliest = score.categories
    .filter((category) => category.applies)
    .reduce<{ id: CategoryId; lost: number } | null>((most, { id, points, earned }) => {
      const lost = points - earned
      return lost > (most?.lost ?? 0) ? { id, lost } : most
    }, null)
  return costliest ? COST[costliest.id] : "A few small things left to look at."
}

const isMustFix = (finding: Finding) => finding.level === "fix" && !finding.advisory

/** How many notes the review shows, and how many of them are must-fixes. */
export interface Counts {
  notes: number
  mustFixes: number
}

export function countsOf(report: Report): Counts {
  return { notes: report.findings.length, mustFixes: report.findings.filter(isMustFix).length }
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The counts on the frame round the reviewed resume: "4 notes, 2 must-fixes". */
export function countsLabel({ notes, mustFixes }: Counts): string {
  return mustFixes > 0 ? `${count(notes, "note")}, ${count(mustFixes, "must-fix", "must-fixes")}` : count(notes, "note")
}

/** The counts as a sentence: "We found 4 things a recruiter would trip on, 2 of them must-fixes." */
export function foundSentence({ notes, mustFixes }: Counts): string {
  const fixes = mustFixes === 0 ? "" : mustFixes === 1 ? ", one of them a must-fix" : `, ${mustFixes} of them must-fixes`
  return `We found ${count(notes, "thing")} a recruiter would trip on${fixes}.`
}
