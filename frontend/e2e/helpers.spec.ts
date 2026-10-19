import { expect, test } from "./test"
import { cutShort, thrownText } from "./helpers"

/** An error as Playwright hands on one a page threw: split at the first colon, the character after it dropped. */
function thrown(text: string): Error {
  const colon = text.indexOf(":")
  const error = new Error(text.slice(colon + 2))
  error.name = text.slice(0, colon)
  return error
}

// Safari threw this as pdf.js read the preview's PDF when a test reloaded the
// editor, and it was counted as a real error (extra-sections.spec.ts).
test("a PDF's load that Safari cuts short as the page is left isn't counted as an error", () => {
  const error = thrown(
    "XMLHttpRequest cannot load blob:http://localhost:3100/6dc082c3-17a5-4c68-9dc6-dfca744b255e due to access control checks.",
  )
  expect(error.name).toBe("XMLHttpRequest cannot load blob")
  expect(cutShort(thrownText(error))).toBe(true)
})

test("an XMLHttpRequest Safari refuses for anything but a blob: URL still counts", () => {
  expect(cutShort(thrownText(thrown("XMLHttpRequest cannot load https://example.com/ due to access control checks.")))).toBe(false)
})
