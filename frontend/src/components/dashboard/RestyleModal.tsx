"use client"

import { useState } from "react"
import { useResumeContext } from "@/context/ResumeContext"
import { BLUE_PILL, TEXT_PILL } from "@/components/pills"
import { count } from "@/lib/count"
import type { ResumeWithId } from "@/lib/resume"
import { styleOf, type ResumeStyle, type StyleChange } from "@/lib/resumeStyle"
import { DEFAULT_TEMPLATE, TEMPLATES } from "@/lib/templates"
import Modal, { CancelButton } from "./Modal"
import { nameOf } from "./useListActions"

const SELECT = "h-10 w-full rounded-[10px] bg-sheet px-3 text-[14px] text-ink ring-1 ring-hairline disabled:opacity-50"

/**
 * The dashboard's Change style: puts a template, or all of one resume's
 * style (lib/resumeStyle.ts), on the resumes ticked, at once. Undo puts each
 * back as it was, until the dialog is closed.
 */
export default function RestyleModal({ resumes, onClose }: { resumes: readonly ResumeWithId[]; onClose: () => void }) {
  const { restyleResumes } = useResumeContext()
  const [from, setFrom] = useState<"template" | "resume">("template")
  const [template, setTemplate] = useState<string>(DEFAULT_TEMPLATE)
  const [source, setSource] = useState(resumes[0]?.id ?? "")
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set())
  const [done, setDone] = useState<{ said: string; before: Record<string, ResumeStyle> } | null>(null)

  // The resume whose style is copied is already in it.
  const changeable = resumes.filter((resume) => from === "template" || resume.id !== source)
  const ticked = changeable.filter((resume) => chosen.has(resume.id))
  const allTicked = ticked.length === changeable.length && changeable.length > 0

  const apply = () => {
    const style: StyleChange = from === "template" ? { template } : styleOf(resumes.find((resume) => resume.id === source)!)
    const before = restyleResumes(Object.fromEntries(ticked.map((resume) => [resume.id, style])))
    const changed = Object.keys(before).length
    const already = ticked.length - changed
    setDone({
      said:
        changed === 0
          ? `${ticked.length === 1 ? "It has" : "They all have"} that style already.`
          : `Changed the style of ${count(changed, "resume")}.${already > 0 ? ` ${already} had it already.` : ""}`,
      before,
    })
  }

  if (done)
    return (
      <Modal title="Change style" onClose={onClose}>
        <p role="status" className="mt-4 text-[15px] leading-relaxed text-ink">
          {done.said}
        </p>
        <div className="mt-7 flex justify-end gap-2">
          {Object.keys(done.before).length > 0 && (
            <button
              type="button"
              onClick={() => {
                restyleResumes(done.before)
                setDone({ said: "Put back as they were.", before: {} })
              }}
              className={TEXT_PILL}
            >
              Undo
            </button>
          )}
          <button type="button" onClick={onClose} className={BLUE_PILL} data-autofocus>
            Done
          </button>
        </div>
      </Modal>
    )

  return (
    <Modal title="Change style" onClose={onClose} fade large>
      <form
        className="mt-6 flex flex-col gap-7"
        onSubmit={(event) => {
          event.preventDefault()
          if (ticked.length > 0) apply()
        }}
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="label-mono mb-2 text-ink-2">Style</legend>
          <label className="flex items-center gap-2.5 text-[14px] text-ink">
            <input
              type="radio"
              name="style-from"
              checked={from === "template"}
              onChange={() => setFrom("template")}
              className="h-4 w-4 accent-accent"
            />
            A template, keeping each resume’s Fine-tune
          </label>
          <select
            aria-label="Template"
            value={template}
            onChange={(event) => setTemplate(event.target.value)}
            disabled={from !== "template"}
            className={`${SELECT} ml-6 max-w-[calc(100%-1.5rem)]`}
          >
            {TEMPLATES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          <label className="mt-1 flex items-center gap-2.5 text-[14px] text-ink">
            <input
              type="radio"
              name="style-from"
              checked={from === "resume"}
              onChange={() => setFrom("resume")}
              disabled={resumes.length < 2}
              className="h-4 w-4 accent-accent"
            />
            The style of a resume: its template, Fine-tune, and section choices
          </label>
          <select
            aria-label="Resume to copy the style of"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            disabled={from !== "resume"}
            className={`${SELECT} ml-6 max-w-[calc(100%-1.5rem)]`}
          >
            {resumes.map((resume) => (
              <option key={resume.id} value={resume.id}>
                {nameOf(resume)}
              </option>
            ))}
          </select>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="label-mono mb-2 text-ink-2">Resumes to change</legend>
          <button
            type="button"
            onClick={() => setChosen(allTicked ? new Set() : new Set(changeable.map((resume) => resume.id)))}
            className="self-start text-[13px] text-accent underline-offset-4 hover:underline"
          >
            {allTicked ? "Clear all" : "Select all"}
          </button>
          <div className="flex max-h-60 flex-col gap-2 overflow-y-auto">
            {changeable.map((resume) => (
              <label key={resume.id} className="flex items-center gap-2.5 text-[14px] text-ink">
                <input
                  type="checkbox"
                  checked={chosen.has(resume.id)}
                  onChange={(event) => {
                    const next = new Set(chosen)
                    if (event.target.checked) next.add(resume.id)
                    else next.delete(resume.id)
                    setChosen(next)
                  }}
                  className="h-4 w-4 shrink-0 accent-accent"
                />
                <span className="truncate">{nameOf(resume)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2">
          <CancelButton className={TEXT_PILL} />
          <button type="submit" disabled={ticked.length === 0} className={`${BLUE_PILL} disabled:opacity-50`}>
            {ticked.length > 0 ? `Change ${count(ticked.length, "resume")}` : "Change style"}
          </button>
        </div>
      </form>
    </Modal>
  )
}
