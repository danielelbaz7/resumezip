// The bend of liquid glass (LiquidLens.tsx): a displacement map for the SVG
// filter a pane's backdrop runs through. Near its rim, what's under the pane
// is drawn from a little further in, as through the edge of a drop of water;
// its middle is left as it is.

/**
 * How far each pixel of a `width` × `height` pane, with corners of `radius`,
 * shows what's under it from, across (`dx`) and down (`dy`), in pixels, and
 * the most any pixel moves. Only the band `bevel` pixels in from the rim
 * bends. A pixel `u` of the way into it shows what's `strength` × (√u − u)
 * of the band further in: most near the rim, nothing at the band's inner
 * edge, and never far enough to fold what's under it back on itself.
 */
export function rimShift(width: number, height: number, radius: number, bevel: number, strength = 1) {
  const corner = Math.min(radius, width / 2, height / 2)
  // How far a pixel's centre is outside the pane's edge: negative inside it.
  const edge = (x: number, y: number) => {
    const across = Math.abs(x + 0.5 - width / 2) - (width / 2 - corner)
    const down = Math.abs(y + 0.5 - height / 2) - (height / 2 - corner)
    return Math.hypot(Math.max(across, 0), Math.max(down, 0)) + Math.min(Math.max(across, down), 0) - corner
  }
  const dx = new Float32Array(width * height)
  const dy = new Float32Array(width * height)
  let most = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const outside = edge(x, y)
      if (outside > 0) continue
      const u = Math.min(-outside / bevel, 1)
      const shift = bevel * strength * (Math.sqrt(u) - u)
      if (shift <= 0) continue
      // Inward is down the slope of the distance to the edge.
      const slopeX = edge(x + 1, y) - edge(x - 1, y)
      const slopeY = edge(x, y + 1) - edge(x, y - 1)
      const length = Math.hypot(slopeX, slopeY) || 1
      dx[y * width + x] = (-slopeX / length) * shift
      dy[y * width + x] = (-slopeY / length) * shift
      most = Math.max(most, shift)
    }
  }
  return { dx, dy, most }
}

/**
 * The map as a picture for the filter's feImage, red for across and green
 * for down (128 is no move), and the scale feDisplacementMap needs to undo
 * that: it moves a pixel by scale × (channel − ½). Null where nothing bends,
 * or there's no canvas to draw on.
 */
export function rimMap(width: number, height: number, radius: number, bevel: number, strength = 1): { href: string; scale: number } | null {
  const { dx, dy, most } = rimShift(width, height, radius, bevel, strength)
  if (most === 0) return null
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) return null
  const image = context.createImageData(width, height)
  for (let i = 0; i < width * height; i++) {
    image.data[i * 4] = Math.round(128 + (dx[i] / most) * 127)
    image.data[i * 4 + 1] = Math.round(128 + (dy[i] / most) * 127)
    image.data[i * 4 + 2] = 128
    image.data[i * 4 + 3] = 255
  }
  context.putImageData(image, 0, 0)
  return { href: canvas.toDataURL("image/png"), scale: 2 * most }
}
