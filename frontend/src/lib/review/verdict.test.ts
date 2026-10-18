import { describe, expect, test } from "vitest"
import type { Finding, Report } from "@/lib/check/engine"
import { mustFixMax, type CategoryScore, type Score } from "@/lib/check/score"
import { CATEGORIES, type CategoryId } from "@/lib/check/settings"
import { countsOf, reasonOf, verdictOf } from "./verdict"

describe("verdictOf", () => {
  test("follows the editor's bands: Strong and up is ready, Good is almost there, the rest back to drafts", () => {
    expect([100, 90, 89, 70, 69, 0].map(verdictOf)).toEqual(["ready", "ready", "almost", "almost", "drafts", "drafts"])
  })

  test("a resume with a must-fix left is never ready to send", () => {
    expect(verdictOf(mustFixMax(1))).not.toBe("ready")
  })
})

// Every category earning all its points, but `lost` from the ones given.
function scoreOf(total: number, lost: Partial<Record<CategoryId, number>> = {}): Score {
  const categories: CategoryScore[] = CATEGORIES.map(({ id, points }) => ({
    id,
    points,
    earned: points - (lost[id] ?? 0),
    applies: points > 0,
    mustFix: false,
    fixes: 0,
  }))
  return { total, categories }
}

const finding = (level: Finding["level"], advisory = false): Finding => ({
  rule: "B1",
  level,
  ...(advisory && { advisory }),
  category: "bullets",
  place: { kind: "profile", field: "email" },
  message: "",
  why: "",
  text: "",
  key: "",
  dismissed: false,
})
const reportOf = (findings: Finding[]) => ({ findings }) as unknown as Report

describe("reasonOf", () => {
  test("names what cost the most points", () => {
    expect(reasonOf(scoreOf(64, { bullets: 12, dates: 3 }), reportOf([finding("look")]))).toBe(
      "Your bullets say what you did more than what changed.",
    )
    expect(reasonOf(scoreOf(80, { bullets: 2, spelling: 9 }), reportOf([finding("look")]))).toBe("There are typos to fix.")
  })

  test("a resume that's ready says whether anything is left", () => {
    expect(reasonOf(scoreOf(100), reportOf([]))).toBe("Nothing left that a recruiter would trip on.")
    expect(reasonOf(scoreOf(94, { polish: 0, bullets: 2 }), reportOf([finding("look")]))).toBe("A few small things left to look at.")
  })
})

test("countsOf counts every note, and the must-fixes that aren't advice", () => {
  expect(countsOf(reportOf([finding("fix"), finding("look"), finding("look", true), finding("fix")]))).toEqual({ notes: 4, mustFixes: 2 })
})
