"use client"

import { DropTile, NewTile } from "./ResumeGrid"

interface EmptyShelfProps {
  onNew: () => void
  onChooseFile: () => void
  dragging: boolean
}

/**
 * What the dashboard shows under its toolbar before there are any resumes:
 * cards where they'll go, the first to start one and the second to open a
 * file. The rest are only outlines. The greeting above says there are none.
 */
export default function EmptyShelf({ onNew, onChooseFile, dragging }: EmptyShelfProps) {
  return (
    <ul className="resume-grid">
      <li className="aspect-[4/5] min-w-0">
        <NewTile onNew={onNew} />
      </li>
      <li className={`aspect-[4/5] min-w-0 ${dragging ? "relative z-[45]" : ""}`}>
        <DropTile onChooseFile={onChooseFile} dragging={dragging} />
      </li>
      {/* Where later resumes go: outlines only, fading out, as many as fit on the row. */}
      {[0.7, 0.4].map((opacity, index) => (
        <li
          key={opacity}
          aria-hidden="true"
          style={{ opacity }}
          className={`aspect-[4/5] rounded-[24px] border border-dashed border-[#d4d7dd] ${index === 0 ? "hidden lg:block" : "hidden xl:block"}`}
        />
      ))}
    </ul>
  )
}
