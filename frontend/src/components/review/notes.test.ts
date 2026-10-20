// The pen each of the checker's findings is drawn in on the page.

import { expect, test } from "vitest"
import { inkOf } from "./notes"

test("a finding is drawn in its tier's pen, so its mark is the color of its dot in the Check panel", () => {
  expect(inkOf({ level: "fix" })).toBe("fix")
  expect(inkOf({ level: "look" })).toBe("look")
  // Advice that doesn't count is optional, whatever its level.
  expect(inkOf({ level: "look", advisory: true })).toBe("optional")
  expect(inkOf({ level: "fix", advisory: true })).toBe("optional")
})
