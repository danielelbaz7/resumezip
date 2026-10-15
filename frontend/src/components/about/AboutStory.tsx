"use client"

import type React from "react"
import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from "react"
import { ArrowUpRight } from "lucide-react"
import LiquidLens from "@/components/LiquidLens"
import { INK_PILL } from "@/components/pills"
import EmailContact from "@/components/site/EmailContact"
import { StartWritingLink } from "@/components/site/StartWriting"
import { BEATS, STORY_LENGTH, glide, in2, lerp, out3, smooth, span, storyAt } from "./motion"
import { CLOUDS, GRASS_SINK, cloudAt, camera, cover, grassDropAt, meadowAt, skyAt } from "./scene"
import { FRAME, type FolderLayout, layoutFolder } from "./folder"
import StoryFile, { type StoryFileHandle } from "./StoryFile"

/** What our resume says, for screen readers: the story shows it as a picture. */
const OWN_RESUME =
  "resumezip’s own resume: a resume builder in your own browser since March 2025, with no account, that has kept 0 copies of anyone’s resume."

// What's marked on our resume, said in words. Each has to stay true of the app.
const PROMISES = [
  { title: "Free", text: "Every template and every download. No ads, no paid plans." },
  { title: "Private", text: "Your resume stays on your computer. No account, and no copy on a server." },
  { title: "Open source", text: "All of the code is on GitHub, under the MIT license, for anyone to check." },
]

// The pictures' sizes, so the stage can be laid out before they arrive. The sky's comes from
// the picture itself once it has loaded, as it can change with the site's sky.
const SKY = {
  wide: { src: "/backgrounds/sky-wide.webp", width: 1916, height: 821 },
  tall: { src: "/backgrounds/sky-tall.webp", width: 841, height: 1870 },
}
const MEADOW = { width: 1672, height: 941 }
const CLOUD_RATIO = 941 / 1672
const GRASS_RATIO = 941 / 1672
const EDITOR_RATIO = 1278 / 2088
// The header's strip, which the stage's things keep under.
const HEADER = 78

// Visitors who ask for less motion get the story as still sections.
const lessMotion = (onChange: () => void) => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)")
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
const useLessMotion = () =>
  useSyncExternalStore(
    lessMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  )

/**
 * The About page as a story the scroll plays, on a stage pinned to the screen:
 * from the first screen (`hero`) the camera sinks into the sky, three clouds
 * gather, our own resume rises out of them in its folder and what resumezip
 * promises is marked on it by hand; then the story drops out of the clouds to a
 * meadow, where the editor rises out of the grass with the way in.
 */
export default function AboutStory({ hero }: { hero: React.ReactNode }) {
  return useLessMotion() ? <StillStory hero={hero} /> : <MovingStory hero={hero} />
}

function Promises() {
  return (
    <section className="sr-only" aria-labelledby="our-resume">
      <h2 id="our-resume">Here’s our resume</h2>
      <p>{OWN_RESUME}</p>
      <ul>
        {PROMISES.map((promise) => (
          <li key={promise.title}>
            {promise.title}: {promise.text}
          </li>
        ))}
      </ul>
    </section>
  )
}

interface WayInProps {
  ref?: RefObject<HTMLElement | null>
  copyRef?: RefObject<HTMLDivElement | null>
  onFocus?: () => void
  /** Where /about#contact lands, when it's here rather than at the story's end. */
  contactId?: string
}

/** The way in, at the end: over the editor, in the site's frosted glass, with the address to write to. */
function WayIn({ ref, copyRef, onFocus, contactId }: WayInProps) {
  return (
    <section ref={ref} aria-labelledby="way-in" className="story-cta glass glass-float" onFocus={onFocus}>
      <span aria-hidden="true" className="story-cta-shadow" />
      <LiquidLens bevel={26} strength={1.25} />
      <div ref={copyRef} className="story-cta-copy">
        <p className="label-mono text-ink-2">Your turn</p>
        <h2 id="way-in" className="mt-3 text-balance font-serif text-[clamp(36px,3.5vw,50px)] leading-[1.02] tracking-[-0.035em]">
          Your resume, on <em className="text-accent">your own computer.</em>
        </h2>
        <p className="mt-3.5 text-pretty text-[15.5px] leading-normal text-ink-2 sm:text-[17px]">
          Every template is free, and your resume stays in your browser.
        </p>
        <StartWritingLink className={`${INK_PILL} mt-6`} preloadOnHover>
          Start writing <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </StartWritingLink>
        <div id={contactId} className="mt-6 border-t border-ink/10 pt-5">
          <h3 className="sr-only">Get in touch</h3>
          <p className="mb-3 text-sm text-ink-2">Found a bug or have an idea? I read every message.</p>
          <EmailContact compact />
        </div>
      </div>
    </section>
  )
}

interface Folder {
  phone: boolean
  layout: FolderLayout
}

/** Our resume in its folder: at the screen's own size on a phone or a narrow screen, else on the frame. */
const folderFor = (width: number, height: number): Folder => {
  const phone = width < 700 || width / height < 0.9
  return { phone, layout: phone ? layoutFolder(true, width, height) : layoutFolder(false, FRAME.width, FRAME.height) }
}

function MovingStory({ hero }: { hero: React.ReactNode }) {
  const story = useRef<HTMLDivElement>(null)
  const sky = useRef<HTMLImageElement>(null)
  const golden = useRef<HTMLDivElement>(null)
  const meadow = useRef<HTMLImageElement>(null)
  const bank = useRef<HTMLImageElement>(null)
  const tower = useRef<HTMLImageElement>(null)
  const puff = useRef<HTMLImageElement>(null)
  const fileBox = useRef<HTMLDivElement>(null)
  const file = useRef<StoryFileHandle>(null)
  const editor = useRef<HTMLElement>(null)
  const grass = useRef<HTMLDivElement>(null)
  const wayIn = useRef<HTMLElement>(null)
  const wayInCopy = useRef<HTMLDivElement>(null)
  const [folder, setFolder] = useState<Folder | null>(null)
  // Draws the story where it is; set once the stage is measured. A new folder layout redraws it.
  const redraw = useRef<() => void>(() => {})
  // The way in shows itself when it's focused: it's at the story's end.
  const toEnd = useRef<() => void>(() => {})

  useEffect(() => {
    const parts = { story, sky, golden, meadow, bank, tower, puff, fileBox, editor, grass, wayIn, wayInCopy }
    const el = Object.fromEntries(Object.entries(parts).map(([name, ref]) => [name, ref.current])) as {
      [K in keyof typeof parts]: NonNullable<(typeof parts)[K]["current"]>
    }
    if (Object.values(el).some((part) => !part)) return
    const clouds = [
      [el.bank, CLOUDS.bank],
      [el.tower, CLOUDS.tower],
      [el.puff, CLOUDS.puff],
    ] as const
    // Sizes that depend on the screen, set on each resize.
    let screen = { width: 0, height: 0 }
    let phone = false
    let skyCover = cover(SKY.wide, { width: 1, height: 1 })
    let meadowCover = skyCover
    let base = 0
    let grassHeight = 0
    let editorTop = 0
    let editorSize = { width: 0, height: 0 }
    let wayInSize = { width: 0, height: 0 }
    let fileShot = { x: 0, y: 0, scale: 1 }
    let folderKey = ""

    const show = (element: HTMLElement, visible: boolean) => (element.style.visibility = visible ? "visible" : "hidden")

    function measure() {
      // A page opened in a hidden tab can be told the window has no size yet.
      screen = { width: Math.max(window.innerWidth, 320), height: Math.max(window.innerHeight, 480) }
      const { width: vw, height: vh } = screen
      phone = vw < 700
      const tall = vw / vh < 0.8
      const pictured = tall ? SKY.tall : SKY.wide
      if (!el.sky.src.endsWith(pictured.src)) el.sky.src = pictured.src
      const loaded = el.sky.complete && el.sky.naturalWidth > 0 && el.sky.src.endsWith(pictured.src)
      skyCover = cover(loaded ? { width: el.sky.naturalWidth, height: el.sky.naturalHeight } : pictured, screen)
      meadowCover = cover(MEADOW, screen)
      for (const [image, picture] of [
        [el.sky, skyCover],
        [el.meadow, meadowCover],
      ] as const) {
        image.style.width = `${picture.width}px`
        image.style.height = `${picture.height}px`
      }
      // Each cloud is laid out one base wide and only scaled from there, so it's drawn once.
      base = Math.max(vw, vh * 1.45)
      for (const [image] of clouds) image.style.width = `${base}px`

      const next = folderFor(vw, vh)
      const key = `${next.phone}:${next.layout.width}:${next.layout.height}`
      if (key !== folderKey) {
        folderKey = key
        setFolder(next)
      }
      const k = next.phone ? 1 : Math.min(vw / FRAME.width, vh / FRAME.height)
      fileShot = next.phone ? { x: 0, y: 0, scale: 1 } : { x: (vw - FRAME.width * k) / 2, y: (vh - FRAME.height * k) / 2, scale: k }

      // The editor stands centred, its foot behind the grass, which is as wide as the screen
      // (wider on a phone, so the blades keep their size).
      const editorWidth = Math.round(Math.min(1040, vw * (phone ? 0.92 : 0.8)))
      editorSize = { width: editorWidth, height: Math.round(editorWidth * EDITOR_RATIO) }
      editorTop = phone ? HEADER + 36 : Math.max(HEADER + 18, (vh - editorSize.height) / 2 - 10)
      Object.assign(el.editor.style, {
        width: `${editorSize.width}px`,
        height: `${editorSize.height}px`,
        left: `${(vw - editorSize.width) / 2}px`,
        top: `${editorTop}px`,
      })
      const grassWidth = Math.max(vw, phone ? 760 : 0)
      grassHeight = grassWidth * GRASS_RATIO
      Object.assign(el.grass.style, {
        width: `${grassWidth}px`,
        left: `${(vw - grassWidth) / 2}px`,
        top: `${vh - grassHeight + grassHeight * GRASS_SINK}px`,
      })
      const wayInWidth = phone ? Math.min(420, vw - 32) : 560
      el.wayIn.style.setProperty("--cta-width", `${wayInWidth}px`)
      wayInSize = { width: wayInWidth, height: el.wayInCopy.offsetHeight }
    }

    function render(v: number) {
      const { width: vw, height: vh } = screen

      // The sky: the camera sinks toward its cloud deck, warming, until the meadow takes over.
      const skyNow = skyAt(v)
      const skyShot = camera(skyCover, screen, skyNow.scale)
      el.sky.style.transform = `translate3d(${skyShot.x}px, ${skyShot.y}px, 0) scale(${skyShot.scale})`
      el.sky.style.opacity = String(skyNow.opacity)
      show(el.sky, skyNow.opacity > 0.001)
      el.golden.style.opacity = String(smooth(span(v, BEATS.golden)) * skyNow.opacity)

      for (const [image, cloud] of clouds) {
        const { at, opacity } = cloudAt(cloud, v)
        show(image, opacity > 0.001)
        if (opacity <= 0.001) continue
        image.style.opacity = String(opacity)
        image.style.transform = `translate3d(${at[0] * vw - base / 2}px, ${at[1] * vh - (base * CLOUD_RATIO) / 2}px, 0) scale(${at[2]})`
      }

      // Our resume rises out of the clouds in its folder once they've gathered, and floats away
      // with them, its promises marked on it one at a time in between.
      const rising = span(v, BEATS.pageIn)
      const away = in2(span(v, BEATS.away))
      show(el.fileBox, rising > 0 && away < 1)
      if (rising > 0 && away < 1) {
        const risen = out3(rising)
        el.fileBox.style.opacity = String(smooth(span(rising, [0, 0.55])) * (1 - smooth(span(away, [0.6, 1]))))
        el.fileBox.style.transform = `translate3d(${fileShot.x}px, ${fileShot.y + (1 - risen) * vh * 0.28 - away * vh * 1.05}px, 0) scale(${fileShot.scale * (1 - 0.04 * away)})`
        const blur = (1 - risen) * 7
        el.fileBox.style.filter = blur > 0.1 ? `blur(${blur}px)` : "none"
      }
      BEATS.marks.forEach((beat, i) => file.current?.draw(i, span(v, beat)))

      // Out of the cloud base, down to the meadow, with the grass rising in front of it.
      const meadowNow = meadowAt(v, meadowCover, screen, grassHeight)
      show(el.meadow, meadowNow.opacity > 0.001)
      el.meadow.style.opacity = String(meadowNow.opacity)
      el.meadow.style.transform = `translate3d(${meadowNow.x}px, ${meadowNow.y}px, 0) scale(${meadowNow.scale})`
      show(el.grass, span(v, BEATS.grass) > 0)
      el.grass.style.transform = `translate3d(0, ${grassDropAt(v, grassHeight)}px, 0)`

      // The editor rises out of the grass, coming into focus, then softens a little as the way in
      // arrives, so that's what's sharp.
      const rose = span(v, BEATS.editor)
      show(el.editor, rose > 0)
      if (rose > 0) {
        const up = out3(rose)
        el.editor.style.opacity = String(smooth(span(rose, [0, 0.25])))
        el.editor.style.transform = `translate3d(0, ${(1 - up) * (vh - editorTop + 40)}px, 0) scale(${lerp(0.92, 1, up)})`
        const blur = 10 * (1 - smooth(span(rose, [0.35, 1]))) + 2.2 * smooth(span(v, BEATS.cta))
        el.editor.style.filter = blur > 0.1 ? `blur(${blur}px)` : "none"
      }

      // The way in, over the editor's lower middle (under it on a phone), always wholly on screen.
      const arriving = span(v, BEATS.cta)
      const shown = out3(arriving)
      const middle = Math.min(
        Math.max(
          phone ? editorTop + editorSize.height - 30 + wayInSize.height / 2 : editorTop + editorSize.height * 0.66,
          HEADER + 8 + wayInSize.height / 2,
        ),
        vh - 20 - wayInSize.height / 2,
      )
      el.wayIn.style.transform = `translate3d(${(vw - wayInSize.width) / 2}px, ${middle - wayInSize.height / 2 + (1 - shown) * 46}px, 0) scale(${lerp(0.96, 1, shown)})`
      el.wayIn.style.setProperty("--glass-in", String(shown))
      el.wayInCopy.style.opacity = String(smooth(span(arriving, [0.25, 1])))
      el.wayIn.style.pointerEvents = arriving > 0.6 ? "auto" : "none"
    }

    // The scroll sets where the story is going; each frame eases toward it, so a mouse wheel's
    // steps glide rather than jump.
    let target = 0
    let shown = 0
    let last = 0
    let frame = 0
    const read = () => {
      const box = el.story.getBoundingClientRect()
      target = storyAt(box.top, box.height, window.innerHeight)
    }
    const step = (now: number) => {
      frame = 0
      shown = glide(shown, target, last ? Math.min(64, now - last) : 16.7)
      last = now
      render(shown)
      if (shown !== target) frame = requestAnimationFrame(step)
      else last = 0
    }
    const onScroll = () => {
      read()
      if (!frame) frame = requestAnimationFrame(step)
    }
    const snap = () => {
      read()
      shown = target
      render(shown)
    }
    const onResize = () => {
      measure()
      snap()
    }
    redraw.current = () => render(shown)
    toEnd.current = () => {
      if (shown >= BEATS.cta[1]) return
      const box = el.story.getBoundingClientRect()
      window.scrollTo({ top: window.scrollY + box.top + box.height - window.innerHeight, behavior: "smooth" })
    }

    measure()
    // /about#contact (the footer's Contact, and the old /contact) lands on the story's end at once,
    // where the address is, rather than flying through the whole story to get there.
    if (window.location.hash === "#contact") {
      const box = el.story.getBoundingClientRect()
      window.scrollTo({ top: window.scrollY + box.top + box.height - window.innerHeight, behavior: "instant" })
    }
    snap()
    // The way in is kept on screen by its height, which changes when its text reflows: once its
    // fonts arrive after it was first measured, as well as with its width.
    const wayInHeight = new ResizeObserver(() => {
      if (el.wayInCopy.offsetHeight === wayInSize.height) return
      wayInSize = { ...wayInSize, height: el.wayInCopy.offsetHeight }
      render(shown)
    })
    wayInHeight.observe(el.wayInCopy)
    el.sky.addEventListener("load", onResize)
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize)
    return () => {
      cancelAnimationFrame(frame)
      wayInHeight.disconnect()
      el.sky.removeEventListener("load", onResize)
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      redraw.current = () => {}
    }
  }, [])

  // A new folder layout has new strokes: draw them to where the story is.
  useEffect(() => redraw.current(), [folder])

  return (
    <div ref={story} className="story" style={{ height: `calc(${STORY_LENGTH}vh + 100svh)` }}>
      <div className="story-hero">{hero}</div>
      <Promises />
      {/* Where /about#contact lands: the story's last screen, where the way in shows the address. */}
      <div id="contact" aria-hidden="true" className="story-end" />
      <div className="story-stage">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={sky} src={SKY.wide.src} alt="" className="story-scene" />
        <div ref={golden} aria-hidden="true" className="story-golden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={meadow} src="/about/meadow.webp" alt="" className="story-scene" loading="lazy" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={bank} src="/about/cloud-bank.webp" alt="" className="story-cloud" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={tower} src="/about/cloud-tower.webp" alt="" className="story-cloud" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={puff} src="/about/cloud-puff.webp" alt="" className="story-cloud" />
        <div ref={fileBox} style={{ transformOrigin: "0 0" }}>
          {folder && <StoryFile ref={file} layout={folder.layout} phone={folder.phone} />}
        </div>
        <figure ref={editor} aria-hidden="true" className="story-editor">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/about/editor.webp" alt="" loading="lazy" />
        </figure>
        <div ref={grass} aria-hidden="true" className="story-grass">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/about/grass.webp" alt="" loading="lazy" />
        </div>
        <WayIn ref={wayIn} copyRef={wayInCopy} onFocus={() => toEnd.current()} />
      </div>
    </div>
  )
}

/** The story without motion: the first screen and our marked resume on the sky, then the meadow. */
function StillStory({ hero }: { hero: React.ReactNode }) {
  const [frame, setFrame] = useState<{ folder: Folder; width: number; height: number; scale: number; lift: number } | null>(null)

  useEffect(() => {
    const measure = () => {
      const width = Math.max(window.innerWidth, 320)
      const narrow = width < 700 || width / Math.max(window.innerHeight, 1) < 0.9
      if (narrow) {
        const layout = layoutFolder(true, width - 32, 900, false)
        setFrame({ folder: { phone: true, layout }, width: layout.width, height: layout.foot - 70, scale: 1, lift: 80 })
      } else {
        const scale = Math.min(1, (width - 32) / FRAME.width)
        const layout = layoutFolder(false, FRAME.width, FRAME.height)
        setFrame({ folder: { phone: false, layout }, width: FRAME.width * scale, height: 780 * scale, scale, lift: 110 * scale })
      }
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [])

  return (
    <div className="story">
      <div className="story-still-sky pb-20">
        <div className="story-hero">{hero}</div>
        <Promises />
        {frame && (
          <div className="story-still-file" style={{ width: frame.width, height: frame.height }}>
            <div style={{ transform: `translateY(${-frame.lift}px) scale(${frame.scale})`, transformOrigin: "0 0" }}>
              <StoryFile layout={frame.folder.layout} phone={frame.folder.phone} drawn />
            </div>
          </div>
        )}
      </div>
      <div className="story-still-meadow">
        <figure aria-hidden="true" className="story-editor">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/about/editor.webp" alt="" loading="lazy" />
        </figure>
        <WayIn contactId="contact" />
        <div aria-hidden="true" className="story-grass">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/about/grass.webp" alt="" loading="lazy" />
        </div>
      </div>
    </div>
  )
}
