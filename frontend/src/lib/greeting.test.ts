import { describe, expect, test } from "vitest"
import { firstName, timeOfDay } from "./greeting"

describe("timeOfDay", () => {
  test("is morning from 5am, afternoon from noon and evening from 6pm through the night", () => {
    expect([4, 5, 11, 12, 17, 18, 23, 0].map(timeOfDay)).toEqual([
      "Good evening",
      "Good morning",
      "Good morning",
      "Good afternoon",
      "Good afternoon",
      "Good evening",
      "Good evening",
      "Good evening",
    ])
  })
})

describe("firstName", () => {
  test("is the first word of the name", () => {
    expect(firstName("Marcus Bell")).toBe("Marcus")
    expect(firstName("  Ada   Lovelace ")).toBe("Ada")
    expect(firstName("Grace")).toBe("Grace")
    expect(firstName("José-María López")).toBe("José-María")
  })

  test("skips a title before the name", () => {
    expect(firstName("Dr. Ada Lovelace")).toBe("Ada")
    expect(firstName("prof grace hopper")).toBe("grace")
  })

  test("drops a comma after it", () => {
    expect(firstName("Marcus, Bell")).toBe("Marcus")
  })

  test("is empty without a name, or with what isn't one", () => {
    expect(firstName("")).toBe("")
    expect(firstName("   ")).toBe("")
    expect(firstName("Dr.")).toBe("")
    expect(firstName(undefined)).toBe("")
    expect(firstName(42)).toBe("")
  })
})
