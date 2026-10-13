import { readFile } from "node:fs/promises"
import path from "node:path"
import { ImageResponse } from "next/og"
import sharp from "sharp"
import { SHARE_IMAGE_SIZE } from "@/lib/site"
import { printedName, TEMPLATES, templateBySlug, templateSlug } from "@/lib/templates"

// The picture a shared link to a template's page shows: the template's name
// on the home page's sky, beside its own picture. Built with the site, one
// per template, as the pages are. The page names it in its metadata, with
// its alt text: Next adds an opengraph-image's own tags only to a page whose
// metadata names no picture, and they can't say which template it shows.

export const size = SHARE_IMAGE_SIZE
export const contentType = "image/png"

export const dynamicParams = false

export function generateStaticParams() {
  return TEMPLATES.map((template) => ({ template: templateSlug(template) }))
}

const INK = "#111318"
const ACCENT = "#2e5be6"

/** How wide the template's page is drawn: it runs off the foot of the card, as a page on a desk would. */
const PAGE_WIDTH = 500

const read = (file: string) => readFile(path.join(process.cwd(), file))

/**
 * A WebP in public/ as a PNG data URL, at `width` (and `height`, cropped from
 * the top). next/og reads PNG, JPEG and SVG but not WebP, which the site's
 * pictures are kept in, so sharp, which Next ships for its own image
 * resizing, turns them into PNG while the site is built.
 */
async function png(file: string, width: number, height?: number): Promise<{ src: string; width: number; height: number }> {
  const { data, info } = await sharp(await read(path.join("public", file)))
    .resize(width, height, { fit: "cover", position: "top" })
    .png()
    .toBuffer({ resolveWithObject: true })
  return { src: `data:image/png;base64,${data.toString("base64")}`, width: info.width, height: info.height }
}

// The site's own fonts are woff2, which next/og can't read; these are the
// ones the templates print with, kept as TTF.
const font = (file: string) => read(path.join("src/lib/typst/fonts", file))

export default async function Image({ params }: { params: { template: string } }) {
  // dynamicParams = false: only the templates' own pages get here.
  const template = templateBySlug(params.template) ?? TEMPLATES[0]
  const [sky, page, logo, serif, serifItalic, sans, mono] = await Promise.all([
    png("/backgrounds/sky-wide.webp", size.width, size.height),
    // Twice the size it's drawn at, for screens that show the card at 2x.
    png(template.image, PAGE_WIDTH * 2),
    read("public/logo.svg"),
    font("EBGaramond-Regular.ttf"),
    font("EBGaramond-Italic.ttf"),
    font("SourceSans3-Bold.ttf"),
    font("IBMPlexMono-Regular.ttf"),
  ])

  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", position: "relative", color: INK }}>
      <img src={sky.src} width={size.width} height={size.height} alt="" style={{ position: "absolute", top: 0, left: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 34, width: 600, marginLeft: 80 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img src={`data:image/svg+xml;base64,${logo.toString("base64")}`} width={46} height={46} alt="" />
          <span style={{ fontFamily: "Source Sans 3", fontWeight: 700, fontSize: 34, letterSpacing: "-0.01em" }}>resumezip</span>
        </div>
        {/* The name on a line of its own and "resume template" under it, so every card has the same shape. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontFamily: "EB Garamond",
            fontSize: 86,
            lineHeight: 1,
            letterSpacing: "-0.025em",
          }}
        >
          <span>{printedName(template)}</span>
          <div style={{ display: "flex", gap: 22 }}>
            <span>resume</span>
            <span style={{ fontStyle: "italic", color: ACCENT }}>template</span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            fontFamily: "IBM Plex Mono",
            fontSize: 19,
            letterSpacing: "0.08em",
            padding: "13px 24px",
            borderRadius: 999,
            background: "rgba(255, 255, 255, 0.88)",
          }}
        >
          FREE · NO SIGN-UP · TRYRESUMEZIP.COM
        </div>
      </div>
      <img
        src={page.src}
        width={PAGE_WIDTH}
        height={page.height / 2}
        alt=""
        style={{
          position: "absolute",
          top: 56,
          right: 72,
          boxShadow: "0 2px 4px rgba(17, 19, 24, 0.1), 0 30px 60px -20px rgba(30, 40, 90, 0.55)",
        }}
      />
    </div>,
    {
      ...size,
      fonts: [
        { name: "EB Garamond", data: serif, weight: 400, style: "normal" },
        { name: "EB Garamond", data: serifItalic, weight: 400, style: "italic" },
        { name: "Source Sans 3", data: sans, weight: 700, style: "normal" },
        { name: "IBM Plex Mono", data: mono, weight: 400, style: "normal" },
      ],
    },
  )
}
