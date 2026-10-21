"use client"

import type { DrawnPage } from "./drawPages"
import GazeSpot from "./GazeSpot"
import type { Stop } from "./gaze"
import { circle, highlight, underline, type Box } from "./rough"

// The sample resume on the first screen (Jake's template's picture), and
// where its marks go, in the picture's pixels.
const SAMPLE = { src: "/previews/jakes-resume-template.webp", width: 1280, height: 1656 }
const SAMPLE_MARKS: { kind: "circle" | "highlight" | "underline"; box: Box }[] = [
  { kind: "circle", box: [84, 222, 348, 248] },
  { kind: "highlight", box: [742, 517, 1005, 542] },
  { kind: "underline", box: [145, 549, 1092, 570] },
  { kind: "circle", box: [145, 679, 334, 702] },
]

// The fog's bands: how much each blurs, and where it fades in, in % of the fog's height. Each masked
// backdrop blur is redrawn whenever what's under it moves (scrolling, the scan, the eyes): six bands
// dropped Chrome to ~47fps on a Retina screen, two keep it at 60 and look much the same.
const FOG = [
  { blur: 2.5, from: 0, to: 30 },
  { blur: 14, from: 26, to: 70 },
]

/** How long after their page shows the eyes start on it, in ms: once it has faded in over the sample. */
export const GAZE_DELAY = 400
/** The page's corners where it's being read (`.review-sheet > *` in review.css), which it flies from. */
export const SHEET_RADIUS = 30

/**
 * The page on the first screen, going soft into the fog the words stand on:
 * the sample, marked, until page 1 of the resume being reviewed is drawn and
 * takes its place. `pageRef` is that page, which the result's first page flies from.
 */
export default function Backdrop({
  scanning,
  page = null,
  gaze = null,
  pageRef,
}: {
  scanning: boolean
  /** The resume being reviewed, page 1, once it's drawn. */
  page?: DrawnPage | null
  /** Where the eyes go on it; none with less motion. */
  gaze?: readonly Stop[] | null
  pageRef?: React.Ref<HTMLDivElement>
}) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="review-sheet review-fading absolute left-1/2 top-0 w-[var(--sheet)] -translate-x-1/2">
        <div ref={pageRef} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- decoration at a fixed size, which next/image would only resize */}
          <img
            src={SAMPLE.src}
            alt=""
            width={SAMPLE.width}
            height={SAMPLE.height}
            className={page ? "review-gone absolute inset-x-0 top-0 h-auto w-full" : "block h-auto w-full"}
          />
          <svg
            viewBox={`0 0 ${SAMPLE.width} ${SAMPLE.height}`}
            className={`absolute inset-0 h-full w-full overflow-visible ${page ? "review-gone" : ""}`}
          >
            {SAMPLE_MARKS.map(({ kind, box }, index) =>
              kind === "highlight" ? (
                <path key={index} d={highlight(box, index + 5)} fill="rgb(168 185 242 / 0.55)" style={{ mixBlendMode: "multiply" }} />
              ) : (
                <path
                  key={index}
                  d={kind === "circle" ? circle(box, index + 5, 8) : underline(box, index + 5, 2)}
                  fill="none"
                  stroke="#2e5be6"
                  strokeWidth={4.5}
                  strokeLinecap="round"
                  opacity={0.88}
                />
              ),
            )}
          </svg>
          {page && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- a picture drawn in the browser, which next/image can't optimize */}
              <img src={page.url} alt="" className="review-theirs relative block h-auto w-full" />
              {gaze && gaze.length > 0 && <GazeSpot stops={gaze} size={page} delay={GAZE_DELAY} />}
            </>
          )}
          {scanning && <div className="review-scan" />}
        </div>
      </div>
      <div className="review-fog top-[calc(var(--sheet)*0.22)] bottom-0">
        {FOG.map(({ blur, from, to }) => (
          <span key={blur} style={{ "--blur": `${blur}px`, "--from": `${from}%`, "--to": `${to}%` } as React.CSSProperties} />
        ))}
      </div>
    </div>
  )
}
