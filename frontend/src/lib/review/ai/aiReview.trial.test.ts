// Not a test: asks the real AI services to review sample resumes and writes
// what they said to TRIAL_OUT, for tuning the prompt by reading the notes.
// Skipped unless TRIAL_OUT is set, so `npm test` and CI never run it (it costs
// money and needs keys):
//   TRIAL_ENV=<path to .env.local> TRIAL_OUT=<folder> npx vitest run aiReview.trial
// TRIAL_SAMPLES, TRIAL_PROVIDERS and TRIAL_EFFORT narrow it down.

import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { test } from "vitest"
import { pdfLayoutOf } from "@/lib/check/extraPdf"
import { viewOf } from "@/lib/check/resume"
import { readForChecks } from "@/lib/import/read"
import { readBack, render, samples } from "@/lib/import/testRender"
import { notesOf, type AiNote } from "./answer"
import { SYSTEM_PROMPT, userPrompt } from "./prompt"
import { ask, providersOf, ProviderError, type AskOptions } from "./providers"
import { unitsOf } from "./units"

const OUT = process.env.TRIAL_OUT ?? ""
const ONLY = process.env.TRIAL_PROVIDERS?.split(",")
const SAMPLES = (process.env.TRIAL_SAMPLES ?? "weak,jake,ian,deedy,swiss").split(",")
const EFFORT = (process.env.TRIAL_EFFORT ?? "low") as AskOptions["effort"]

const jake = samples.find((sample) => sample.selectedTemplate === "jake")!
// Jake's sample with the bullets a first draft has: duties, no results, buzzwords. One strong bullet is kept.
const WEAK_WORK = [
  "• Responsible for working on backend services for Google Maps\n• Helped the team with various tasks related to testing and deployment\n• Participated in code reviews and daily standups\n• Utilized cutting-edge technologies to drive synergy across teams",
  null,
  "• Taught students\n• Graded assignments and held office hours",
]
const weak = {
  ...jake,
  workExperienceSection: jake.workExperienceSection.map((entry: Record<string, unknown>, index: number) => {
    if (!WEAK_WORK[index])
      return {
        ...entry,
        workDescription:
          (entry.workDescription as string).split("\n").slice(0, 1).join("\n") +
          "\n• Assisted with fixing bugs\n• Was involved in making the app faster",
      }
    return { ...entry, workDescription: WEAK_WORK[index] }
  }),
  projectsSection: jake.projectsSection.map((entry: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(entry).map(([key, value]) =>
        key.endsWith("Description")
          ? [key, "• Made a website using HTML, CSS and JavaScript\n• Worked with a team to build a really cool app"]
          : [key, value],
      ),
    ),
  ),
}

const resumes: Record<string, Record<string, unknown>> = {
  weak,
  ...Object.fromEntries(samples.map((sample) => [sample.selectedTemplate as string, sample])),
}

// Numbers in a suggestion, outside [placeholders], that the resume doesn't have: made up.
function madeUp(note: AiNote, resume: string): string[] {
  const outside = (note.suggestion ?? "").replace(/\[[^\]]*\]/g, " ")
  return [...outside.matchAll(/\d[\d,.]*/g)].map(([number]) => number.replace(/[.,]$/, "")).filter((number) => !resume.includes(number))
}

function written(note: AiNote, resume: string): string {
  const invented = madeUp(note, resume)
  const where = note.unit ? `[${note.unit.id}]` : "[not placed]"
  const quote = note.quote ? ` “${note.quote}”` : note.unit ? " (whole line)" : ""
  return [
    `- ${note.tone === "red" ? "🔴" : "🟢"} ${where} **${note.title}**${quote}`,
    `  ${note.why}`,
    ...(note.suggestion ? [`  → ${note.suggestion}`] : []),
    ...(invented.length > 0 ? [`  ⚠ made up: ${invented.join(", ")}`] : []),
  ].join("\n")
}

test.skipIf(!OUT)("AI review trial", { timeout: 30 * 60_000 }, async () => {
  if (process.env.TRIAL_ENV) process.loadEnvFile(process.env.TRIAL_ENV)
  const providers = providersOf(process.env).filter((provider) => !ONLY || ONLY.includes(provider.name))
  if (providers.length === 0) throw new Error("No provider has keys")
  mkdirSync(OUT, { recursive: true })
  const summary: string[] = [`effort: ${EFFORT}`, ""]

  for (const name of SAMPLES) {
    const resume = resumes[name]
    if (!resume) throw new Error(`No sample named ${name}`)
    const { parsed, pages } = await readBack(await render(resume))
    const view = viewOf(resume as never)
    const read = readForChecks(parsed.lines, pdfLayoutOf(view))
    const pdf = { lines: read.parsed.lines, pages, ...read }
    const units = unitsOf(view, pdf)
    const user = userPrompt(units)
    writeFileSync(path.join(OUT, `${name}.prompt.txt`), user)

    for (const provider of providers) {
      const file = `${name}.${provider.name}`
      try {
        const asked = await ask(provider, SYSTEM_PROMPT, user, { effort: EFFORT })
        writeFileSync(path.join(OUT, `${file}.json`), JSON.stringify(asked.answer, null, 2))
        const notes = notesOf(asked.answer, units)
        const raw = (asked.answer as { notes?: unknown[] }).notes?.length ?? 0
        const red = notes.filter((note) => note.tone === "red")
        const green = notes.filter((note) => note.tone === "green")
        const unplaced = notes.filter((note) => !note.unit).length
        const unquoted = notes.filter((note) => note.unit && !note.quote).length
        const text = units.map((unit) => unit.text).join("\n")
        const invented = notes.filter((note) => madeUp(note, text).length > 0).length
        const line = `${file}: ${(asked.ms / 1000).toFixed(1)}s, tokens in ${asked.usage?.input} / out ${asked.usage?.output} (thinking ${asked.usage?.reasoning}); ${red.length} red, ${green.length} green, ${raw - notes.length} dropped, ${unplaced} not placed, ${unquoted} quote not found, ${invented} with made-up numbers`
        summary.push(line)
        writeFileSync(
          path.join(OUT, `${file}.md`),
          [
            `# ${file}`,
            "",
            line,
            "",
            "## Red",
            ...red.map((note) => written(note, text)),
            "",
            "## Green",
            ...green.map((note) => written(note, text)),
            "",
          ].join("\n"),
        )
      } catch (error) {
        summary.push(`${file}: FAILED ${error instanceof ProviderError ? `${error.status} ${error.message}` : String(error)}`)
      }
      writeFileSync(path.join(OUT, "summary.txt"), summary.join("\n") + "\n")
    }
  }
})
