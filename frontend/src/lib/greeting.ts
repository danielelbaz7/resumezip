// The dashboard's greeting: the time of day by the visitor's own clock, and
// the first name on the resume they edited last, read from this browser.

/** "Good morning" from 5am, "Good afternoon" from noon, and "Good evening" from 6pm until then. */
export function timeOfDay(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning"
  if (hour >= 12 && hour < 18) return "Good afternoon"
  return "Good evening"
}

// Titles written before a name, which aren't what anyone's called: "Dr. Ada Lovelace" is Ada.
const TITLES = new Set(["dr", "mr", "mrs", "ms", "mx", "miss", "prof", "sir", "dame"])

/** The first name in a full name, as "Marcus" in "Marcus Bell", or "" when there isn't one. Saved data, so anything can come in. */
export function firstName(fullName: unknown): string {
  if (typeof fullName !== "string") return ""
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  const first = words.find((word) => !TITLES.has(word.replace(/\.$/, "").toLowerCase())) ?? ""
  return first.replace(/[,;:]+$/, "")
}
