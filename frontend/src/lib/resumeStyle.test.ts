import { describe, expect, test } from "vitest"
import { memoryStorage } from "./memoryStorage"
import type { Resume } from "./resume"
import { keyOf } from "./resumeKeys"
import { readResume } from "./resumeStorage"
import { createResumeStore } from "./resumeStore"
import { restyled, styleOf } from "./resumeStyle"

const styled: Resume = {
  id: "a",
  selectedTemplate: "swiss",
  tune: { size: 0.9, margin: 0.8, paper: "a4" },
  workFirst: "role",
  projectLinks: "title",
}
const plain: Resume = { id: "b", selectedTemplate: "jake" }

describe("a resume's style", () => {
  test("is its template, Fine-tune and section choices", () => {
    expect(styleOf(styled)).toEqual({
      template: "swiss",
      tune: { size: 0.9, margin: 0.8, paper: "a4" },
      choices: { workFirst: "role", projectLinks: "title" },
    })
    expect(styleOf({})).toEqual({ template: "jake", tune: null, choices: { workFirst: undefined, projectLinks: undefined } })
  })

  test("put on another sets all of it, and takes away choices that one doesn't have", () => {
    expect(restyled(plain, styleOf(styled))).toEqual({
      changes: { selectedTemplate: "swiss", tune: { size: 0.9, margin: 0.8, paper: "a4" }, workFirst: "role", projectLinks: "title" },
      paths: ["selectedTemplate", "tune.size", "tune.margin", "tune.paper", "workFirst", "projectLinks"],
    })
    const back = restyled(styled, styleOf(plain))!
    expect(back.changes).toEqual({ selectedTemplate: "jake", tune: null, workFirst: undefined, projectLinks: undefined })
  })

  test("a template alone keeps each resume's Fine-tune and choices", () => {
    expect(restyled(styled, { template: "mono" })).toEqual({ changes: { selectedTemplate: "mono" }, paths: ["selectedTemplate"] })
  })

  test("is nothing to change when it's the style the resume has", () => {
    expect(restyled(styled, styleOf(styled))).toBeNull()
    expect(restyled(plain, { template: "jake" })).toBeNull()
  })
})

describe("restyling in the store", () => {
  test("saves each resume's new style straight away, and gives back the old ones to put back", () => {
    const storage = memoryStorage(Object.fromEntries([styled, plain].map((resume) => [keyOf(resume.id!), JSON.stringify(resume)])))
    const store = createResumeStore()
    store.load(storage)
    const before = store.restyle({ a: { template: "mono" }, b: { template: "mono" }, missing: { template: "mono" } })
    expect(Object.keys(before)).toEqual(["a", "b"])
    expect(readResume(storage.getItem(keyOf("b"))!).resume!.selectedTemplate).toBe("mono")

    store.restyle(before)
    expect(readResume(storage.getItem(keyOf("a"))!).resume).toMatchObject({ selectedTemplate: "swiss", workFirst: "role" })
    expect(readResume(storage.getItem(keyOf("b"))!).resume!.selectedTemplate).toBe("jake")
  })
})
