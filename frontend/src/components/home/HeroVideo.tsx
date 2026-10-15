"use client"

import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { savingData } from "@/lib/typst/compile"

/**
 * The home page's background clip: muted, played once, decorative. The poster
 * shows until the video plays, and instead of it for visitors who prefer
 * less motion or are saving data.
 *
 * The clip is H.264 without sound, with the index at the start so playing
 * can begin before the whole file is in. From a compressed export:
 *   ffmpeg -i export.mp4 -map 0:v -c copy -movflags +faststart -map_metadata -1 interview.mp4
 * The poster is its first frame.
 */
export default function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  // Added once the page has loaded, so the clip doesn't hold up the rest of it.
  const [sources, setSources] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || savingData()) return
    const add = () => setSources(true)
    if (document.readyState === "complete") add()
    else addEventListener("load", add, { once: true })
    return () => removeEventListener("load", add)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!sources || !video) return
    // React doesn't reliably set the muted attribute, which autoplay requires.
    video.muted = true
    // The poster is the clip's first frame, so the video can show as soon as it plays.
    const show = () => setVisible(true)
    // Plays once, only while on screen, and stays on its last frame. If autoplay is blocked, the poster stays.
    const observer = new IntersectionObserver((entries) => {
      if (video.ended) return
      if (entries[entries.length - 1].isIntersecting) video.play().catch(() => {})
      else video.pause()
    })
    video.addEventListener("playing", show)
    observer.observe(video)
    return () => {
      observer.disconnect()
      video.removeEventListener("playing", show)
    }
  }, [sources])

  return (
    <div aria-hidden="true" className="absolute inset-0">
      <Image src="/video/interview-poster.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
      <video
        ref={videoRef}
        muted
        playsInline
        preload="none"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
      >
        {sources && <source src="/video/interview.mp4" type="video/mp4" />}
      </video>
    </div>
  )
}
