import { describe, expect, test } from "vitest"
import { placeOf, ranked, scoreOf, type Requirement } from "./score"

const must = (name: string): Requirement => ({ name, must: true })
const nice = (name: string): Requirement => ({ name, must: false })

describe("a resume's score for a job", () => {
  test("is full when every requirement is in its experience", () => {
    expect(scoreOf([must("Python"), nice("SQL")], ["experience", "experience"]).score).toBe(100)
  })

  test("counts experience most, then projects, then skills, then coursework", () => {
    const one = [must("Python")]
    expect(["experience", "projects", "skills", "coursework", "nowhere"].map((place) => scoreOf(one, [placeOf(place)]).score)).toEqual([
      100, 75, 50, 25, 0,
    ])
  })

  test("counts a must-have twice what a nice to have is worth", () => {
    // Must in experience (2 of 2), nice nowhere (0 of 1): 2 of 3.
    expect(scoreOf([must("Go"), nice("Kafka")], ["experience", "nowhere"]).score).toBe(67)
    expect(scoreOf([must("Go"), nice("Kafka")], ["nowhere", "experience"]).score).toBe(33)
  })

  test("says where each requirement was found, and which are missing", () => {
    expect(scoreOf([must("Go"), must("AWS"), nice("Rust"), nice("ML")], ["experience", "skills", "nowhere", "projects"])).toEqual({
      score: 63,
      found: { experience: 1, projects: 1, skills: 1, coursework: 0, missing: 1 },
      matched: ["Go", "AWS", "ML"],
      missing: ["Rust"],
    })
  })

  test("takes a place the answer left out, or one it doesn't know, as nowhere", () => {
    expect(scoreOf([must("Go"), must("AWS")], ["experience"]).found.missing).toBe(1)
    expect(placeOf("hobbies")).toBe("nowhere")
  })

  test("is 0 for a job with no requirements", () => {
    expect(scoreOf([], []).score).toBe(0)
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
