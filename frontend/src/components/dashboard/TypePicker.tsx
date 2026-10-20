"use client"

import { useId, useState } from "react"
import { Briefcase, GraduationCap, Plus, Tag, User, type LucideIcon } from "lucide-react"
import { MAX_TAG_LENGTH } from "@/lib/resume"
import { tagName } from "./ResumeTable"

interface TypePickerProps {
  /** The type chosen so far: a RESUME_TAGS id, or the person's own as typed. */
  value: string
  onChange: (value: string) => void
  /** Types of the person's own already in use, as saved, to pick again. */
  own: string[]
  /** The dialog it's in opens with the focus on the type chosen (Modal's data-autofocus). */
  focusChosen?: boolean
}

// The types every resume can have, in the order they're offered: work first, as most resumes are.
const OFFERED: { id: string; icon: LucideIcon }[] = [
  { id: "professional", icon: Briefcase },
  { id: "personal", icon: User },
  { id: "academic", icon: GraduationCap },
]

const CHIP =
  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full px-3.5 text-[14px] font-medium tracking-[-0.01em] transition-[background-color,box-shadow,color] duration-150 motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0"

const chip = (chosen: boolean) =>
  `${CHIP} has-[:focus-visible]:shadow-[inset_0_0_0_1px_#b9bec7,0_0_0_3px_rgb(17_19_24/0.12)] ${
    chosen ? "bg-ink text-white" : "bg-sheet text-[#3a3e46] shadow-[inset_0_0_0_1px_#e3e5ea] hover:shadow-[inset_0_0_0_1px_#c9cdd4]"
  }`

/**
 * A resume's type: a chip for each of the types offered and each type of the
 * person's own in use, and "Your own", which opens a box to name a new one.
 * Typing in the box chooses what's typed, and the box left empty is no type;
 * choosing a chip empties it and puts it away. What's typed is kept apart
 * from what's chosen, so text that happens to match a chip, as "Data roles"
 * on the way to "Data roles 2", stays in the box.
 */
export default function TypePicker({ value, onChange, own, focusChosen = false }: TypePickerProps) {
  const name = useId()
  const offered = OFFERED.map((option) => option.id)
  const choices = [...offered, ...own.filter((tag) => !offered.includes(tag))]
  const [typed, setTyped] = useState(() => (choices.includes(value) ? "" : value))
  // The box is shown once asked for, or from the start for a type of the person's own not offered as a chip.
  const [typing, setTyping] = useState(typed !== "")

  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">Type</legend>
      <div className="flex flex-wrap gap-2">
        {choices.map((tag) => {
          const chosen = typed === "" && value === tag
          const Icon = OFFERED.find((option) => option.id === tag)?.icon ?? Tag
          return (
            <label key={tag} className={chip(chosen)}>
              <input
                type="radio"
                name={name}
                value={tag}
                checked={chosen}
                data-autofocus={(focusChosen && chosen) || undefined}
                onChange={() => {
                  setTyped("")
                  setTyping(false)
                  onChange(tag)
                }}
                className="sr-only"
              />
              <Icon aria-hidden="true" />
              <span className="max-w-[16rem] truncate">{tagName(tag)}</span>
            </label>
          )
        })}
        {typing ? (
          // A chip to type in, as wide as what's typed, with room for its placeholder.
          <label className={`${CHIP} cursor-text bg-sheet pr-1 text-ink shadow-[inset_0_0_0_1px_#b9bec7]`}>
            <Tag aria-hidden="true" className="text-ink-3" />
            <span className="sr-only">Your own type</span>
            <input
              type="text"
              value={typed}
              maxLength={MAX_TAG_LENGTH}
              autoFocus
              data-autofocus={focusChosen || undefined}
              onChange={(event) => {
                setTyped(event.target.value)
                onChange(event.target.value)
              }}
              placeholder="Data roles"
              size={Math.max(10, typed.length + 1)}
              className="min-w-0 max-w-[14rem] bg-transparent pr-2.5 text-[14px] font-medium text-ink outline-none placeholder:font-normal placeholder:text-ink-3"
            />
          </label>
        ) : (
          <button
            type="button"
            // An empty box is no type, until something's typed in it.
            onClick={() => {
              setTyping(true)
              onChange(typed)
            }}
            className={`${CHIP} border border-dashed border-[#d4d7dd] text-ink-3 hover:border-[#b9bec7] hover:text-ink`}
          >
            <Plus aria-hidden="true" />
            Your own
          </button>
        )}
      </div>
    </fieldset>
  )
}
