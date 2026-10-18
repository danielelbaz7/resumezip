"use client"

import { useId, useLayoutEffect, useRef, useState } from "react"
import { seeded } from "./rough"

// Words written in cloud on the sky, for the review's verdict. How much of
// the word blows away is the verdict too: none of a resume that's ready, the
// end of one that's almost there, and half of one that's back to drafts.
//
// The letters are SVG text, roughed up and lit by filters: turbulence pushes
// their edges about, a blur and a second turbulence make them lumpy, and a
// light from above shades them like cloud. Past `fadeAt` of the word's width
// the solid letters fade and a looser copy, wisps and puffs drift right.

// The letters are drawn at this size, and the SVG is scaled to fit.
const SIZE = 150
const LEADING = 0.98
// Wide enough for any verdict on a line.
const FRAME = 2000

interface Measured {
  x: number
  y: number
  width: number
  height: number
}

function cloudFilter(id: string, displace: number, blur: number, frequency: number, alpha: string, seed: number) {
  return (
    <filter id={id} x="-25%" y="-70%" width="150%" height="240%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency={frequency} numOctaves={5} seed={seed} result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale={displace} xChannelSelector="R" yChannelSelector="G" result="pushed" />
      <feGaussianBlur in="pushed" stdDeviation={blur} result="soft" />
      <feTurbulence type="fractalNoise" baseFrequency={0.06} numOctaves={4} seed={seed + 5} result="lumps" />
      <feComposite in="soft" in2="lumps" operator="arithmetic" k1={0} k2={1} k3={0.45} k4={-0.22} result="lumpy" />
      <feComponentTransfer in="lumpy" result="body">
        <feFuncA type="table" tableValues={alpha} />
      </feComponentTransfer>
      <feGaussianBlur in="body" stdDeviation={5} result="height" />
      <feDiffuseLighting in="height" surfaceScale={7} diffuseConstant={1.38} lightingColor="#ffffff" result="lit">
        <feDistantLight azimuth={-80} elevation={46} />
      </feDiffuseLighting>
      {/* Shade toward the sky's blue rather than grey. */}
      <feColorMatrix in="lit" type="matrix" values="0.4 0 0 0 0.6  0.32 0 0 0 0.69  0.12 0 0 0 0.88  0 0 0 1 0" result="tinted" />
      <feComposite in="tinted" in2="body" operator="in" />
    </filter>
  )
}

/**
 * `lines` in cloud, centered. `drift`, from 0 to 1, is how much of the end
 * of the last line blows away. Shown to the eye only: the words belong in
 * text next to it.
 */
export default function CloudWord({
  lines,
  drift,
  seed = 3,
  className,
}: {
  lines: readonly string[]
  drift: number
  seed?: number
  className?: string
}) {
  const id = `cloud${useId().replace(/[^\w-]/g, "")}`
  const measureAll = useRef<SVGTextElement>(null)
  const measureLast = useRef<SVGTextElement>(null)
  // Where all the words are, and where the last line is, which is the one that drifts.
  const [box, setBox] = useState<{ all: Measured; last: Measured } | null>(null)
  const height = lines.length * SIZE * LEADING + 200

  // The word's size is only known once its font has loaded, so it's measured again then.
  useLayoutEffect(() => {
    let live = true
    const measureNow = () => {
      if (!live || !measureAll.current || !measureLast.current) return
      const of = (text: SVGTextElement) => {
        const { x, y, width, height } = text.getBBox()
        return { x, y, width, height }
      }
      setBox({ all: of(measureAll.current), last: of(measureLast.current) })
    }
    measureNow()
    void document.fonts.ready.then(measureNow)
    return () => {
      live = false
    }
  }, [lines])

  // Lines `first` to `end` (all of them unless given), each on its own baseline.
  const text = (first = 0, end = lines.length, extra: React.SVGProps<SVGTextElement> = {}) => (
    <text
      textAnchor="middle"
      fill="#fff"
      stroke="#fff"
      strokeWidth={7}
      strokeLinejoin="round"
      style={{ fontFamily: "var(--font-serif)", fontWeight: 800, fontSize: SIZE, letterSpacing: -0.022 * SIZE }}
      {...extra}
    >
      {lines.map((line, index) =>
        index < first || index >= end ? null : (
          <tspan key={index} x={FRAME / 2} y={height / 2 + (index - (lines.length - 1) / 2) * SIZE * LEADING + SIZE * 0.34}>
            {line}
          </tspan>
        ),
      )}
    </text>
  )
  const lastLine = lines.length - 1

  // Where the last line starts fading and ends, and what drifts off past it.
  const fadeAt = 1 - 0.3 * drift
  const last = box?.last
  const from = last ? last.x + last.width * fadeAt : 0
  const to = last ? last.x + last.width * 1.02 : 0
  const random = seeded(seed * 9301 + 7)
  const right = Math.min(FRAME - 12, to + 130 * drift)
  const wisps =
    last && drift > 0
      ? Array.from({ length: Math.round(8 * drift) }, () => {
          const f = random()
          const x = from + (to - from) * 0.25 + (right - from - (to - from) * 0.25) * f
          const y = last.y + last.height * (0.25 + random() * 0.6) - f * 24
          return { x, y, rx: 28 + random() * 60, ry: 4 + random() * 7, opacity: 0.35 + random() * 0.4, tilt: -4 - random() * 10 }
        })
      : []
  const puffs =
    last && drift > 0
      ? Array.from({ length: Math.round(10 * drift) }, () => {
          const f = random()
          const x = from + (to - from) * 0.45 + (right - from - (to - from) * 0.45) * f
          const y = last.y + last.height * (0.3 + random() * 0.5) - f * 30
          return { x, y, r: (5 + random() * 11) * (1 - f * 0.5), opacity: 0.95 - f * 0.4 }
        })
      : []
  // Room round the word for the filters' edges and what drifts off it, as much on the left, so it stays centered.
  const pad = 40 + 140 * drift
  const all = box?.all
  const viewBox = all ? `${all.x - pad} ${all.y - 50} ${all.width + 2 * pad} ${all.height + 100}` : `0 0 ${FRAME} ${height}`

  return (
    <svg viewBox={viewBox} aria-hidden="true" focusable="false" className={className} style={{ overflow: "visible" }}>
      <defs>
        {cloudFilter(`${id}solid`, 14, 2.2, 0.016, "0 0 0.2 0.85 1 1", seed)}
        {cloudFilter(`${id}loose`, 46, 6, 0.011, "0 0.04 0.3 0.75 0.9", seed + 2)}
        {cloudFilter(`${id}puff`, 8, 2.4, 0.04, "0 0 0.35 0.9 1", seed + 4)}
        <filter id={`${id}wisp`} x="-50%" y="-300%" width="200%" height="700%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02 0.06" numOctaves={3} seed={seed} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={26} xChannelSelector="R" yChannelSelector="G" />
          <feGaussianBlur stdDeviation={5} />
        </filter>
        {/* A soft blue shadow under the letters, so white cloud reads on a pale sky. */}
        <filter id={`${id}shade`} x="-20%" y="-60%" width="140%" height="240%">
          <feGaussianBlur in="SourceAlpha" stdDeviation={12} />
          <feOffset dy={14} result="shadow" />
          <feFlood floodColor="#2a5ca8" floodOpacity={0.2} />
          <feComposite in2="shadow" operator="in" />
        </filter>
        <linearGradient id={`${id}keep`} gradientUnits="userSpaceOnUse" x1={from} x2={to} y1={0} y2={0}>
          <stop offset={0} stopColor="#fff" />
          <stop offset={0.6} stopColor="#fff" stopOpacity={1 - 0.65 * drift} />
          <stop offset={1} stopColor="#fff" stopOpacity={1 - drift} />
        </linearGradient>
        <linearGradient id={`${id}go`} gradientUnits="userSpaceOnUse" x1={from} x2={to} y1={0} y2={0}>
          <stop offset={0} stopColor="#fff" stopOpacity={0} />
          <stop offset={0.45} stopColor="#fff" stopOpacity={0.9 * drift} />
          <stop offset={1} stopColor="#fff" stopOpacity={0.3 * drift} />
        </linearGradient>
        <mask id={`${id}keepMask`} maskUnits="userSpaceOnUse" x={0} y={0} width={FRAME} height={height}>
          <rect width={FRAME} height={height} fill={`url(#${id}keep)`} />
        </mask>
        <mask id={`${id}goMask`} maskUnits="userSpaceOnUse" x={0} y={0} width={FRAME} height={height}>
          <rect width={FRAME} height={height} fill={`url(#${id}go)`} />
        </mask>
      </defs>
      {box && (
        <>
          <g filter={`url(#${id}shade)`}>{text(0, drift > 0 ? lastLine : lines.length)}</g>
          <g filter={`url(#${id}solid)`}>{text(0, drift > 0 ? lastLine : lines.length)}</g>
          {drift > 0 && (
            <>
              <g mask={`url(#${id}keepMask)`}>
                <g filter={`url(#${id}shade)`}>{text(lastLine)}</g>
                <g filter={`url(#${id}solid)`}>{text(lastLine)}</g>
              </g>
              <g mask={`url(#${id}goMask)`}>
                <g transform="translate(14 -5)" filter={`url(#${id}loose)`}>
                  {text(lastLine)}
                </g>
              </g>
              <g filter={`url(#${id}wisp)`}>
                {wisps.map(({ x, y, rx, ry, opacity, tilt }, index) => (
                  <ellipse
                    key={index}
                    cx={x}
                    cy={y}
                    rx={rx}
                    ry={ry}
                    fill="#fff"
                    opacity={opacity}
                    transform={`rotate(${tilt} ${x} ${y})`}
                  />
                ))}
              </g>
              <g filter={`url(#${id}puff)`}>
                {puffs.map(({ x, y, r, opacity }, index) => (
                  <circle key={index} cx={x} cy={y} r={r} fill="#fff" opacity={opacity} />
                ))}
              </g>
            </>
          )}
        </>
      )}
      {text(0, lines.length, { ref: measureAll, visibility: "hidden" })}
      {text(lastLine, lines.length, { ref: measureLast, visibility: "hidden" })}
    </svg>
  )
}
