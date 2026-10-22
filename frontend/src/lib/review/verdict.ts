// What the review page says about the ATS checks: a verdict from their score, in the
// editor's own bands (SCORE_BANDS), so a score reads the same on the page as
// in the editor's Check, and how many notes it found.

import type { Finding, Report } from "@/lib/check/engine"
import { bandOf } from "@/lib/check/score"
import type { SCORE_BANDS } from "@/lib/check/settings"
import { count } from "@/lib/count"

export type Verdict = "ready" | "almost" | "drafts"

/** The ATS verdict only; AI writing feedback is shown separately. */
export const VERDICT_WORDS: Record<Verdict, string> = {
  ready: "Ready",
  almost: "Almost there",
  drafts: "Needs work",
}

const VERDICT_OF_BAND: Record<(typeof SCORE_BANDS)[number]["name"], Verdict> = {
  Perfect: "ready",
  Strong: "ready",
  Good: "almost",
  "Needs work": "drafts",
}

export const verdictOf = (total: number): Verdict => VERDICT_OF_BAND[bandOf(total).name]

const isMustFix = (finding: Finding) => finding.level === "fix" && !finding.advisory

/** How many notes the review shows, and how many of them are must-fixes. */
export interface Counts {
  notes: number
  mustFixes: number
}

export function countsOf(report: Report): Counts {
  // One rule can find the same thing twice at a place, as a word typed twice: it's marked once (checkNotesOf), and counted once.
  const findings = [...new Map(report.findings.map((finding) => [finding.key, finding])).values()]
  return { notes: findings.length, mustFixes: findings.filter(isMustFix).length }
}

/** The counts on the frame round the reviewed resume: "4 notes, 2 must-fixes". */
export function countsLabel({ notes, mustFixes }: Counts): string {
  return mustFixes > 0 ? `${count(notes, "note")}, ${count(mustFixes, "must-fix", "must-fixes")}` : count(notes, "note")
}
