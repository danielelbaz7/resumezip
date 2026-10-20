"use client"

import { useState } from "react"
import { useResumeContext } from "@/context/ResumeContext"
import { saveFile } from "@/lib/saveFile"
import Modal from "./Modal"
import { sheetPill, TEXT_PILL, WHITE_PILL } from "@/components/pills"

/**
 * Saved data that couldn't be read is kept aside instead of being saved over
 * (see lib/resumeStorage.ts). This says so, and offers it as a file or to
 * delete it. Shows nothing when there's none.
 */
export default function UnreadableData() {
  const { unreadable, deleteUnreadable } = useResumeContext()
  const [deleting, setDeleting] = useState(false)
  if (unreadable.length === 0) return null

  // One copy downloads exactly as it was saved. Several go in a JSON list, so
  // they can be told apart again.
  const download = () => {
    if (unreadable.length === 1) saveFile(unreadable[0], "resumezip-unreadable-data.txt", "text/plain")
    else saveFile(JSON.stringify(unreadable, null, 2), "resumezip-unreadable-data.json", "application/json")
  }

  return (
    <div className="flex max-w-[720px] flex-wrap items-baseline gap-x-6 gap-y-3">
      <span className="label-mono shrink-0 text-alert">Couldn&apos;t read</span>
      <div className="flex min-w-0 flex-[1_1_280px] flex-col items-start gap-3">
        <p className="text-sm leading-relaxed text-ink">
          Some data saved in this browser couldn&apos;t be read, so resumezip kept a copy instead of saving over it.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={download} className={WHITE_PILL}>
            Download the copy
          </button>
          <button type="button" onClick={() => setDeleting(true)} className={WHITE_PILL}>
            Delete it
          </button>
        </div>
      </div>

      {deleting && (
        <Modal title="Delete the copy?" onClose={() => setDeleting(false)}>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">It will be removed from this browser. This can&apos;t be undone.</p>
          <div className="mt-7 flex justify-end gap-2">
            <button type="button" onClick={() => setDeleting(false)} className={TEXT_PILL}>
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                deleteUnreadable()
                setDeleting(false)
              }}
              className={sheetPill("danger")}
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
