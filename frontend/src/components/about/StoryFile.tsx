"use client"

import { type Ref, useId, useImperativeHandle, useRef } from "react"
import { clamp } from "./motion"
import { FLAP_SHARE, type FolderLayout, strokeTimes } from "./folder"

export interface StoryFileHandle {
  /** Mark `i` drawn `t` of the way: its strokes in turn, then its note writing in. */
  draw(i: number, t: number): void
}

interface StoryFileProps {
  layout: FolderLayout
  phone: boolean
  /** Every mark drawn and every note written, as the still story shows it. */
  drawn?: boolean
  ref?: Ref<StoryFileHandle>
}

const at = (left: number, top: number, width?: number, height?: number) => ({ left, top, width, height })

/**
 * Our resume standing in its manila folder, with what resumezip promises marked
 * on it in blue: a picture, which screen readers skip (AboutStory.tsx says it
 * in words). The folder is drawn twice, the whole of it behind the page and
 * again from its front flap's edge down, over it, so the page stands in it.
 * Each stroke of the marker is drawn in by a mask along its middle.
 */
export default function StoryFile({ layout, phone, drawn = false, ref }: StoryFileProps) {
  const id = useId().replace(/[^a-z0-9]/gi, "")
  const masks = useRef<(SVGPathElement | null)[][]>([])
  const notes = useRef<(HTMLParagraphElement | null)[]>([])

  useImperativeHandle(
    ref,
    () => ({
      draw(i, t) {
        // The pen over the first three quarters, the note writing in from the left over the last half.
        const pen = clamp(t / 0.75)
        const strokes = masks.current[i] ?? []
        strokeTimes(strokes.length).forEach(([from, to], j) => {
          const done = clamp((pen - from) / (to - from))
          strokes[j]?.setAttribute("stroke-dashoffset", String(1 - done))
          // Not started, it's hidden: Safari draws an empty dash's round cap as a dot.
          strokes[j]?.setAttribute("visibility", done > 0 ? "visible" : "hidden")
        })
        const note = notes.current[i]
        if (!note) return
        const written = clamp((t - 0.45) / 0.55)
        note.style.opacity = written > 0 ? "1" : "0"
        note.style.clipPath = `inset(-30% ${(1 - written) * 104}% -30% -10%)`
      },
    }),
    [],
  )

  const { page, folder, flap, headline } = layout
  return (
    <div aria-hidden="true" className="story-file" data-phone={phone || undefined} style={{ width: layout.width, height: layout.height }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/about/manila-folder.webp" alt="" className="story-folder-back" style={at(folder.left, folder.top, folder.width)} />
      <figure className="story-page" style={at(page.left, page.top, page.width, page.height)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/about/own-resume.webp" alt="" />
      </figure>
      <svg className="story-ink" width={layout.width} height={layout.height}>
        <defs>
          {layout.strokes.map((strokes, i) =>
            strokes.map((stroke, j) => (
              <mask
                key={`${i}-${j}`}
                id={`${id}-${i}-${j}`}
                maskUnits="userSpaceOnUse"
                x={-40}
                y={-40}
                width={layout.width + 80}
                height={layout.height + 80}
              >
                <path
                  ref={(path) => {
                    masks.current[i] ??= []
                    masks.current[i][j] = path
                  }}
                  d={stroke.center}
                  fill="none"
                  stroke="#fff"
                  strokeWidth={stroke.width * 2.6 + 4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pathLength={1}
                  strokeDasharray="1 1"
                  strokeDashoffset={drawn ? 0 : 1}
                  visibility={drawn ? "visible" : "hidden"}
                />
              </mask>
            )),
          )}
        </defs>
        {layout.strokes.map((strokes, i) =>
          strokes.map((stroke, j) => <path key={`${i}-${j}`} className="story-mark" d={stroke.outline} mask={`url(#${id}-${i}-${j})`} />),
        )}
      </svg>
      <div className="story-flap-shade" style={at(page.left, flap - 7, page.width)} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/about/manila-folder.webp"
        alt=""
        style={{ ...at(folder.left, folder.top, folder.width), clipPath: `inset(${FLAP_SHARE * 100}% 0 0 0)` }}
      />
      <p className="story-headline" style={{ ...at(headline.left, headline.top, headline.width), fontSize: headline.size }}>
        Here’s <em>our resume.</em>
      </p>
      {layout.notes.map((note, i) => (
        <p
          key={i}
          ref={(element) => {
            notes.current[i] = element
          }}
          className="story-note"
          style={{ ...at(note.left, note.top), fontSize: note.size, rotate: `${note.turn}deg`, opacity: drawn ? 1 : 0 }}
        >
          {/* A space between the lines, so a phone's one line and the text both read right. */}
          {note.lines.map((line, j) => (
            <span key={line}>
              {j > 0 && " "}
              {line}
            </span>
          ))}
        </p>
      ))}
    </div>
  )
}
