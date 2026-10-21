"use client"

import { useEffect, useId, useMemo, useRef } from "react"
import { GAZE_MS, glideOf, pathOf, type Stop } from "./gaze"

/**
 * A recruiter's eyes on a page, over it (in a `relative` box its size): a
 * soft blue spot that stops where they go first (gazeOf) and leaves a little
 * warmth at each stop, then lets go. It starts `delay` ms after it's drawn.
 * The review page shows it while a resume is read, and the editor's preview
 * while the AI is asked.
 */
export default function GazeSpot({
  stops,
  size,
  delay,
}: {
  stops: readonly Stop[]
  size: { width: number; height: number }
  delay: number
}) {
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
    const animation = node.animate(pathOf(stops), { duration: GAZE_MS, delay, fill: "both" })
    return () => animation.cancel()
  }, [stops, delay])

  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${size.width} ${size.height}`}
      className="review-gaze pointer-events-none absolute inset-0 h-full w-full"
      style={{ animationDuration: `${GAZE_MS + 900}ms`, animationDelay: `${delay}ms` }}
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
            animationDelay: `${delay + starts[index] + glideOf(stop)}ms`,
          }}
        />
      ))}
      <ellipse ref={spot} rx={40} ry={17} fill={`url(#${id}spot)`} />
    </svg>
  )
}
