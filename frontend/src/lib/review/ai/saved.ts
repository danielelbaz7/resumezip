// AI notes are kept in this browser, never on a server: the site doesn't
// store resumes, and the notes quote them. Reviewing the same resume again
// shows the notes it got before instead of asking the AI again, and a
// resume opened in the editor from the review finds its notes by its id.
//
// Kept by a hash of the printed lines that were sent, so the same resume
// (as printed) finds them whatever its file is called. What's read back is
// checked like anything else that's saved: it may be from an older version,
// or edited by hand.

import type { SentLine } from "./request"

/** A note as the AI wrote it, before it's placed on a line (notesOf). */
export interface SavedNote {
  tone: "red" | "green"
  line: string
  quote: string
  title: string
  why: string
  suggestion: string | null
  /**
   * The words of the line it was marked on when it was kept (keptNotesOf),
   * which find it again once line ids have moved; null if it wasn't on one.
   */
  text: string | null
}

export interface SavedReview {
  /** SHA-256 of the lines sent, as hex. */
  hash: string
  /** The resume the review was opened in the editor as, once it was. */
  resumeId?: string
  savedAt: number
  notes: SavedNote[]
}

const KEY = "resumezip.aiNotes"
// The most recent reviews kept. Each is a few kilobytes.
const MOST_SAVED = 30

/** The lines' hash, which the notes are kept by. */
export async function hashOf(lines: readonly SentLine[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(lines.map(({ id, text, bullet }) => [id, text, bullet])))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

const isText = (value: unknown): value is string => typeof value === "string"

/** The notes in an answer, or in what was saved, that have the fields a note needs. */
export function savedNotesOf(raw: unknown): SavedNote[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item): SavedNote[] => {
    if (!item || typeof item !== "object") return []
    const { tone, line, quote, title, why, suggestion, text } = item as Record<string, unknown>
    if ((tone !== "red" && tone !== "green") || !isText(line) || !isText(quote) || !isText(title) || !isText(why)) return []
    return [{ tone, line, quote, title, why, suggestion: isText(suggestion) ? suggestion : null, text: isText(text) ? text : null }]
  })
}

function readAll(storage: Storage): SavedReview[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(storage.getItem(KEY) ?? "[]")
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((item): SavedReview[] => {
    if (!item || typeof item !== "object") return []
    const { hash, resumeId, savedAt, notes } = item as Record<string, unknown>
    if (!isText(hash) || typeof savedAt !== "number") return []
    return [{ hash, ...(isText(resumeId) && { resumeId }), savedAt, notes: savedNotesOf(notes) }]
  })
}

function writeAll(storage: Storage, reviews: SavedReview[]) {
  const kept = [...reviews].sort((a, b) => b.savedAt - a.savedAt).slice(0, MOST_SAVED)
  try {
    storage.setItem(KEY, JSON.stringify(kept))
  } catch {
    // Storage is full or turned off: the notes still show, and are asked for again next time.
  }
}

// Storage can be missing (a private window that refuses it) or throw when touched.
function storageOf(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

/** The notes saved for these lines, if they were reviewed in this browser before. */
export function savedByHash(hash: string, storage = storageOf()): SavedReview | null {
  return (storage && readAll(storage).find((review) => review.hash === hash)) || null
}

/** The notes saved for a resume opened in the editor from the review. */
export function savedForResume(resumeId: string, storage = storageOf()): SavedReview | null {
  if (!storage) return null
  return readAll(storage).find((review) => review.resumeId === resumeId) ?? null
}

export function saveNotes(hash: string, notes: SavedNote[], storage = storageOf(), now = Date.now()) {
  if (!storage) return
  const others = readAll(storage).filter((review) => review.hash !== hash)
  const before = readAll(storage).find((review) => review.hash === hash)
  writeAll(storage, [...others, { hash, ...(before?.resumeId && { resumeId: before.resumeId }), savedAt: now, notes }])
}

/** Ties the notes for these lines to the resume they were opened in the editor as. */
export function tieToResume(hash: string, resumeId: string, storage = storageOf()) {
  if (!storage) return
  const reviews = readAll(storage)
  if (!reviews.some((review) => review.hash === hash)) return
  // A resume has one review's notes: one reviewed before under this id lets go of it.
  writeAll(
    storage,
    reviews.map(({ resumeId: tied, ...review }) =>
      review.hash === hash ? { ...review, resumeId } : { ...review, ...(tied && tied !== resumeId && { resumeId: tied }) },
    ),
  )
}
