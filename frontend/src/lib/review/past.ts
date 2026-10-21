// Past reviews: each file reviewed on the review page, kept in this browser
// as it came, with the score it got and the AI's notes on it, so it can be
// opened again as it was reviewed, whatever's been done to the resume it
// became in the editor since. Nothing here leaves the browser.
//
// The file itself is kept, not what it was read as: opened again, it's
// reviewed again (lib/review/review.ts), which needs no server, and only the
// AI's notes come from here. They're a copy of the ones in saved.ts, which
// the editor replaces and a deleted resume takes with it; a past review is
// deleted on its own.
//
// In IndexedDB rather than localStorage: a PDF is hundreds of kilobytes, and
// localStorage's few megabytes are the resumes'. The files are kept apart from
// what the list shows, so listing them, or changing one's notes, doesn't read
// every file. What's read back is checked like anything else that's saved.

import { savedNotesOf, type SavedNote } from "./ai/saved"

/** A past review, without its file. */
export interface PastReview {
  /** SHA-256 of the file, as hex: the same file reviewed again is the same past review. */
  id: string
  /** The file's name without its extension, as the review names it. */
  title: string
  fileName: string
  /** The file's media type, which opening it again goes by along with its name. */
  type: string
  /** When it was last reviewed from a file dropped or chosen; opening it again doesn't change it. */
  savedAt: number
  /** The checks' score out of 100, as of the last time it was opened. */
  total: number
  /** The AI's notes, kept as askForKeptNotes keeps them; null when there were none to be had (the AI was off or turned it away). */
  notes: SavedNote[] | null
  /** The resume "Fix it in the editor" made of it, which may since have been edited or deleted. */
  resumeId?: string
}

const DB = "resumezip"
// Version 1, never released, kept each file inside its review; its store is dropped.
const VERSION = 2
const REVIEWS = "pastReviews"
/** Each review's file, by its id. */
const FILES = "pastReviewFiles"
// The most recent kept. Resumes are rarely over a megabyte.
export const MOST_KEPT = 20

const isText = (value: unknown): value is string => typeof value === "string"

/** A past review as read back, or null if it isn't one. */
export function pastReviewOf(raw: unknown): PastReview | null {
  if (!raw || typeof raw !== "object") return null
  const { id, title, fileName, type, savedAt, total, notes, resumeId } = raw as Record<string, unknown>
  if (!isText(id) || !isText(title) || !isText(fileName) || !isText(type)) return null
  if (typeof savedAt !== "number" || typeof total !== "number") return null
  return {
    id,
    title,
    fileName,
    type,
    savedAt,
    total,
    notes: Array.isArray(notes) ? savedNotesOf(notes) : null,
    ...(isText(resumeId) && { resumeId }),
  }
}

const newestFirst = <T extends { savedAt: number }>(reviews: readonly T[]): T[] => [...reviews].sort((a, b) => b.savedAt - a.savedAt)

/** The ids of those past the most kept, oldest last. */
export const overflowOf = (reviews: readonly Pick<PastReview, "id" | "savedAt">[]): string[] =>
  newestFirst(reviews)
    .slice(MOST_KEPT)
    .map(({ id }) => id)

export async function idOf(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

let opening: Promise<IDBDatabase> | null = null

// IndexedDB can be missing, refused (some private windows), or fail to open; then nothing is kept, and reviewing works as before.
function database(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") throw new Error("No IndexedDB here")
    const request = indexedDB.open(DB, VERSION)
    request.onupgradeneeded = (event) => {
      const db = request.result
      if (event.oldVersion < 2 && db.objectStoreNames.contains(REVIEWS)) db.deleteObjectStore(REVIEWS)
      db.createObjectStore(REVIEWS, { keyPath: "id" })
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES)
    }
    request.onsuccess = () => {
      // Another tab opening a newer version closes this one, to be opened again when it's next wanted.
      request.result.onversionchange = () => {
        request.result.close()
        opening = null
      }
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error("IndexedDB is blocked"))
  }).catch((error) => {
    opening = null
    throw error
  })
  return opening
}

const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })

const finished = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })

/** The past reviews kept in this browser, newest first; none if they can't be read. */
export async function pastReviews(): Promise<PastReview[]> {
  try {
    const db = await database()
    const raw = await done(db.transaction(REVIEWS).objectStore(REVIEWS).getAll())
    return newestFirst(raw.flatMap((item) => pastReviewOf(item) ?? []))
  } catch {
    return []
  }
}

/** A past review and its file, or null if it isn't kept (or can't be read). */
export async function pastReview(id: string): Promise<{ review: PastReview; bytes: ArrayBuffer } | null> {
  try {
    const db = await database()
    const transaction = db.transaction([REVIEWS, FILES])
    const [raw, bytes] = await Promise.all([done(transaction.objectStore(REVIEWS).get(id)), done(transaction.objectStore(FILES).get(id))])
    const review = pastReviewOf(raw)
    return review && bytes instanceof ArrayBuffer ? { review, bytes } : null
  } catch {
    return null
  }
}

/**
 * Changes a past review, or keeps a new one with its file (`bytes`): `change`
 * is given what's kept under `id` (null if nothing is) and returns what to
 * keep, or null to leave it. A new one needs its file. Past the most kept, the
 * oldest go. False if it couldn't be kept (storage full or refused): the
 * review still shows, it just isn't kept.
 */
export async function keepPastReview(
  id: string,
  change: (before: PastReview | null) => PastReview | null,
  bytes?: ArrayBuffer,
): Promise<boolean> {
  try {
    const db = await database()
    const transaction = db.transaction([REVIEWS, FILES], "readwrite")
    const reviews = transaction.objectStore(REVIEWS)
    const files = transaction.objectStore(FILES)
    const before = pastReviewOf(await done(reviews.get(id)))
    const after = change(before)
    if (!after || (!before && !bytes)) {
      transaction.abort()
      return false
    }
    reviews.put(after)
    if (bytes) files.put(bytes, id)
    const all = (await done(reviews.getAll())).flatMap((item) => pastReviewOf(item) ?? [])
    for (const old of overflowOf(all)) {
      reviews.delete(old)
      files.delete(old)
    }
    await finished(transaction)
    return true
  } catch {
    return false
  }
}

/** Deletes a past review and its file; false if it couldn't be, and it's still kept. */
export async function deletePastReview(id: string): Promise<boolean> {
  try {
    const db = await database()
    const transaction = db.transaction([REVIEWS, FILES], "readwrite")
    transaction.objectStore(REVIEWS).delete(id)
    transaction.objectStore(FILES).delete(id)
    await finished(transaction)
    return true
  } catch {
    return false
  }
}

/** Deletes every past review; false if they couldn't be, and they're still kept. */
export async function deleteAllPastReviews(): Promise<boolean> {
  try {
    const db = await database()
    const transaction = db.transaction([REVIEWS, FILES], "readwrite")
    transaction.objectStore(REVIEWS).clear()
    transaction.objectStore(FILES).clear()
    await finished(transaction)
    return true
  } catch {
    return false
  }
}
