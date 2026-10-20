"use client"

import { useId, useLayoutEffect, useRef, useState } from "react"

// Words written in cloud on the sky, for the review's verdict.
//
// The letters are SVG text, roughed up and lit by filters: turbulence pushes
// their edges about, a blur and a second turbulence make them lumpy, and a
// light from above shades them like cloud.

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

/** `lines` in cloud, centered. Shown to the eye only: the words belong in text next to it. */
export default function CloudWord({ lines, className }: { lines: readonly string[]; className?: string }) {
  const id = `cloud${useId().replace(/[^\w-]/g, "")}`
  const measure = useRef<SVGTextElement>(null)
  // Where the words are, which the picture is framed round.
  const [box, setBox] = useState<Measured | null>(null)
  const height = lines.length * SIZE * LEADING + 200
  // The same words can come in a new list on every render, and only new words need measuring again.
  const words = lines.join("\n")

  // The word's size is only known once its font has loaded, so it's measured again then.
  useLayoutEffect(() => {
    let live = true
    const measureNow = () => {
      if (!live || !measure.current) return
      const { x, y, width, height } = measure.current.getBBox()
      setBox({ x, y, width, height })
    }
    measureNow()
    void document.fonts.ready.then(measureNow)
    return () => {
      live = false
    }
  }, [words])

  // Each line on its own baseline.
  const text = (extra: React.SVGProps<SVGTextElement> = {}) => (
    <text
      textAnchor="middle"
      fill="#fff"
      stroke="#fff"
      strokeWidth={7}
      strokeLinejoin="round"
      style={{ fontFamily: "var(--font-serif)", fontWeight: 800, fontSize: SIZE, letterSpacing: -0.022 * SIZE }}
      {...extra}
    >
      {lines.map((line, index) => (
        <tspan key={index} x={FRAME / 2} y={height / 2 + (index - (lines.length - 1) / 2) * SIZE * LEADING + SIZE * 0.34}>
          {line}
        </tspan>
      ))}
    </text>
  )

  // Room round the words for the filters' edges.
  const viewBox = box ? `${box.x - 40} ${box.y - 50} ${box.width + 80} ${box.height + 100}` : `0 0 ${FRAME} ${height}`

  return (
    <svg viewBox={viewBox} aria-hidden="true" focusable="false" className={className} style={{ overflow: "visible" }}>
      <defs>
        <filter id={`${id}solid`} x="-25%" y="-70%" width="150%" height="240%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency={0.016} numOctaves={5} seed={3} result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale={14} xChannelSelector="R" yChannelSelector="G" result="pushed" />
          <feGaussianBlur in="pushed" stdDeviation={2.2} result="soft" />
          <feTurbulence type="fractalNoise" baseFrequency={0.06} numOctaves={4} seed={8} result="lumps" />
          <feComposite in="soft" in2="lumps" operator="arithmetic" k1={0} k2={1} k3={0.45} k4={-0.22} result="lumpy" />
          <feComponentTransfer in="lumpy" result="body">
            <feFuncA type="table" tableValues="0 0 0.2 0.85 1 1" />
          </feComponentTransfer>
          <feGaussianBlur in="body" stdDeviation={5} result="height" />
          <feDiffuseLighting in="height" surfaceScale={7} diffuseConstant={1.38} lightingColor="#ffffff" result="lit">
            <feDistantLight azimuth={-80} elevation={46} />
          </feDiffuseLighting>
          {/* Shade toward the sky's blue rather than grey. */}
          <feColorMatrix in="lit" type="matrix" values="0.4 0 0 0 0.6  0.32 0 0 0 0.69  0.12 0 0 0 0.88  0 0 0 1 0" result="tinted" />
          <feComposite in="tinted" in2="body" operator="in" />
        </filter>
        {/* A soft blue shadow under the letters, so white cloud reads on a pale sky. */}
        <filter id={`${id}shade`} x="-20%" y="-60%" width="140%" height="240%">
          <feGaussianBlur in="SourceAlpha" stdDeviation={12} />
          <feOffset dy={14} result="shadow" />
          <feFlood floodColor="#2a5ca8" floodOpacity={0.2} />
          <feComposite in2="shadow" operator="in" />
        </filter>
      </defs>
      {box && (
        <>
          <g filter={`url(#${id}shade)`}>{text()}</g>
          <g filter={`url(#${id}solid)`}>{text()}</g>
        </>
      )}
      {text({ ref: measure, visibility: "hidden" })}
    </svg>
  )
}
