import { readFileSync } from "node:fs"
import { expect, test } from "vitest"

// The home page's clip (HeroVideo.tsx), as it's served. A browser can't
// play an MP4 until it has the file's index (its moov box), and a file
// exported from a video editor usually has it at the end.
const CLIPS = ["interview.mp4"]

interface Box {
  type: string
  body: Uint8Array
}

/** The boxes an MP4 file, or a box's body, is made of: each a 32-bit size and a 4-letter type, then its contents. */
function boxes(data: Uint8Array): Box[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const found: Box[] = []
  for (let at = 0; at < data.length;) {
    // 0 and 1 mean "to the end" and "a 64-bit size follows", which these files don't need.
    const size = view.getUint32(at)
    if (size < 8) throw new Error(`Box size ${size} isn't handled`)
    found.push({ type: String.fromCharCode(...data.subarray(at + 4, at + 8)), body: data.subarray(at + 8, at + size) })
    at += size
  }
  return found
}

const child = (box: Box, type: string) => boxes(box.body).find((inner) => inner.type === type)!
const clip = (name: string) => boxes(readFileSync(`public/video/${name}`))
const tracks = (name: string) => boxes(clip(name).find((box) => box.type === "moov")!.body).filter((box) => box.type === "trak")

test.each(CLIPS)("%s has its index before its frames, so it can start playing as it downloads", (name) => {
  const types = clip(name).map((box) => box.type)
  expect(types.indexOf("moov")).toBeGreaterThan(-1)
  expect(types.indexOf("moov")).toBeLessThan(types.indexOf("mdat"))
})

test.each(CLIPS)("%s is video alone, since it always plays muted", (name) => {
  // A track's handler says what's in it: "vide" for video, "soun" for sound.
  const handlers = tracks(name).map((track) => String.fromCharCode(...child(child(track, "mdia"), "hdlr").body.subarray(8, 12)))
  expect(handlers).toEqual(["vide"])
})
