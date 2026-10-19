import { expect, test } from "vitest"
import { hashOf, saveNotes, savedByHash, savedForResume, savedNotesOf, tieToResume, type SavedNote } from "./saved"

function memory(): Storage {
  const items = new Map<string, string>()
  return {
    get length() {
      return items.size
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value)),
  }
}

const NOTE: SavedNote = {
  tone: "red",
  line: "u2",
  quote: "Responsible for",
  title: "Vague",
  why: "No result.",
  suggestion: "Built [X]",
  text: "Responsible for working on backend services",
}
const LINES = [
  { id: "u1", text: "Marcus Bell", bullet: false },
  { id: "u2", text: "Responsible for working on backend services", bullet: true },
]

test("the same printed lines hash the same, and any change to them doesn't", async () => {
  const hash = await hashOf(LINES)
  expect(hash).toMatch(/^[0-9a-f]{64}$/)
  expect(await hashOf(LINES.map((line) => ({ ...line })))).toBe(hash)
  expect(await hashOf([LINES[0], { ...LINES[1], text: "Built backend services" }])).not.toBe(hash)
})

test("notes saved for a resume's lines are found by them, and by the resume they're opened as", () => {
  const storage = memory()
  saveNotes("a", [NOTE], storage, 1)
  expect(savedByHash("a", storage)?.notes).toEqual([NOTE])
  expect(savedByHash("b", storage)).toBeNull()
  expect(savedForResume("r1", storage)).toBeNull()

  tieToResume("a", "r1", storage)
  expect(savedForResume("r1", storage)?.hash).toBe("a")
  // Saving them again keeps the resume they're tied to.
  saveNotes("a", [NOTE, { ...NOTE, tone: "green" }], storage, 2)
  expect(savedForResume("r1", storage)?.notes).toHaveLength(2)
  // Another review opened as the same resume takes its place.
  saveNotes("b", [NOTE], storage, 3)
  tieToResume("b", "r1", storage)
  expect(savedForResume("r1", storage)?.hash).toBe("b")
  expect(savedByHash("a", storage)?.resumeId).toBeUndefined()
})

test("keeps the 30 most recent reviews", () => {
  const storage = memory()
  for (let review = 0; review < 35; review++) saveNotes(`h${review}`, [NOTE], storage, review)
  expect(savedByHash("h4", storage)).toBeNull()
  expect(savedByHash("h5", storage)).not.toBeNull()
  expect(savedByHash("h34", storage)).not.toBeNull()
})

test("what's saved is read with care: broken, old or edited data is left out", () => {
  const storage = memory()
  storage.setItem("resumezip.aiNotes", "{not json")
  expect(savedByHash("a", storage)).toBeNull()
  storage.setItem(
    "resumezip.aiNotes",
    JSON.stringify([{ hash: "a", savedAt: 1, notes: [NOTE, { ...NOTE, tone: "blue" }, { ...NOTE, title: 3 }, null] }, { hash: 4 }, "x"]),
  )
  expect(savedByHash("a", storage)?.notes).toEqual([NOTE])
  expect(savedNotesOf([{ ...NOTE, suggestion: undefined }])).toEqual([{ ...NOTE, suggestion: null }])
  // The answer from the AI has no line's words yet, and neither do notes kept before they were saved.
  expect(savedNotesOf([{ ...NOTE, text: undefined }])).toEqual([{ ...NOTE, text: null }])
})

test("a full or refused storage doesn't stop anything", () => {
  const full = {
    ...memory(),
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError")
    },
  } as Storage
  expect(() => saveNotes("a", [NOTE], full)).not.toThrow()
  expect(savedByHash("a", null)).toBeNull()
  expect(() => saveNotes("a", [NOTE], null)).not.toThrow()
})
