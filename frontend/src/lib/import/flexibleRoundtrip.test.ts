import { expect, test } from "vitest"
import { readBack, render, samples } from "./testRender"
import { toResumeContent, unplacedKey } from "./parse"
import type { Resume } from "@/lib/resume"

const first = "11111111-1111-4111-8111-111111111111"
const second = "22222222-2222-4222-8222-222222222222"

// Long enough to wrap in every template.
const summary =
  "Engineer who builds useful tools for curious people, from the first sketch on paper to the release that ships, and who writes down what was learned on the way."
const talk =
  "First talk on accessible software, given to a room of engineers who build tools for people with low vision and for people who use screen readers every day."
const bullet =
  "Second talk on reliable systems, about how a small team keeps a busy service running through its releases, its outages and the long nights in between."

test("lines that only wrapped in the PDF are joined back up, as they were typed, and two sections with one heading stay two", async () => {
  for (const sample of samples) {
    const input: Resume = {
      selectedTemplate: sample.selectedTemplate,
      profileSection: { fullName: "Mara Lin", summary },
      extraSections: {
        [first]: { kind: "text", heading: "Presentations", text: talk },
        [second]: { kind: "list", heading: "Presentations", bullets: `• ${bullet}\n• Third talk.` },
      },
      sectionOrder: [`extra:${first}`, `extra:${second}`],
    }
    const { parsed } = await readBack(await render(input))
    const keepAs = Object.fromEntries(
      parsed.unplaced.map((group, index) => [unplacedKey(group), index === 0 ? ("text" as const) : ("list" as const)]),
    )
    const kept = toResumeContent(parsed, new Set(), { keepAs })
    expect(kept.profileSection.summary, sample.selectedTemplate).toBe(summary)
    expect(Object.values(kept.extraSections ?? {}), sample.selectedTemplate).toEqual([
      { kind: "text", heading: "Presentations", text: talk },
      { kind: "list", heading: "Presentations", bullets: `• ${bullet}\n• Third talk.` },
    ])
  }
})
