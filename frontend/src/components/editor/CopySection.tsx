"use client"

import { useMemo, useState } from "react"
import { useOpenResume, useResumeActions, useResumeState } from "@/context/ResumeContext"
import Modal, { CancelButton } from "@/components/dashboard/Modal"
import { RowAction } from "@/components/dashboard/RowActions"
import { nameOf } from "@/components/dashboard/useListActions"
import { BLUE_PILL, TEXT_PILL } from "@/components/pills"
import { count } from "@/lib/count"
import type { CopyMode } from "@/lib/copySection"
import type { Entry, ResumeWithId } from "@/lib/resume"
import { extraKey, type SectionRef } from "@/lib/resumeSections"
import { SECTIONS, type SectionName } from "./sections"

/** Two sheets, one over the other, for copying. */
function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
    </svg>
  )
}

const list = new Intl.ListFormat("en", { style: "long", type: "conjunction" })

/** An entry as the list of what to copy names it: its section's summary fields, as its card does. */
function entryName(section: SectionName, entry: Entry, index: number): string {
  return (
    SECTIONS[section].summary
      .map((key) => entry[key]?.trim())
      .filter(Boolean)
      .join(" · ") || `Entry ${index + 1}`
  )
}

/**
 * A section's Copy button, beside its Delete: copies the section, or some of
 * its entries, into other resumes in this browser, after or in place of what
 * they have there, and can take it off this one, to move it.
 */
export default function CopySection({ sectionRef, title, onDelete }: { sectionRef: SectionRef; title: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <RowAction label="Copy to other resumes" onClick={() => setOpen(true)} tipBelow tipAtEnd>
        <CopyIcon />
      </RowAction>
      {open && <CopyDialog sectionRef={sectionRef} title={title} onDelete={onDelete} onClose={() => setOpen(false)} />}
    </>
  )
}

function CopyDialog({
  sectionRef,
  title,
  onDelete,
  onClose,
}: {
  sectionRef: SectionRef
  title: string
  onDelete: () => void
  onClose: () => void
}) {
  const { id } = useOpenResume()
  const { copySection, editResume } = useResumeActions()
  const resumes = useResumeState((state) => state.resumes)
  const others = useMemo(
    () =>
      Object.entries(resumes)
        .filter(([key]) => key !== id)
        .map(([key, resume]): ResumeWithId => ({ ...resume, id: key }))
        .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),
    [resumes, id],
  )
  const here = resumes[id]
  const name = extraKey(sectionRef) === null ? (sectionRef as SectionName) : null
  const entries: Entry[] = useMemo(() => {
    const value = name && here ? here[SECTIONS[name].dataKey] : null
    return Array.isArray(value) ? value : []
  }, [name, here])

  const [chosen, setChosen] = useState<ReadonlySet<number>>(() => new Set(entries.map((entry) => entry.id)))
  const [targets, setTargets] = useState<ReadonlySet<string>>(new Set())
  const [mode, setMode] = useState<CopyMode>("add")
  const [move, setMove] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const toggle = <Value,>(set: ReadonlySet<Value>, value: Value, on: boolean) => {
    const next = new Set(set)
    if (on) next.add(value)
    else next.delete(value)
    return next
  }

  const everyEntry = name === null || chosen.size === entries.length
  const ready = targets.size > 0 && (name === null || chosen.size > 0)

  const copy = () => {
    const only = name ? entries.filter((entry) => chosen.has(entry.id)).map((entry) => entry.id) : undefined
    const to = others.filter((resume) => targets.has(resume.id))
    const copied = copySection(
      id,
      sectionRef,
      to.map((resume) => resume.id),
      mode,
      only,
    )
    const names = list.format(to.map(nameOf))
    if (copied > 0 && move) {
      if (everyEntry) onDelete()
      else if (name)
        editResume(
          id,
          SECTIONS[name].dataKey,
          entries.filter((entry) => !chosen.has(entry.id)),
        )
    }
    setDone(
      copied === 0
        ? "Nothing was copied."
        : `${move ? "Moved" : "Copied"} ${name && !everyEntry ? count(chosen.size, "entry", "entries") : title} to ${names}.`,
    )
  }

  if (done !== null)
    return (
      <Modal title={`Copy ${title}`} onClose={onClose}>
        <p role="status" className="mt-4 text-[15px] leading-relaxed text-ink">
          {done}
        </p>
        <div className="mt-7 flex justify-end">
          <button type="button" onClick={onClose} className={BLUE_PILL} data-autofocus>
            Done
          </button>
        </div>
      </Modal>
    )

  return (
    <Modal title={`Copy ${title}`} onClose={onClose} fade>
      <form
        className="mt-6 flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) copy()
        }}
      >
        {name && entries.length > 1 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="label-mono mb-2 text-ink-2">What to copy</legend>
            {entries.map((entry, index) => (
              <label key={entry.id} className="flex items-center gap-2.5 text-[14px] text-ink">
                <input
                  type="checkbox"
                  checked={chosen.has(entry.id)}
                  onChange={(event) => setChosen(toggle(chosen, entry.id, event.target.checked))}
                  className="h-4 w-4 shrink-0 accent-accent"
                />
                <span className="truncate">{entryName(name, entry, index)}</span>
              </label>
            ))}
          </fieldset>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="label-mono mb-2 text-ink-2">To</legend>
          {others.length === 0 ? (
            <p className="text-[14px] text-ink-2">There are no other resumes in this browser to copy it to.</p>
          ) : (
            <div className="flex max-h-56 flex-col gap-2 overflow-y-auto">
              {others.map((resume) => (
                <label key={resume.id} className="flex items-center gap-2.5 text-[14px] text-ink">
                  <input
                    type="checkbox"
                    checked={targets.has(resume.id)}
                    onChange={(event) => setTargets(toggle(targets, resume.id, event.target.checked))}
                    className="h-4 w-4 shrink-0 accent-accent"
                  />
                  <span className="truncate">{nameOf(resume)}</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="label-mono mb-2 text-ink-2">Where it goes</legend>
          <label className="flex items-center gap-2.5 text-[14px] text-ink">
            <input
              type="radio"
              name="copy-mode"
              checked={mode === "add"}
              onChange={() => setMode("add")}
              className="h-4 w-4 accent-accent"
            />
            After what they have in {title}
          </label>
          <label className="flex items-center gap-2.5 text-[14px] text-ink">
            <input
              type="radio"
              name="copy-mode"
              checked={mode === "replace"}
              onChange={() => setMode("replace")}
              className="h-4 w-4 accent-accent"
            />
            In place of what they have in {title}
          </label>
        </fieldset>

        <label className="flex items-center gap-2.5 text-[14px] text-ink">
          <input type="checkbox" checked={move} onChange={(event) => setMove(event.target.checked)} className="h-4 w-4 accent-accent" />
          Take it off this resume (move it)
        </label>

        <div className="flex justify-end gap-2">
          <CancelButton className={TEXT_PILL} />
          <button type="submit" disabled={!ready} className={`${BLUE_PILL} disabled:opacity-50`}>
            {move ? "Move" : "Copy"}
          </button>
        </div>
      </form>
    </Modal>
  )
}
