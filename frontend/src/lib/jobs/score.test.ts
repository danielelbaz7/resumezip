import { describe, expect, test } from "vitest"
import {
  blendedScore,
  coreOf,
  creditOf,
  foundOf,
  keywordsOf,
  missingScreening,
  onResume,
  placeOf,
  ranked,
  ratingOf,
  strengthOf,
  tierOf,
  type Evidence,
  type Requirement,
} from "./score"

const requirement = (name: string, tier: Requirement["tier"], keyword = name): Requirement => ({ name, tier, keyword })
const proof = (strength: Evidence["strength"], place: Evidence["place"] = "projects"): Evidence => ({ strength, place })

const CPP = requirement("Proficiency in C++", 1, "C++")
const CONCURRENCY = requirement("Concurrency", 2, "concurrency")
const LLVM = requirement("LLVM", 3)

describe("the core layer", () => {
  test("is full when every requirement has strong proof in three or more jobs and projects", () => {
    expect(
      coreOf(
        [CPP, CONCURRENCY],
        [
          { ...proof("strong"), examples: 3 },
          { ...proof("strong"), examples: 5 },
        ],
      ),
    ).toBe(100)
  })

  test("gives more for more direct proof, one example each: strong, then shown in work, then only listed", () => {
    expect(["strong", "good", "weak", "none"].map((strength) => coreOf([CPP], [proof(strength as Evidence["strength"])]))).toEqual([
      85, 65, 40, 0,
    ])
  })

  test("gives more for each job or project past the first that shows the work, up to three", () => {
    expect([1, 2, 3, 4].map((examples) => creditOf({ ...proof("strong"), examples }))).toEqual([0.85, 0.925, 1, 1])
    expect([1, 2, 3].map((examples) => creditOf({ ...proof("good"), examples }))).toEqual([0.65, 0.725, 0.8])
    // A listed skill has no jobs or projects to count.
    expect(creditOf({ ...proof("weak", "skills"), examples: 4 })).toBe(0.4)
  })

  test("favors two C++ projects over one, the rest the same", () => {
    expect(coreOf([CPP], [{ ...proof("good"), examples: 2 }])).toBeGreaterThan(coreOf([CPP], [{ ...proof("good"), examples: 1 }])!)
  })

  test("weighs a must-have 3, a strong signal 2 and a nice to have 1", () => {
    // 3 × 0.85 + 2 × 0.4 + 1 × 0, out of 6.
    expect(coreOf([CPP, CONCURRENCY, LLVM], [proof("strong"), proof("weak"), proof("none")])).toBe(56)
  })

  test("takes evidence the answer left out as none, and is null for a job with no requirements", () => {
    expect(coreOf([CPP, LLVM], [proof("strong")])).toBe(64)
    expect(coreOf([], [])).toBeNull()
  })
})

describe("the keywords layer", () => {
  test("is the requirements whose terms are on the resume as written, by their tier's worth", () => {
    expect(keywordsOf([CPP, CONCURRENCY, LLVM], "Built a C++ engine")).toBe(50)
    expect(keywordsOf([], "C++")).toBeNull()
  })

  test("finds a term whole, whatever its case, with the marks in names like C++, C# and Node.js", () => {
    expect(onResume("Go", "Go, Python")).toBe(true)
    expect(onResume("Go", "good code")).toBe(false)
    expect(onResume("node.js", "Node.js and React")).toBe(true)
    expect(onResume("C#", "C#/.NET")).toBe(true)
    expect(onResume("C++", "C and Rust")).toBe(false)
    expect(onResume("distributed systems", "Distributed  systems")).toBe(true)
    // A full stop that ends the sentence isn't part of the word.
    expect(onResume("Rust", "Built it with Rust.")).toBe(true)
    expect(onResume(".NET", "Moved to .NET.")).toBe(true)
  })
})

describe("the whole score", () => {
  const parts = { core: 80, projects: 60, experience: 50, domain: 100, keywords: 40, narrative: 80 }

  test("weighs core 35%, projects 25%, experience 20%, domain 10%, keywords and the story 5% each", () => {
    expect(blendedScore(parts)).toBe(69)
  })

  test("takes a fifth off for each must-have with no evidence", () => {
    expect(blendedScore(parts, 1)).toBe(55)
    expect(blendedScore(parts, 2)).toBe(44)
  })

  test("shares out the core and keywords layers for a job with no requirements", () => {
    expect(blendedScore({ ...parts, core: null, keywords: null })).toBe(65)
  })

  test("counts the must-haves with no evidence at all, not those only listed", () => {
    const must = requirement("C++", 1)
    expect(missingScreening([must, must, CONCURRENCY], [proof("none"), proof("weak"), proof("none")])).toBe(1)
  })
})

describe("what the AI said, read defensively", () => {
  test("says where each requirement's evidence is, and counts one with none as missing", () => {
    expect(foundOf([proof("strong", "experience"), proof("weak", "skills"), proof("none", "projects"), proof("good", "projects")])).toEqual(
      {
        experience: 1,
        projects: 1,
        skills: 1,
        coursework: 0,
        missing: 1,
      },
    )
  })

  test("reads a tier from the older must-have flag, and anything unknown as nothing", () => {
    expect([tierOf(2), tierOf(undefined, true), tierOf(undefined, false), tierOf(7)]).toEqual([2, 1, 3, 3])
    expect([strengthOf("strong"), strengthOf("huge")]).toEqual(["strong", "none"])
    expect(placeOf("hobbies")).toBe("nowhere")
    expect([ratingOf(140), ratingOf(-5), ratingOf("90"), ratingOf(62.6)]).toEqual([100, 0, 0, 63])
  })
})

describe("resumes ranked for a job", () => {
  test("go best first, and a tie to the one edited last", () => {
    const matches = [
      { id: "a", score: 70, updatedAt: "2026-01-01T00:00:00Z" },
      { id: "b", score: 90 },
      { id: "c", score: 70, updatedAt: "2026-05-01T00:00:00Z" },
    ]
    expect(ranked(matches).map((match) => match.id)).toEqual(["b", "c", "a"])
  })
})
