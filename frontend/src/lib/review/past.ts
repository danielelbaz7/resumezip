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
// localStorage's few megabytes are the resumes'. What's read back is checked
// like anything else that's saved.

import { savedNotesOf, type SavedNote } from "./ai/saved"

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
  bytes: ArrayBuffer
  /** The checks' score out of 100, as of the last time it was opened. */
  total: number
  /** The AI's notes, kept as askForKeptNotes keeps them; null when there were none to be had (the AI was off or turned it away). */
  notes: SavedNote[] | null
  /** The resume "Fix it in the editor" made of it, which may since have been edited or deleted. */
  resumeId?: string
}

/** A past review without its file, as the list shows it. */
export type PastReviewSummary = Omit<PastReview, "bytes">

const DB = "resumezip"
const STORE = "pastReviews"
// The most recent kept. Resumes are rarely over a megabyte.
export const MOST_KEPT = 20

const isText = (value: unknown): value is string => typeof value === "string"

/** A past review as read back, or null if it isn't one. */
export function pastReviewOf(raw: unknown): PastReview | null {
  if (!raw || typeof raw !== "object") return null
  const { id, title, fileName, type, savedAt, bytes, total, notes, resumeId } = raw as Record<string, unknown>
  if (!isText(id) || !isText(title) || !isText(fileName) || !isText(type)) return null
  if (typeof savedAt !== "number" || typeof total !== "number" || !(bytes instanceof ArrayBuffer)) return null
  return {
    id,
    title,
    fileName,
    type,
    savedAt,
    bytes,
    total,
    notes: Array.isArray(notes) ? savedNotesOf(notes) : null,
    ...(isText(resumeId) && { resumeId }),
  }
}

/** Newest first, with the file left out. */
export const summariesOf = (reviews: readonly PastReview[]): PastReviewSummary[] =>
  [...reviews].sort((a, b) => b.savedAt - a.savedAt).map(({ bytes: _bytes, ...summary }) => summary)

/** The ids of those past the most kept, oldest last. */
export const overflowOf = (reviews: readonly Pick<PastReview, "id" | "savedAt">[]): string[] =>
  [...reviews]
    .sort((a, b) => b.savedAt - a.savedAt)
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
    const request = indexedDB.open(DB, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" })
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

async function readAll(): Promise<PastReview[]> {
  const db = await database()
  const raw = await done(db.transaction(STORE).objectStore(STORE).getAll())
  return raw.flatMap((item) => pastReviewOf(item) ?? [])
}

/** The past reviews kept in this browser, newest first; none if they can't be read. */
export async function pastReviews(): Promise<PastReviewSummary[]> {
  try {
    return summariesOf(await readAll())
  } catch {
    return []
  }
}

export async function pastReview(id: string): Promise<PastReview | null> {
  try {
    const db = await database()
    return pastReviewOf(await done(db.transaction(STORE).objectStore(STORE).get(id)))
  } catch {
    return null
  }
}

/**
 * Changes a past review, or keeps a new one: `change` is given what's kept
 * under `id` (null if nothing is) and returns what to keep, or null to leave
 * it. Past the most kept, the oldest go. False if it couldn't be kept (storage
 * full or refused): the review still shows, it just isn't kept.
 */
export async function keepPastReview(id: string, change: (before: PastReview | null) => PastReview | null): Promise<boolean> {
  try {
    const db = await database()
    const transaction = db.transaction(STORE, "readwrite")
    const store = transaction.objectStore(STORE)
    const before = pastReviewOf(await done(store.get(id)))
    const after = change(before)
    if (!after) {
      transaction.abort()
      return false
    }
    store.put(after)
    const all = (await done(store.getAll())).flatMap((item) => pastReviewOf(item) ?? [])
    for (const old of overflowOf(all)) store.delete(old)
    await finished(transaction)
    return true
  } catch {
    return false
  }
}

export async function deletePastReview(id: string): Promise<void> {
  try {
    const db = await database()
    const transaction = db.transaction(STORE, "readwrite")
    transaction.objectStore(STORE).delete(id)
    await finished(transaction)
  } catch {
    // Can't be reached, so there's nothing to delete that could be shown.
  }
}

export async function deleteAllPastReviews(): Promise<void> {
  try {
    const db = await database()
    const transaction = db.transaction(STORE, "readwrite")
    transaction.objectStore(STORE).clear()
    await finished(transaction)
  } catch {
    // As above.
  }
}
