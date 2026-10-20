"use client"

import { useState } from "react"
import { cleanTag, type ResumeWithId } from "@/lib/resume"
import Modal, { CancelButton } from "./Modal"
import TypePicker from "./TypePicker"
import { BLUE_PILL, TEXT_PILL } from "@/components/pills"

interface TypeModalProps {
  resume: ResumeWithId
  /** Types of the person's own already in use, to pick again. */
  own: string[]
  onClose: () => void
  /** The type chosen, cleaned (cleanTag); "" when the box was emptied, for no type. */
  onSave: (tag: string) => void
}

/** Changes a resume's type, from the dashboard. */
export default function TypeModal({ resume, own, onClose, onSave }: TypeModalProps) {
  const [tag, setTag] = useState(cleanTag(resume.resumeTag ?? ""))

  return (
    <Modal title="Change type" onClose={onClose} fade>
      <form
        className="mt-6 flex flex-col gap-7"
        onSubmit={(event) => {
          event.preventDefault()
          onSave(cleanTag(tag))
        }}
      >
        <TypePicker value={tag} onChange={setTag} own={own} focusChosen />
        <div className="flex justify-end gap-2">
          <CancelButton className={TEXT_PILL} />
          <button type="submit" className={BLUE_PILL}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  )
}
