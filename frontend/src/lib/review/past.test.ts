import { expect, test } from "vitest"
import { MOST_KEPT, idOf, overflowOf, pastReviewOf, summariesOf, type PastReview } from "./past"

const REVIEW: PastReview = {
  id: "abc",
  title: "Mara Lin",
  fileName: "Mara Lin.pdf",
  type: "application/pdf",
  savedAt: 1_000,
  bytes: new Uint8Array([37, 80, 68, 70]).buffer,
  total: 74,
  notes: [
    { tone: "red", line: "u2", quote: "Responsible for", title: "Vague", why: "No result.", suggestion: null, text: "Responsible for it" },
  ],
  resumeId: "r1",
}

test("a past review read back keeps what it should, and what isn't one is left", () => {
  expect(pastReviewOf(REVIEW)).toEqual(REVIEW)
  // Notes without the fields a note needs are dropped; notes that aren't a list are none to be had.
  expect(pastReviewOf({ ...REVIEW, notes: [{ tone: "blue" }, ...REVIEW.notes!] })?.notes).toEqual(REVIEW.notes)
  expect(pastReviewOf({ ...REVIEW, notes: null })?.notes).toBeNull()
  expect(pastReviewOf({ ...REVIEW, notes: "lots" })?.notes).toBeNull()
  expect(pastReviewOf({ ...REVIEW, resumeId: 7 })).not.toHaveProperty("resumeId")
  // The file must be there to open it again.
  expect(pastReviewOf({ ...REVIEW, bytes: "JVBERg==" })).toBeNull()
  expect(pastReviewOf({ ...REVIEW, total: "74" })).toBeNull()
  expect(pastReviewOf({ ...REVIEW, id: undefined })).toBeNull()
  expect(pastReviewOf(null)).toBeNull()
  expect(pastReviewOf("review")).toBeNull()
})

test("the list is newest first, without the files", () => {
  const older = { ...REVIEW, id: "old", savedAt: 500 }
  const newer = { ...REVIEW, id: "new", savedAt: 2_000 }
  const list = summariesOf([older, newer, REVIEW])
  expect(list.map(({ id }) => id)).toEqual(["new", "abc", "old"])
  expect(list[0]).not.toHaveProperty("bytes")
})

test("past the most kept, the oldest go", () => {
  const reviews = Array.from({ length: MOST_KEPT + 2 }, (_, index) => ({ id: `r${index}`, savedAt: index }))
  expect(overflowOf(reviews)).toEqual(["r1", "r0"])
  expect(overflowOf(reviews.slice(0, MOST_KEPT))).toEqual([])
})

test("the same file has the same id, whatever it's called", async () => {
  const id = await idOf(new TextEncoder().encode("%PDF-1.7 Mara Lin").buffer)
  expect(id).toMatch(/^[0-9a-f]{64}$/)
  expect(await idOf(new TextEncoder().encode("%PDF-1.7 Mara Lin").buffer)).toBe(id)
  expect(await idOf(new TextEncoder().encode("%PDF-1.7 Mara Lim").buffer)).not.toBe(id)
})
