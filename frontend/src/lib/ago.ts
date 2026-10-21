const dayFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" })
const yearFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" })

/** How long ago a time was, in a few words: "Just now", "5 min ago", "Yesterday", "2 Oct"; "—" when it can't be read. */
export function ago(value: string | undefined, now = new Date()): string {
  const date = new Date(value ?? "")
  if (Number.isNaN(date.getTime())) return "—"
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1 && minutes > -5) return "Just now"
  if (minutes >= 1 && minutes < 60) return `${minutes} min ago`
  if (date.toDateString() === now.toDateString()) return `${Math.floor(minutes / 60)} hr ago`
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return (date.getFullYear() === now.getFullYear() ? dayFormat : yearFormat).format(date)
}
