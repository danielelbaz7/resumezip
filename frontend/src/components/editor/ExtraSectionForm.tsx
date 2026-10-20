"use client"

import { useEffect, useRef } from "react"
import { useOpenResume, useResumeActions, useResumeField } from "@/context/ResumeContext"
import { extraHeading, type ExtraSection } from "@/lib/resumeSections"
import { useCheckActions, useCheckTarget } from "./CheckContext"
import DeleteSection from "./DeleteSection"
import { BulletsField, FlagNote, FocusGlow, FocusLine, FormatHint, SectionHeading, selectLine, underlined } from "./fields"
import { reducedMotion } from "./layout"
import { StyledBox } from "./StyledBox"

/** A section the person added, found by its key rather than its title, which can be anyone's. */
export default function ExtraSectionForm({ sectionId, onDelete }: { sectionId: string; onDelete: () => void }) {
  const { editSection } = useResumeActions()
  const { id } = useOpenResume()
  const extraSections = useResumeField("extraSections")
  const section: ExtraSection | undefined = extraSections?.[sectionId]
  const root = useRef<HTMLDivElement>(null)
  const target = useCheckTarget()
  const { pending, claim } = useCheckActions()
  const place = target?.finding.place
  const here = place && "sectionId" in place && place.sectionId === sectionId ? place : null
  const flagAt = (field: "text" | "bullets") => (here?.kind === "extra-text" && here.field === field ? target!.finding : null)

  useEffect(() => {
    const place = target?.finding.place
    if (!target || !place || !("sectionId" in place) || place.sectionId !== sectionId || !pending(target.request)) return
    const timer = setTimeout(() => {
      if (!claim(target.request)) return
      const selector =
        place.kind === "extra-heading" ? 'button[aria-label="Rename section"]' : `[data-field="${place.field}"] [contenteditable="true"]`
      const field = root.current?.querySelector<HTMLElement>(selector)
      field?.focus({ preventScroll: true })
      if (field && place.kind === "extra-text" && place.line !== undefined) selectLine(field, place.line)
      field?.scrollIntoView({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" })
    }, 0)
    return () => clearTimeout(timer)
  }, [target, pending, claim, sectionId])

  if (!section) return null
  const title = extraHeading(section)
  return (
    <div ref={root} className="flex flex-col gap-[22px]">
      <SectionHeading
        title={title}
        allowEmpty
        onRename={(heading) => editSection(id, sectionId, { heading })}
        flag={here?.kind === "extra-heading" ? target!.finding : null}
        end={<DeleteSection onDelete={onDelete} />}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2.5 text-[14px] text-ink-2">
          <input
            type="checkbox"
            checked={!section.leftOut}
            onChange={(event) => editSection(id, sectionId, { leftOut: !event.target.checked })}
            className="h-4 w-4 accent-accent"
          />
          Include section in the PDF
        </label>
      </div>
      {section.leftOut && <p className="text-[13px] text-ink-3">This section stays saved here and is left out of the PDF and checks.</p>}
      {section.kind === "text" && (
        <div data-field="text" className="group/field flex flex-col gap-1.5">
          {/* Its label turns blue while typing in the box, as a field's does. A label can't be
              for the box, a div, so a click on it puts the cursor in the box itself. */}
          <span
            id={`extra-text-label-${sectionId}`}
            onClick={() => document.getElementById(`extra-text-${sectionId}`)?.focus()}
            className="label-mono text-ink-2 transition-colors group-focus-within/field:text-accent"
          >
            Text
          </span>
          <div className="relative">
            <FocusGlow />
            <StyledBox
              kind="prose"
              id={`extra-text-${sectionId}`}
              value={section.text}
              onChange={(text) => editSection(id, sectionId, { text })}
              labelId={`extra-text-label-${sectionId}`}
              describedBy={flagAt("text") ? `extra-text-hint-${sectionId} extra-text-note-${sectionId}` : `extra-text-hint-${sectionId}`}
              invalid={flagAt("text")?.level === "fix"}
              // As tall as eight lines, as the text box it replaced was.
              className={`${underlined(!!flagAt("text"))} min-h-[238px] leading-relaxed`}
            />
            <FocusLine />
          </div>
          {flagAt("text") && <FlagNote id={`extra-text-note-${sectionId}`} finding={flagAt("text")!} />}
          <p id={`extra-text-hint-${sectionId}`} className="text-[13px] text-ink-2">
            Paragraph breaks are kept. <FormatHint />
          </p>
        </div>
      )}
      {section.kind === "list" && (
        <BulletsField
          label="Bullet points"
          name="bullets"
          value={section.bullets}
          onChange={(bullets) => editSection(id, sectionId, { bullets })}
          flag={flagAt("bullets")}
          request={target?.request}
        />
      )}
    </div>
  )
}
