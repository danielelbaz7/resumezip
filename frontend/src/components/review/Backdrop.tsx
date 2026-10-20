"use client"

import { useEffect, useId, useMemo, useRef } from "react"
import type { DrawnPage } from "./drawPages"
import { GAZE_MS, glideOf, pathOf, type Stop } from "./gaze"
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

/** How long after their page shows the eyes start on it, in ms: once it has faded in over the sample. */
export const GAZE_DELAY = 400
/** The page's corners where it's being read (`.review-sheet > *` in review.css), which it flies from. */
export const SHEET_RADIUS = 30

/**
 * A recruiter's eyes on the page: a soft blue spot that stops where they go
 * first (gazeOf) and leaves a little warmth at each stop, then lets go.
 */
function Gaze({ stops, size }: { stops: readonly Stop[]; size: { width: number; height: number } }) {
  const id = `gaze${useId().replace(/[^\w-]/g, "")}`
  const spot = useRef<SVGEllipseElement>(null)
  // When the eyes reach each stop, in ms from the start.
  const starts = useMemo(() => {
    let at = 0
    return stops.map(({ ms }) => {
      const start = at
      at += ms
      return start
    })
  }, [stops])

  // Held at each stop, then a quick glide to the next, as eyes move.
  useEffect(() => {
    const node = spot.current
    if (!node) return
    const animation = node.animate(pathOf(stops), { duration: GAZE_MS, delay: GAZE_DELAY, fill: "both" })
    return () => animation.cancel()
  }, [stops])

  return (
    <svg
      viewBox={`0 0 ${size.width} ${size.height}`}
      className="review-gaze absolute inset-0 h-full w-full"
      style={{ animationDuration: `${GAZE_MS + 900}ms`, animationDelay: `${GAZE_DELAY}ms` }}
    >
      <defs>
        <radialGradient id={`${id}heat`}>
          <stop offset="0" stopColor="#2e5be6" stopOpacity={0.5} />
          <stop offset="1" stopColor="#2e5be6" stopOpacity={0} />
        </radialGradient>
        <radialGradient id={`${id}spot`}>
          <stop offset="0" stopColor="#2e5be6" stopOpacity={0.55} />
          <stop offset="0.55" stopColor="#5a85ff" stopOpacity={0.22} />
          <stop offset="1" stopColor="#5a85ff" stopOpacity={0} />
        </radialGradient>
      </defs>
      {stops.map((stop, index) => (
        <ellipse
          key={index}
          cx={stop.x}
          cy={stop.y}
          rx={52}
          ry={20}
          fill={`url(#${id}heat)`}
          opacity={0.8}
          className="review-heat"
          style={{
            animationDuration: `${Math.max(1, stop.ms - glideOf(stop))}ms`,
            animationDelay: `${GAZE_DELAY + starts[index] + glideOf(stop)}ms`,
          }}
        />
      ))}
      <ellipse ref={spot} rx={40} ry={17} fill={`url(#${id}spot)`} />
    </svg>
  )
}

/**
 * The page on the first screen, going soft into the fog the words stand on:
 * the sample, marked, until the resume being reviewed is printed and takes
 * its place. `pageRef` is that page, which the result's first page flies from.
 */
export default function Backdrop({
  scanning,
  page = null,
  gaze = null,
  pageRef,
}: {
  scanning: boolean
  /** The resume being reviewed, page 1, once it's printed. */
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
              {gaze && gaze.length > 0 && <Gaze stops={gaze} size={page} />}
            </>
          )}
          {scanning && <div className="review-scan" />}
        </div>
      </div>
      <div className="review-fog top-[calc(var(--sheet)*0.22)] bottom-0">
        {[0.6, 1.2, 2.4, 4.8, 9.6, 19.2].map((blur, index) => (
          <span
            key={blur}
            style={{ "--blur": `${blur}px`, "--from": `${index * 12}%`, "--to": `${index * 12 + 14}%` } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}
