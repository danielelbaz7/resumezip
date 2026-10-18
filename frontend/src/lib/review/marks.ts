// Where each finding is printed, so the review page can mark it on the page:
// a bullet on the lines the PDF prints it on (printedLayoutBullets), a role's
// bullets as a whole on all of theirs, and anything else on the first line
// that holds its text. A finding about a whole entry or section, or the PDF
// itself, has no line of its own, so it isn't marked; the notes still list it.

import type { Finding, PdfReading } from "@/lib/check/engine"
import { comparable, printedLayoutBullets } from "@/lib/check/pdf"
import { placeId } from "@/lib/check/places"
import type { ResumeView } from "@/lib/check/resume"
import type { Line } from "@/lib/import/lines"

/** Where a finding is printed: its page (from 1), and its lines' boxes there, in PDF points from the page's top-left. */
export interface Mark {
  page: number
  boxes: [number, number, number, number][]
}

// Shorter text is too likely to be found on a line it isn't about.
const LEAST_TEXT = 4

/** Each finding's mark, in the findings' order; null where it isn't on a line of its own. */
export function marksOf(view: ResumeView, findings: readonly Finding[], pdf: PdfReading | null): (Mark | null)[] {
  if (!pdf) return findings.map(() => null)
  const printedBullets = printedLayoutBullets(view, pdf)
  const bullets = new Map(printedBullets.map(({ place, printed }) => [placeId(place), printed.lines]))
  // A field of bullets as a whole, as "this role's bullets": all of its bullets' lines.
  const fields = new Map<string, Line[]>()
  for (const { place, printed } of printedBullets) {
    if (place.kind !== "entry") continue
    const field = placeId({ ...place, line: undefined })
    fields.set(field, [...(fields.get(field) ?? []), ...printed.lines])
  }
  const lines = pdf.lines.map((line) => ({ line, text: comparable(line.text) }))
  return findings.map((finding) => {
    const printed =
      bullets.get(placeId(finding.place)) ??
      fields.get(placeId(finding.place)) ??
      (comparable(finding.text).length >= LEAST_TEXT
        ? lines
            .filter(({ text }) => text.includes(comparable(finding.text)))
            .slice(0, 1)
            .map(({ line }) => line)
        : [])
    // A bullet split over two pages is marked where it starts.
    const page = printed[0]?.page
    const boxes = printed.flatMap((line) => (line.page === page && line.box ? [line.box] : []))
    return page !== undefined && boxes.length > 0 ? { page, boxes } : null
  })
}
