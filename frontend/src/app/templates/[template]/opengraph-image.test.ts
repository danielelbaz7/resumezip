import { createHash } from "node:crypto"
import { expect, test } from "vitest"
import { SHARE_IMAGE_SIZE } from "@/lib/site"
import { TEMPLATES, templateSlug } from "@/lib/templates"
import Image, { contentType, size } from "./opengraph-image"

/** A PNG's width and height, from its header. */
function pngSize(data: Buffer) {
  expect(data.subarray(1, 4).toString("latin1")).toBe("PNG")
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

const card = async (slug: string) => {
  const response = await Image({ params: { template: slug } })
  expect(response.headers.get("content-type")).toBe(contentType)
  return Buffer.from(await response.arrayBuffer())
}

// Its page names the card with SHARE_IMAGE_SIZE, and link previews lay it out
// at that size before they fetch it.
test("each template's share card is a PNG of the size its page says", async () => {
  expect(size).toEqual(SHARE_IMAGE_SIZE)
  const hashes = new Set<string>()
  for (const template of TEMPLATES) {
    const data = await card(templateSlug(template))
    expect(pngSize(data), template.name).toEqual(SHARE_IMAGE_SIZE)
    hashes.add(createHash("sha256").update(data).digest("hex"))
  }
  // Each shows its own template, not one picture for them all.
  expect(hashes.size).toBe(TEMPLATES.length)
}, 120_000)
