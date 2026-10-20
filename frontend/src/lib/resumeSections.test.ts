import { afterEach, describe, expect, test, vi } from "vitest"
import { CORE_SECTIONS, SECTION_NAMES } from "@/components/editor/sections"
import { memoryStorage } from "./memoryStorage"
import { printedResume, hasLeftOut } from "./leftOut"
import { AttachmentError, fromAttachment, MAX_ENTRIES, toAttachment, TooLongError } from "./resumeFile"
import { changedPaths, keyOf, readKeptAside, readResume, readSaved } from "./resumeStorage"
import { createResumeStore } from "./resumeStore"
import type { Resume } from "./resume"
import { extraHasBody, extrasOf, readExtraSections, resolveSections, type ExtraSection, type ExtraSections } from "./resumeSections"
import { asSaved } from "./testResume"

const a = "11111111-1111-4111-8111-111111111111"
const b = "22222222-2222-4222-8222-222222222222"
const c = "33333333-3333-4333-8333-333333333333"
const note = { kind: "text", heading: "Note", text: "Hello" } as const satisfies ExtraSection
const text = { kind: "text", heading: "Other", text: "First paragraph.\n\n○ Literal prose." } as const satisfies ExtraSection
const resume: Resume = {
  id: "r",
  resumeTitle: "Example",
  profileSection: { fullName: "Ada" },
  extraSections: {
    [c]: note,
    [a]: text,
    [b]: { kind: "list", heading: "Other", bullets: "• Public\n○ SECRET\n• Last" },
  },
  sectionOrder: ["Work", `extra:${b}`, `extra:${c}`, `extra:${a}`],
}
const envelope = (content: unknown, version = 2) => JSON.stringify({ format: "resumezip", version, resume: content })
const tabs = (content: Record<string, unknown> = resume) => {
  const storage = memoryStorage({ [keyOf("r")]: JSON.stringify(content) })
  const first = createResumeStore()
  first.load(storage)
  const second = createResumeStore()
  second.load(storage)
  return { storage, first, second, saved: () => readResume(storage.getItem(keyOf("r"))!).resume! }
}
afterEach(() => vi.useRealTimers())

// A section by its key, as the kind the test expects it to be.
function extra<Kind extends ExtraSection["kind"]>(resume: { extraSections?: ExtraSections } | null | undefined, key: string, kind: Kind) {
  const section = resume?.extraSections?.[key]
  if (section?.kind !== kind) throw new Error(`expected a ${kind} section at ${key}`)
  return section as ExtraSection & { kind: Kind }
}

describe("reading a resume's sections", () => {
  test("the saved order comes first, with each section once and only if it's there, and the resume isn't changed", () => {
    const input = { sectionOrder: ["Work", "Work", "extra:missing", `extra:${a}`], extraSections: { [a]: text, [c]: note } }
    const before = JSON.stringify(input)
    expect(resolveSections(input)).toEqual(["Work", `extra:${a}`, ...CORE_SECTIONS.filter((name) => name !== "Work"), `extra:${c}`])
    expect(JSON.stringify(input)).toBe(before)
    expect(resolveSections({})).toEqual(CORE_SECTIONS)
  })
  test("an optional section shows when it's in the saved order or has entries, and a new resume starts without them", () => {
    expect(resolveSections({ sectionOrder: ["Awards", ...CORE_SECTIONS], sectionsChosen: true })).toEqual(["Awards", ...CORE_SECTIONS])
    expect(resolveSections({ publicationsSection: [{ id: 1 }] })).toEqual([...CORE_SECTIONS, "Publications"])
    expect(resolveSections({ publicationsSection: [] })).toEqual(CORE_SECTIONS)
    const store = createResumeStore()
    store.load(memoryStorage({}))
    const id = store.create("New", "professional")
    expect(store.getState().resumes[id].sectionsChosen).toBe(true)
    expect(resolveSections(store.getState().resumes[id])).toEqual(CORE_SECTIONS)
  })
  test("a resume from before sections were added from the list shows an optional one only with entries", () => {
    // Its order listed every section by default.
    const old = { sectionOrder: [...SECTION_NAMES], awardsSection: [{ id: 1 }], publicationsSection: [] }
    expect(resolveSections(old)).toEqual([...CORE_SECTIONS, "Awards"])
    expect(resolveSections({ ...old, sectionsChosen: true })).toEqual(SECTION_NAMES)
  })
  test("an older resume's first change keeps only the sections it shows, so one added after stays while empty", () => {
    vi.useFakeTimers()
    const { first, saved } = tabs({ id: "r", sectionOrder: [...SECTION_NAMES], awardsSection: [{ id: 1, awardName: "Prize" }] })
    first.edit("r", "resumeTitle", "Renamed")
    expect(first.getState().resumes.r).toMatchObject({ sectionOrder: [...CORE_SECTIONS, "Awards"], sectionsChosen: true })
    expect(first.addSection("r", "Publications")).toBe("Publications")
    // Emptied, Awards stays: the person has it on the resume.
    first.edit("r", "awardsSection", [])
    expect(resolveSections(first.getState().resumes.r)).toEqual([...CORE_SECTIONS, "Awards", "Publications"])
    vi.runAllTimers()
    expect(saved()).toMatchObject({ sectionOrder: [...CORE_SECTIONS, "Awards", "Publications"], sectionsChosen: true })
  })
  test("a section's missing title or text is read as empty, and one with a wrong key, kind or field isn't read", () => {
    expect(readExtraSections({ [c]: { kind: "text" } })).toEqual({
      complete: true,
      sections: { [c]: { kind: "text", heading: "", text: "" } },
    })
    for (const bad of [
      null,
      [],
      { summary: { kind: "text", text: "x" } },
      // The summary was a section of its own once; it's the profile's now.
      { summary: { kind: "summary", heading: "Summary", text: "x" } },
      { [a]: { kind: "summary", text: "x" } },
      { bad: text },
      { [c]: { ...note, text: 4 } },
      { certifications: { kind: "certifications", heading: "Certifications", entries: [] } },
    ])
      expect(readExtraSections(bad).complete).toBe(false)
  })
  test("each map of sections is read once, and a new map afresh", () => {
    const read = extrasOf(resume)
    expect(extrasOf(resume)).toBe(read)
    expect(extrasOf({ ...resume, extraSections: { ...resume.extraSections } })).not.toBe(read)
    expect(extrasOf({ extraSections: "damaged" })).toEqual({})
  })
  test("a list of only empty or left-out bullets has nothing to print, and a text section prints ○ as written", () => {
    expect(extraHasBody({ kind: "list", heading: "x", bullets: "○ Secret\n• " })).toBe(false)
    expect(extraHasBody({ kind: "text", heading: "x", text: "○ Literal" })).toBe(true)
  })
})

describe("changing sections, in one tab or two", () => {
  test("opening a resume saved before there were added sections saves nothing, and gives it none", () => {
    vi.useFakeTimers()
    const { first, storage } = tabs({ id: "r", sectionOrder: ["Work"] })
    const write = vi.spyOn(storage, "setItem")
    first.flush()
    vi.runAllTimers()
    expect(first.getState().resumes.r).not.toHaveProperty("extraSections")
    expect(write).not.toHaveBeenCalled()
  })
  test("each section added has a key of its own, and each change updates once", () => {
    const { first } = tabs({ id: "r" })
    const listener = vi.fn()
    first.subscribe(listener)
    const one = first.addSection("r", "text")!
    const two = first.addSection("r", "text")!
    expect(two).not.toBe(one)
    expect(listener).toHaveBeenCalledTimes(2)
    const key = one.slice("extra:".length)
    first.editSection("r", key, { text: "Registered", leftOut: true })
    expect(listener).toHaveBeenCalledTimes(3)
    expect(extra(first.getState().resumes.r, key, "text")).toMatchObject({ text: "Registered", leftOut: true })
    first.deleteSection("r", key)
    expect(first.getState().resumes.r.extraSections).not.toHaveProperty(key)
    expect(resolveSections(first.getState().resumes.r)).not.toContain(one)
    first.flush()
  })
  test("a section is added at the end once, and deleting it takes its entries and title", () => {
    const { first } = tabs({ id: "r", sectionOrder: [...CORE_SECTIONS] })
    expect(first.addSection("r", "Awards")).toBe("Awards")
    expect(first.addSection("r", "Awards")).toBe("Awards")
    expect(resolveSections(first.getState().resumes.r)).toEqual([...CORE_SECTIONS, "Awards"])
    first.edit("r", "awardsSection", [{ id: 1, awardName: "Prize" }])
    first.edit("r", "headings", { awards: "Honors" })
    first.removeSection("r", "Awards")
    const resume = first.getState().resumes.r
    expect(resolveSections(resume)).toEqual(CORE_SECTIONS)
    expect(resume.awardsSection).toEqual([])
    expect(resume.headings).toEqual({})
    // One the resume started with can be deleted too, and is added back at the end.
    first.removeSection("r", "Work")
    expect(resolveSections(first.getState().resumes.r)).toEqual(CORE_SECTIONS.filter((name) => name !== "Work"))
    first.addSection("r", "Work")
    expect(resolveSections(first.getState().resumes.r)).toEqual([...CORE_SECTIONS.filter((name) => name !== "Work"), "Work"])
    first.flush()
  })
  test("changing one section leaves the others as they were, so only it counts as changed", () => {
    const { first } = tabs()
    const before = first.getState().resumes.r.extraSections
    first.editSection("r", a, { heading: "Renamed" })
    const after = first.getState().resumes.r.extraSections
    expect(after?.[c]).toBe(before?.[c])
    expect(changedPaths("extraSections", before, after)).toEqual([`extraSections.${a}`])
    first.flush()
  })
  test("an edit that changes nothing, or to a section or resume that isn't there, changes nothing", () => {
    const { first } = tabs()
    const before = first.getState()
    first.editSection("missing", a, { heading: "Renamed" })
    first.editSection("r", "44444444-4444-4444-8444-444444444444", { heading: "Renamed" })
    first.editSection("r", a, { heading: text.heading, text: text.text })
    // A list has no text, and a text section no bullets.
    first.editSection("r", b, { text: "Not a list's" })
    first.editSection("r", a, { bullets: "• Not a text's" })
    expect(first.getState()).toBe(before)
  })
  test("changes in two tabs to different sections are both kept, and to the same one the last saved wins", () => {
    const { first, second, saved } = tabs()
    first.editSection("r", a, { text: "A" })
    second.editSection("r", b, { bullets: "• B" })
    first.flush()
    second.flush()
    expect(extra(saved(), a, "text").text).toBe("A")
    expect(extra(saved(), b, "list").bullets).toBe("• B")
    first.editSection("r", a, { text: "First" })
    second.editSection("r", a, { text: "Second" })
    first.flush()
    second.flush()
    expect(extra(saved(), a, "text").text).toBe("Second")
  })
  test("sections added in two tabs at once are both kept", () => {
    const { first, second, saved } = tabs({ id: "r" })
    const one = first.addSection("r", "text")!
    const two = second.addSection("r", "list")!
    first.flush()
    second.flush()
    expect(resolveSections(saved())).toContain(one)
    expect(resolveSections(saved())).toContain(two)
  })
  test("a section deleted in one tab stays deleted when another tab saves other changes, and comes back if that tab changed it", () => {
    const { first, second, saved } = tabs()
    first.deleteSection("r", a)
    first.flush()
    second.editSection("r", b, { heading: "New" })
    second.flush()
    expect(saved().extraSections).not.toHaveProperty(a)
    const other = tabs()
    other.second.editSection("r", a, { text: "pending" })
    other.first.deleteSection("r", a)
    other.first.flush()
    other.second.flush()
    expect(extra(other.saved(), a, "text").text).toBe("pending")
  })
  test("replacing a resume with a file leaves only the file's added sections, or none", () => {
    const { first } = tabs()
    first.replace("r", fromAttachment(envelope({ profileSection: {} }, 1))!, "pdf")
    expect(first.getState().resumes.r.extraSections).toEqual({})
    first.replace("r", resume, "pdf")
    first.replace("r", fromAttachment(envelope({ extraSections: { [c]: note } }))!, "pdf")
    expect(Object.keys(first.getState().resumes.r?.extraSections ?? {})).toEqual([c])
  })
})

describe("added sections in a file, and saved in this browser", () => {
  test("a PDF brings back its added sections, empty ones too, without what's left out or kept only in this browser", () => {
    // With a field the editor doesn't save, which mustn't reach the file either.
    const attachment = toAttachment(asSaved({ ...resume, resumeTag: "SECRET", checker: { token: "SECRET" } }))
    expect(JSON.parse(attachment).version).toBe(2)
    expect(attachment).not.toContain("SECRET")
    expect(attachment).not.toContain("leftOut")
    expect(fromAttachment(attachment)?.extraSections?.[a]).toEqual(text)
    const empty = toAttachment({ extraSections: { [c]: { ...note, text: "" } } })
    expect(JSON.parse(empty).version).toBe(2)
    expect(extra(fromAttachment(empty), c, "text").text).toBe("")
  })
  test("left-out sections and lines are removed before the version is chosen", () => {
    const list: ExtraSection = { kind: "list", heading: "Other", bullets: "○ SECRET" }
    const input: Resume = { extraSections: { [c]: { ...note, leftOut: true }, [b]: list } }
    expect(hasLeftOut(input)).toBe(true)
    expect(toAttachment(input)).not.toContain("SECRET")
    expect(JSON.parse(toAttachment(input)).version).toBe(2)
    input.extraSections = { ...input.extraSections, [b]: { ...list, leftOut: true } }
    expect(JSON.parse(toAttachment(input)).version).toBe(1)
    expect(printedResume(input).extraSections).toEqual({})
  })
  test("a section twice in a file's order is listed once, and a newer or damaged file isn't opened", () => {
    const content = fromAttachment(envelope({ extraSections: { [c]: note }, sectionOrder: [`extra:${c}`, `extra:${c}`, "Work"] }))!
    expect(content.sectionOrder?.slice(0, 2)).toEqual([`extra:${c}`, "Work"])
    for (const file of [
      envelope({}, 3),
      envelope({ extraSections: { [c]: { ...note, text: 4 } } }),
      envelope({ extraSections: {}, sectionOrder: [`extra:${a}`] }),
      '{"format":"resumezip","version":2,',
    ])
      expect(() => fromAttachment(file)).toThrow(AttachmentError)
  })
  test("the limit on entries counts sections too", () => {
    const extraSections = Object.fromEntries(
      Array.from({ length: MAX_ENTRIES + 1 }, (_, index) => [`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, text]),
    )
    expect(() => fromAttachment(envelope({ extraSections }))).toThrow(TooLongError)
  })
  test("a resume with a section that can't be read is kept aside before the rest is used, or left as it is if there's no room", () => {
    const raw = JSON.stringify({ ...resume, extraSections: { [a]: text, [c]: { kind: "text", text: 4 } }, future: "kept" })
    const storage = memoryStorage({ [keyOf("r")]: raw })
    const saved = readSaved(storage, "r")
    expect(saved.resume).toHaveProperty("future", "kept")
    expect(saved.resume?.extraSections).toEqual({ [a]: text })
    expect(readKeptAside(storage)).toEqual([raw])
    const blocked = memoryStorage({ [keyOf("r")]: raw })
    vi.spyOn(blocked, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    expect(readSaved(blocked, "r").status).toBe("full")
    expect(blocked.getItem(keyOf("r"))).toBe(raw)
  })
  test("a section with fields from a newer version is kept aside before this one saves without them", () => {
    const raw = JSON.stringify({ ...resume, extraSections: { [c]: { ...note, futureNotes: "saved information" } } })
    const storage = memoryStorage({ [keyOf("r")]: raw })
    expect(readResume(raw).complete).toBe(false)
    readSaved(storage, "r")
    expect(readKeptAside(storage)).toEqual([raw])
  })
})
