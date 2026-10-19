import { existsSync } from "node:fs"
import path from "node:path"
import { expect, test } from "vitest"
import { CODE } from "./code"

const ROOT = path.join(import.meta.dirname, "../../../..")

test("the open-source page only points to code that's there", () => {
  for (const file of Object.values(CODE)) expect(existsSync(path.join(ROOT, file)), file).toBe(true)
})
