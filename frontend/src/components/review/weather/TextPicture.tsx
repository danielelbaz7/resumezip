import type { Picture } from "./pictures"

// Each color of a picture is one layer of the whole grid, blank but for its own
// glyphs, and the layers are laid on each other: a few text nodes, not a span a glyph.
const layersOf = ({ palette, glyphs, inks }: Picture) =>
  palette.map((color, ink) => ({
    color,
    text: glyphs.map((row, r) => row.replace(/./g, (glyph, c) => (inks[r][c] === String(ink) ? glyph : " "))).join("\n"),
  }))
const LAYERS = new Map<Picture, ReturnType<typeof layersOf>>()

/** A picture in text, its layers stacked in one grid cell: `className` sets the glyphs' size, as review.css and editor.css do. */
export default function TextPicture({ picture, className }: { picture: Picture; className: string }) {
  let layers = LAYERS.get(picture)
  if (!layers) LAYERS.set(picture, (layers = layersOf(picture)))
  return (
    <span className={className} aria-hidden="true">
      {layers.map(({ color, text }) => (
        <span key={color} style={{ color }}>
          {text}
        </span>
      ))}
    </span>
  )
}
