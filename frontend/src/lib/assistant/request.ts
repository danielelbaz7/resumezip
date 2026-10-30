// What the editor sends /api/assist: the conversation so far, the open
// resume as the assistant sees it (view.ts), and the names of the others, which
// it can copy to. The route reads it with requestOf, as it's untrusted.

import { isObject } from "@/lib/isObject"

export interface Message {
  from: "person" | "assistant"
  text: string
}

export interface AssistRequest {
  /** The conversation, oldest first, ending with what the person just asked. */
  messages: Message[]
  resume: { id: string; view: object }
  others: { id: string; name: string }[]
}

/** The most messages sent: older ones are left out. */
export const MOST_MESSAGES = 20
/** The longest a message can be, in characters. */
export const LONGEST_MESSAGE = 6_000
// A long resume's view is about 15,000 characters: room for one twice that, and a page of custom sections.
const LONGEST_RESUME = 60_000
const MOST_OTHERS = 200

const isMessage = (value: unknown): value is Message =>
  isObject(value) &&
  (value.from === "person" || value.from === "assistant") &&
  typeof value.text === "string" &&
  value.text.length <= LONGEST_MESSAGE

/** The request, or null when it isn't one the editor would send. */
export function requestOf(body: unknown): AssistRequest | null {
  if (!isObject(body) || !Array.isArray(body.messages) || !Array.isArray(body.others) || !isObject(body.resume)) return null
  const { messages, others, resume } = body
  if (messages.length === 0 || messages.length > MOST_MESSAGES || !messages.every(isMessage)) return null
  const last = messages[messages.length - 1] as Message
  if (last.from !== "person" || !last.text.trim()) return null
  if (typeof resume.id !== "string" || !isObject(resume.view) || JSON.stringify(resume.view).length > LONGEST_RESUME) return null
  if (others.length > MOST_OTHERS) return null
  if (!others.every((other) => isObject(other) && typeof other.id === "string" && typeof other.name === "string")) return null
  return {
    messages: messages.map(({ from, text }) => ({ from, text })),
    resume: { id: resume.id, view: resume.view },
    others: others.map((other) => ({ id: String(other.id).slice(0, 100), name: String(other.name).slice(0, 100) })),
  }
}
