"use client"

import { useEffect, useId, useRef, useState } from "react"
import { rimMap } from "./lens"

interface LiquidLensProps {
  /** How far in from the rim the glass bends, in pixels. */
  bevel?: number
  /** How strongly it bends: 1 bends as far as it can without folding what's under it back. */
  strength?: number
}

// Only Chromium bends a backdrop through an SVG filter: WebKit drops a
// backdrop-filter with url() in it altogether. Chromium is also the only
// engine with navigator.userAgentData, which tells it apart, so the others
// don't draw maps they can't use. They keep the frosted glass.
const bends = () => "userAgentData" in navigator

// How long a pane's size has to stay put before its map is drawn again. While
// it's being resized, the last map stays, a little off, rather than redrawing
// every frame.
const SETTLE_MS = 150

/**
 * The bend of liquid glass, in a .glass pane (styles/glass.css): a layer
 * under its frost whose backdrop-filter runs what's behind the pane through a
 * displacement map drawn for the pane's size and corners (lens.ts), so its rim
 * bends what's under it. Elsewhere than Chromium it's an empty layer.
 */
export default function LiquidLens({ bevel = 24, strength = 1 }: LiquidLensProps) {
  const layer = useRef<HTMLSpanElement>(null)
  // A url() reference, so only letters and digits.
  const id = `lens-${useId().replace(/[^a-z0-9]/gi, "")}`
  const [map, setMap] = useState<{ href: string; scale: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const element = layer.current
    if (!element || !bends()) return
    let drawn = ""
    let timer: ReturnType<typeof setTimeout> | undefined
    const draw = () => {
      const width = element.offsetWidth
      const height = element.offsetHeight
      const radius = parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0
      const size = `${width} ${height} ${radius}`
      if (size === drawn || width < 2 || height < 2) return
      drawn = size
      const next = rimMap(width, height, radius, bevel, strength)
      setMap(next && { ...next, width, height })
    }
    draw()
    const observer = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(draw, SETTLE_MS)
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [bevel, strength])

  return (
    <span ref={layer} aria-hidden="true" className="liquid-lens" style={map ? { backdropFilter: `url(#${id})` } : undefined}>
      {map && (
        <svg width="0" height="0" className="absolute">
          <filter id={id} x="0" y="0" width={map.width} height={map.height} filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            <feImage href={map.href} x="0" y="0" width={map.width} height={map.height} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={map.scale} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
      )}
    </span>
  )
}
