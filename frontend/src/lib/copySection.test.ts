import { describe, expect, test } from "vitest"
import { copiedSection } from "./copySection"
import { memoryStorage } from "./memoryStorage"
import type { Resume } from "./resume"
import { keyOf } from "./resumeKeys"
import { readResume } from "./resumeStorage"
import { createResumeStore } from "./resumeStore"

const KEY = "0b7c8f8e-3c2a-4b8e-9d47-2f1f6f0d9a11"

const source: Resume = {
  id: "s",
  sectionOrder: ["Education", "Work", "Skills", "Projects", `extra:${KEY}`],
  sectionsChosen: true,
  headings: { projects: "Things I built" },
  projectLinks: "title",
  projectsSection: [
    { id: 1, projectName: "Ledger", projectDescription: "• Stored balances", underlineName: true },
    { id: 2, projectName: "Gitlytics" },
  ],
  extraSections: { [KEY]: { kind: "list", heading: "Talks", bullets: "• RustConf 2026" } },
}

const target: Resume = {
  id: "t",
  sectionOrder: ["Education", "Work", "Skills"],
  sectionsChosen: true,
  headings: {},
  projectsSection: [{ id: 4, projectName: "Old one" }],
}

describe("a section copied to another resume", () => {
  test("adds its entries after the other's, with ids of their own there, and shows the section", () => {
    const copy = copiedSection(source, target, "Projects", "add")!
    expect(copy.changes.projectsSection).toEqual([
      { id: 4, projectName: "Old one" },
      { id: 5, projectName: "Ledger", projectDescription: "• Stored balances", underlineName: true },
      { id: 6, projectName: "Gitlytics" },
    ])
    // It shows already, with an entry.
    expect(copy.changes.sectionOrder).toBeUndefined()
    const none = copiedSection(source, { ...target, projectsSection: [] }, "Projects", "add")!
    expect(none.changes.sectionOrder).toEqual(["Education", "Work", "Skills", "Projects"])
    // The other has no heading or choice of its own, so it takes these.
    expect(copy.changes.headings).toEqual({ projects: "Things I built" })
    expect(copy.changes.projectLinks).toBe("title")
    expect(copy.paths).toEqual(["projectsSection", "headings.projects", "projectLinks"])
  })

  test("copies only the entries chosen, in place of the other's when it replaces them", () => {
    const copy = copiedSection(source, target, "Projects", "replace", [2])!
    expect(copy.changes.projectsSection).toEqual([{ id: 5, projectName: "Gitlytics" }])
  })

  test("keeps the other's own heading and choice when it adds, and takes these when it replaces", () => {
    const named: Resume = { ...target, headings: { projects: "Projects" }, projectLinks: "show" }
    const added = copiedSection(source, named, "Projects", "add")!
    expect(added.changes.headings).toBeUndefined()
    expect(added.changes.projectLinks).toBeUndefined()
    const replaced = copiedSection(source, named, "Projects", "replace")!
    expect(replaced.changes.headings).toEqual({ projects: "Things I built" })
    expect(replaced.changes.projectLinks).toBe("title")
  })

  test("leaves the entries it copies as they were", () => {
    const copy = copiedSection(source, target, "Projects", "add")!
    ;(copy.changes.projectsSection as { projectName?: string }[])[1].projectName = "Changed"
    expect(source.projectsSection![0].projectName).toBe("Ledger")
  })

  test("is nothing with no entries to copy", () => {
    expect(copiedSection(source, target, "Work", "add")).toBeNull()
    expect(copiedSection(source, target, "Projects", "add", [])).toBeNull()
    expect(copiedSection(source, target, "Nonsense" as never, "add")).toBeNull()
  })
})

describe("a section the person added, copied to another resume", () => {
  test("is a new section there when it has none of that kind and heading", () => {
    const copy = copiedSection(source, target, `extra:${KEY}`, "add")!
    const [added] = Object.keys(copy.changes.extraSections!)
    expect(added).not.toBe(KEY)
    expect(copy.changes.extraSections![added]).toEqual({ kind: "list", heading: "Talks", bullets: "• RustConf 2026" })
    expect(copy.changes.sectionOrder).toEqual(["Education", "Work", "Skills", "Projects", `extra:${added}`])
  })

  test("goes into the one with its heading, after what's there or in its place", () => {
    const own = "5e1d7c2a-8b3f-4a6e-9c01-7d2e4f6a8b90"
    const talks: Resume = { ...target, extraSections: { [own]: { kind: "list", heading: " talks", bullets: "• JSConf 2025" } } }
    expect(copiedSection(source, talks, `extra:${KEY}`, "add")).toEqual({
      changes: { extraSections: { [own]: { kind: "list", heading: " talks", bullets: "• JSConf 2025\n• RustConf 2026" } } },
      paths: [`extraSections.${own}`],
    })
    expect(copiedSection(source, talks, `extra:${KEY}`, "replace")!.changes.extraSections![own]).toEqual({
      kind: "list",
      heading: " talks",
      bullets: "• RustConf 2026",
    })
  })
})

describe("copying a section in the store", () => {
  test("changes the resumes chosen, saved straight away, and not the one it's from", () => {
    const storage = memoryStorage(Object.fromEntries([source, target].map((resume) => [keyOf(resume.id!), JSON.stringify(resume)])))
    const store = createResumeStore()
    store.load(storage)
    expect(store.copySection("s", "Projects", ["t", "s", "missing"], "add", [1])).toBe(1)
    const saved = readResume(storage.getItem(keyOf("t"))!).resume!
    expect(saved.projectsSection?.map((entry) => entry.projectName)).toEqual(["Old one", "Ledger"])
    expect(store.getState().resumes.s.projectsSection).toHaveLength(2)
  })
})
