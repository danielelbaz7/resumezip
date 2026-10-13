import { describe, expect, test } from "vitest"
import { asSaved } from "./testResume"
import { fileNameOf } from "./saveFile"

describe("fileNameOf", () => {
  test("names a resume still called “Untitled resume” after the person", () => {
    expect(fileNameOf({ resumeTitle: "Untitled resume", profileSection: { fullName: "Jake Ryan" } }, "pdf")).toBe("Jake Ryan resume.pdf")
    expect(fileNameOf({ resumeTitle: "Untitled resume 2", profileSection: { fullName: " Jake Ryan " } }, "docx")).toBe(
      "Jake Ryan resume.docx",
    )
    expect(fileNameOf({ resumeTitle: "", profileSection: { fullName: "Jake Ryan" } }, "pdf")).toBe("Jake Ryan resume.pdf")
  })

  test("keeps a name the person chose", () => {
    expect(fileNameOf({ resumeTitle: "Ada's resume", profileSection: { fullName: "Ada Lovelace" } }, "pdf")).toBe("Ada's resume.pdf")
    expect(fileNameOf({ resumeTitle: "Untitled resume draft", profileSection: { fullName: "Ada Lovelace" } }, "pdf")).toBe(
      "Untitled resume draft.pdf",
    )
  })

  test("falls back to the title, or “resume”, without a full name", () => {
    expect(fileNameOf({ resumeTitle: "Untitled resume" }, "pdf")).toBe("Untitled resume.pdf")
    expect(fileNameOf({}, "json")).toBe("resume.json")
    expect(fileNameOf(asSaved({ resumeTitle: "Untitled resume", profileSection: { fullName: 42 } }), "pdf")).toBe("Untitled resume.pdf")
  })
})
