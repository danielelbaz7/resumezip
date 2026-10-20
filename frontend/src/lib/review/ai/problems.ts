// Why there are no AI notes, worded for the person. Apart from askForNotes,
// which is loaded only once the AI is asked, so a page can say why without
// it: when the AI isn't asked, or when askForNotes itself couldn't load.

/** Why there are no notes: "off" when the site has no AI keys, "other" for anything unexpected. */
export type Problem = "limit" | "busy" | "off" | "lines" | "other"

export const PROBLEMS: Record<Problem, string> = {
  limit: "You’ve asked for a lot of AI notes in a short time. Try again in a few minutes.",
  busy: "The AI is busy right now. Try again in a minute.",
  off: "AI notes aren’t switched on here.",
  lines: "This resume is too long for AI notes.",
  other: "Something went wrong getting AI notes. Try again in a minute.",
}

/** When /api/review, or the code that asks it, couldn't be reached. */
export const NO_CONNECTION = "The AI notes couldn’t load. Check your connection and try again."
