"use client"

import { useEffect, useRef, useState } from "react"
import { Sparkles, X } from "lucide-react"
import { useOpenResume, useResumeActions } from "@/context/ResumeContext"
import { BLUE_PILL, TEXT_PILL } from "@/components/pills"
import { applyActions } from "@/lib/assistant/apply"
import { askAssistant, AssistError } from "@/lib/assistant/ask"
import { LONGEST_MESSAGE, MOST_MESSAGES, type Message } from "@/lib/assistant/request"
import { assistantView } from "@/lib/assistant/view"
import type { Resume } from "@/lib/resume"

type Turn =
  | { from: "person"; text: string }
  | {
      from: "assistant"
      text: string
      done: string[]
      failed: string[]
      /** What the changed fields were before, by resume id, for Undo; null when nothing changed. */
      before: Record<string, Partial<Resume>> | null
      undone?: boolean
    }
  | { from: "problem"; text: string }

// What the assistant is reminded of each time: its replies, with what it did, and what was undone.
function messagesOf(turns: readonly Turn[]): Message[] {
  const messages = turns.flatMap((turn): Message[] => {
    if (turn.from === "person") return [{ from: "person", text: turn.text }]
    if (turn.from === "problem") return []
    const notes = [
      turn.done.length > 0 && `(Done: ${turn.done.join(" ")})`,
      turn.failed.length > 0 && `(Couldn't do: ${turn.failed.join(" ")})`,
      turn.undone && "(The person undid these changes.)",
    ].filter(Boolean)
    return [{ from: "assistant", text: [turn.text, ...notes].join("\n").slice(0, LONGEST_MESSAGE) }]
  })
  const recent = messages.slice(-MOST_MESSAGES)
  // The conversation sent starts with something the person said.
  return recent[0]?.from === "assistant" ? recent.slice(1) : recent
}

const EXAMPLES = [
  "Bold the numbers in every bullet",
  "Leave out my oldest job",
  "Make it fit on one page",
  "Copy my Projects to my other resumes",
]

/**
 * The editor's AI assistant: a conversation beside the resume, in the form's
 * place while it's open. What the person asks is sent with the open resume to
 * /api/assist, and the changes the AI answers with are made at once, saved,
 * and listed under its reply with an Undo. It stays mounted while hidden, so
 * the conversation lasts until the editor is left.
 */
export default function AssistantPanel({ hidden, onClose }: { hidden: boolean; onClose: () => void }) {
  const { id } = useOpenResume()
  const { getState, rewriteResumes } = useResumeActions()
  const [turns, setTurns] = useState<Turn[]>([])
  const [draft, setDraft] = useState("")
  const [asking, setAsking] = useState(false)
  const asked = useRef<AbortController | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => asked.current?.abort(), [])
  useEffect(() => {
    if (!hidden) box.current?.focus()
  }, [hidden])
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight })
  }, [turns, asking])

  // Only the latest answer can be undone: an older one's fields may have changed since.
  const lastAnswer = turns.reduce((last, turn, index) => (turn.from === "assistant" ? index : last), -1)

  const send = async (text: string) => {
    text = text.trim()
    if (!text || asking) return
    const { resumes } = getState()
    const resume = resumes[id]
    if (!resume) return
    const sent: Turn[] = [...turns, { from: "person", text: text.slice(0, LONGEST_MESSAGE) }]
    setTurns(sent)
    setDraft("")
    setAsking(true)
    const controller = new AbortController()
    asked.current = controller
    try {
      const answer = await askAssistant(
        {
          messages: messagesOf(sent),
          resume: { id, view: assistantView(resume) },
          others: Object.entries(resumes)
            .filter(([other]) => other !== id)
            .map(([other, { resumeTitle }]) => ({ id: other, name: resumeTitle || "Untitled resume" })),
        },
        controller.signal,
      )
      // Made on the resumes as they are now: the person may have typed while the AI thought.
      const { edits, done, failed } = applyActions(getState().resumes, id, answer.actions)
      const before = Object.keys(edits).length > 0 ? rewriteResumes(edits) : null
      setTurns((now) => [...now, { from: "assistant", text: answer.reply, done, failed, before }])
    } catch (error) {
      if (controller.signal.aborted) return
      if (!(error instanceof AssistError)) console.error("The AI assistant failed:", error)
      const text = error instanceof AssistError ? error.message : "Something went wrong. Try again in a minute."
      setTurns((now) => [...now, { from: "problem", text }])
    } finally {
      if (asked.current === controller) {
        asked.current = null
        setAsking(false)
      }
    }
  }

  const undo = (index: number) => {
    const turn = turns[index]
    if (turn.from !== "assistant" || !turn.before) return
    rewriteResumes(turn.before)
    setTurns((now) => now.map((other, at) => (at === index ? { ...turn, undone: true } : other)))
  }

  const startOver = () => {
    asked.current?.abort()
    asked.current = null
    setAsking(false)
    setTurns([])
  }

  return (
    <section aria-label="AI assistant" className={`flex min-h-[70vh] flex-1 flex-col xl:min-h-0 ${hidden ? "hidden" : ""}`}>
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-3 sm:px-6">
        <h2 className="flex items-center gap-2 text-[16px] font-medium text-ink">
          <Sparkles className="h-4 w-4 text-accent" aria-hidden="true" />
          AI assistant
        </h2>
        <div className="flex items-center gap-1">
          {turns.length > 0 && (
            <button type="button" onClick={startOver} className="h-9 rounded-full px-3 text-[14px] text-ink-3 hover:text-ink">
              New conversation
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close the AI assistant"
            title="Back to the form"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-3 hover:bg-fill hover:text-ink"
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div ref={log} role="log" aria-label="Conversation" className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">
        {turns.length === 0 && (
          <div className="flex flex-col gap-3 text-[14px] leading-relaxed text-ink-2">
            <p>
              Tell it what to change, and it changes your resume: rewrite or bold bullets, leave jobs out, reorder sections, switch the
              template, fit it on one page, or copy sections to your other resumes. Each answer can be undone.
            </p>
            <p className="text-[13px] text-ink-3">
              What you send and this resume go to an AI service to answer. Nothing is kept, and it only uses what’s on your resume.
            </p>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => void send(example)}
                  className="rounded-full bg-fill px-3 py-1.5 text-left text-[13px] text-ink hover:brightness-95"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((turn, index) =>
          turn.from === "person" ? (
            <p key={index} className="max-w-[85%] self-end whitespace-pre-wrap rounded-[18px] bg-accent px-4 py-2.5 text-[14px] text-white">
              {turn.text}
            </p>
          ) : turn.from === "problem" ? (
            <p key={index} className="text-[14px] text-red-700">
              {turn.text}
            </p>
          ) : (
            <div key={index} className="flex max-w-[92%] flex-col gap-2 text-[14px] leading-relaxed text-ink">
              <p className="whitespace-pre-wrap">{turn.text}</p>
              {(turn.done.length > 0 || turn.failed.length > 0) && (
                <ul className="flex flex-col gap-1 rounded-[14px] bg-fill px-3.5 py-2.5 text-[13px]">
                  {turn.done.map((line, at) => (
                    <li key={`done${at}`} className={turn.undone ? "text-ink-3 line-through" : "text-ink-2"}>
                      {line}
                    </li>
                  ))}
                  {turn.failed.map((line, at) => (
                    <li key={`failed${at}`} className="text-red-700">
                      Couldn’t: {line}
                    </li>
                  ))}
                </ul>
              )}
              {turn.before && (
                <div className="flex items-center gap-2">
                  {turn.undone ? (
                    <span className="text-[13px] text-ink-3">Undone.</span>
                  ) : (
                    index === lastAnswer && (
                      <button type="button" onClick={() => undo(index)} className={`${TEXT_PILL} self-start`}>
                        Undo
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ),
        )}
        {asking && (
          <p role="status" className="text-[14px] text-ink-3">
            Working on it…
          </p>
        )}
      </div>

      <form
        className="sticky bottom-24 flex items-end gap-2 border-t border-hairline bg-sheet px-4 py-3 sm:px-6 xl:static"
        onSubmit={(event) => {
          event.preventDefault()
          void send(draft)
        }}
      >
        <textarea
          ref={box}
          aria-label="Ask the AI to change your resume"
          placeholder="Ask for a change…"
          value={draft}
          maxLength={LONGEST_MESSAGE}
          rows={2}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a new line. Not while an IME is composing a word.
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void send(draft)
            }
          }}
          className="min-h-[44px] flex-1 resize-none rounded-[14px] bg-sheet px-3.5 py-2.5 text-[14px] text-ink ring-1 ring-hairline outline-none focus:ring-accent"
        />
        <button type="submit" disabled={asking || !draft.trim()} className={`${BLUE_PILL} disabled:opacity-50`}>
          Send
        </button>
      </form>
    </section>
  )
}
