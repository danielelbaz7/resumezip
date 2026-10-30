// What the AI assistant answers: a reply to the person, and the changes it
// makes to their resumes, each one of OPS. The schema is strict JSON Schema as
// OpenAI's structured outputs take it (every field required, one that can be
// empty is nullable), so one flat shape serves every action and each uses the
// fields it needs (prompt.ts says which). The answer is still untrusted:
// actionOf checks its shape, and apply.ts checks it against the resume.

import { isObject } from "@/lib/isObject"

export const OPS = [
  "set_profile",
  "edit_entry",
  "add_entry",
  "delete_entry",
  "move_entry",
  "leave_out_entry",
  "include_entry",
  "add_section",
  "add_custom_section",
  "edit_custom_section",
  "remove_section",
  "leave_out_section",
  "include_section",
  "rename_section",
  "order_sections",
  "set_choice",
  "set_template",
  "set_tune",
  "copy_section",
  "rename_resume",
] as const

export type Op = (typeof OPS)[number]

export interface Field {
  key: string
  value: string
}

export interface Action {
  op: Op
  /** The resume's id; null for the one open in the editor. */
  resume: string | null
  /** One of the editor's sections by name ("Work"), or one the person added by its ref ("extra:<key>"). */
  section: string | null
  /** An entry's id in the section. */
  entry: number | null
  fields: Field[]
  value: string | null
  /** Where an entry goes in its section, from 0. */
  position: number | null
  /** Resume ids to copy to, or section refs in their new order. */
  targets: string[]
}

export const ASSIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["actions", "reply"],
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["op", "resume", "section", "entry", "fields", "value", "position", "targets"],
        properties: {
          op: { type: "string", enum: OPS },
          resume: { type: ["string", "null"] },
          section: { type: ["string", "null"] },
          entry: { type: ["integer", "null"] },
          fields: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "value"],
              properties: { key: { type: "string" }, value: { type: "string" } },
            },
          },
          value: { type: ["string", "null"] },
          position: { type: ["integer", "null"] },
          targets: { type: "array", items: { type: "string" } },
        },
      },
    },
    reply: { type: "string", description: "What you tell the person: what you changed, or your answer." },
  },
} as const

const stringOrNull = (value: unknown) => (typeof value === "string" ? value : null)
const integerOrNull = (value: unknown) => (Number.isSafeInteger(value) ? (value as number) : null)

/** An action as the answer has it, or null when it isn't one; a missing optional field is read as empty. */
export function actionOf(value: unknown): Action | null {
  if (!isObject(value) || !OPS.includes(value.op as Op)) return null
  const fields = Array.isArray(value.fields) ? value.fields : []
  return {
    op: value.op as Op,
    resume: stringOrNull(value.resume),
    section: stringOrNull(value.section),
    entry: integerOrNull(value.entry),
    fields: fields.flatMap((field) =>
      isObject(field) && typeof field.key === "string" && typeof field.value === "string" ? [{ key: field.key, value: field.value }] : [],
    ),
    value: stringOrNull(value.value),
    position: integerOrNull(value.position),
    targets: Array.isArray(value.targets) ? value.targets.filter((target): target is string => typeof target === "string") : [],
  }
}
