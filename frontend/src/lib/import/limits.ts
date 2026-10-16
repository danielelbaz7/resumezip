// How much "Open a file" reads before it gives up. Each is far beyond any real
// resume (most are a page or two, under 10,000 characters), so they only stop
// files that aren't resumes, or that would keep the browser busy for minutes.

/** The file itself. */
export const MAX_BYTES = 20 * 1024 * 1024
/** Pages in a PDF, checked before any of them is read. */
export const MAX_PAGES = 20
/** Text, checked as it's read: a PDF's as each piece arrives, a Word file's once it's converted. */
export const MAX_CHARACTERS = 200_000
export const MAX_LINES = 5_000
/**
 * Paragraphs put in a Word file's table cells, checked as its tables are read.
 * One in a table in a table is put in each cell around it in turn, so a few
 * thousand nested hundreds of tables deep would take minutes; this is room for
 * `MAX_LINES` of them ten tables deep, where a resume's tables nest two or three.
 */
export const MAX_CELL_PARAGRAPHS = MAX_LINES * 10
/**
 * A Word file once unzipped, pictures and all, checked as it's unzipped, since
 * a small file can unzip to a lot. Pictures barely shrink in a zip, so this is
 * room for a file of `MAX_BYTES` of them and 10 MB of text.
 */
export const MAX_UNZIPPED_BYTES = MAX_BYTES + 10 * 1024 * 1024
/** Reading a file from start to finish, downloads included. */
export const TIME_LIMIT_MS = 60_000

/** A file with more text than the limits above allow. */
export class TooMuchTextError extends Error {}
