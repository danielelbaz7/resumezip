import { describe, expect, test } from "vitest"
import type { Finding, Report } from "@/lib/check/engine"
import { mustFixMax } from "@/lib/check/score"
import { countsLabel, countsOf, verdictOf } from "./verdict"

describe("verdictOf", () => {
  test("follows the editor's bands: Strong and up is ready, Good is almost there, the rest back to drafts", () => {
    expect([100, 90, 89, 70, 69, 0].map(verdictOf)).toEqual(["ready", "ready", "almost", "almost", "drafts", "drafts"])
  })

  test("a resume with a must-fix left is never ready to send", () => {
    expect(verdictOf(mustFixMax(1))).not.toBe("ready")
  })
})

let keys = 0
const finding = (level: Finding["level"], advisory = false, key = `k${++keys}`): Finding => ({
  rule: "B1",
  level,
  ...(advisory && { advisory }),
  category: "bullets",
  place: { kind: "profile", field: "email" },
  message: "",
  why: "",
  text: "",
  key,
  dismissed: false,
})
const reportOf = (findings: Finding[]) => ({ findings }) as unknown as Report

test("countsOf counts every note, and the must-fixes that aren't advice", () => {
  expect(countsOf(reportOf([finding("fix"), finding("look"), finding("look", true), finding("fix")]))).toEqual({ notes: 4, mustFixes: 2 })
})

test("countsOf counts a thing found twice at one place once, as it's marked once", () => {
  expect(countsOf(reportOf([finding("fix", false, "twice"), finding("fix", false, "twice"), finding("look")]))).toEqual({
    notes: 2,
    mustFixes: 1,
  })
})

test("says how many notes and must-fixes there are, in words", () => {
  expect(countsLabel({ notes: 1, mustFixes: 0 })).toBe("1 note")
  expect(countsLabel({ notes: 4, mustFixes: 1 })).toBe("4 notes, 1 must-fix")
  expect(countsLabel({ notes: 4, mustFixes: 2 })).toBe("4 notes, 2 must-fixes")
})
