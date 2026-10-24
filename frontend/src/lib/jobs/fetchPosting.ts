// Fetches a job posting's page for /api/jobs, on the server, since a page in
// the browser can't read another site's. A server that fetches what it's
// given can be turned on what it can reach and visitors can't, so only a
// public web address is fetched: http or https on its usual port, no
// password in it, and every address its name resolves to checked before it's
// connected to (safeLookup), redirects included, so a name can't resolve to
// a private or cloud metadata address. Only a web page, only so much of it,
// and only for so long. Built on Node's http and https rather than fetch,
// which can't be given its own address lookup.

import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from "node:dns"
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http"
import { request as httpsRequest } from "node:https"
import { BlockList, isIP } from "node:net"
import type { Readable } from "node:stream"
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib"
import { postingFromHtml } from "./pageText"

/** Why a link couldn't be read: "address" when it isn't a public web address, else the page couldn't be had or had no posting. */
export class LinkError extends Error {
  constructor(readonly reason: "address" | "unreachable" | "status" | "type" | "size" | "empty") {
    super(`link: ${reason}`)
  }
}

const MOST_REDIRECTS = 4
const MOST_PAGE_BYTES = 2_000_000
export const LINK_TIME_MS = 10_000

// Addresses that aren't the public internet: this machine, private and
// shared networks, link-local (cloud metadata at 169.254.169.254), and the
// documentation, benchmarking, multicast and reserved ranges.
const blocked = new BlockList()
// prettier-ignore
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4")
// prettier-ignore
for (const [address, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["100::", 64], ["2001::", 32], ["2001:db8::", 32],
  ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) blocked.addSubnet(address, prefix, "ipv6")

/** Whether an address isn't one on the public internet, or isn't an address at all. */
export function blockedAddress(address: string): boolean {
  const family = isIP(address)
  return family === 0 || blocked.check(address, family === 6 ? "ipv6" : "ipv4")
}

/** The link as a URL that may be fetched, or null when it isn't a public web address (see the top of this file). */
export function fetchableUrl(link: string): URL | null {
  if (!URL.canParse(link)) return null
  const url = new URL(link)
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.username || url.password || url.port) return null
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (!host || host === "localhost" || /\.(localhost|local|internal|home\.arpa)$/.test(host)) return null
  if (isIP(host) && blockedAddress(host)) return null
  return url
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

// The address lookup every connection uses: it resolves the name, and turns
// the connection away when any address is blocked, so the address checked is
// the one connected to.
function safeLookup(hostname: string, options: LookupOptions, callback: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return callback(error, "")
    if (addresses.length === 0 || addresses.some(({ address }) => blockedAddress(address))) {
      return callback(Object.assign(new Error(`blocked address for ${hostname}`), { code: "EBLOCKED" }), "")
    }
    if (options.all) return callback(null, addresses)
    callback(null, addresses[0].address, addresses[0].family)
  })
}

const HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; resumezip; +https://www.tryresumezip.com)",
  accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
  "accept-language": "en",
  "accept-encoding": "gzip, deflate, br",
}

type Got = { redirect: string } | { html: string }

function get(url: URL, signal: AbortSignal): Promise<Got> {
  return new Promise((resolve, reject) => {
    const options: RequestOptions = { method: "GET", headers: HEADERS, lookup: safeLookup as RequestOptions["lookup"], signal }
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, options, (response: IncomingMessage) => {
      const status = response.statusCode ?? 0
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume()
        return resolve({ redirect: new URL(response.headers.location, url).href })
      }
      if (status < 200 || status >= 300) {
        response.resume()
        return reject(new LinkError("status"))
      }
      const type = response.headers["content-type"] ?? ""
      if (!/text\/html|application\/xhtml\+xml/i.test(type)) {
        response.resume()
        return reject(new LinkError("type"))
      }
      const encoding = String(response.headers["content-encoding"] ?? "").toLowerCase()
      const body: Readable =
        encoding === "gzip"
          ? response.pipe(createGunzip())
          : encoding === "deflate"
            ? response.pipe(createInflate())
            : encoding === "br"
              ? response.pipe(createBrotliDecompress())
              : response
      const chunks: Buffer[] = []
      let size = 0
      body.on("data", (chunk: Buffer) => {
        size += chunk.length
        if (size > MOST_PAGE_BYTES) {
          response.destroy()
          body.destroy()
          reject(new LinkError("size"))
          return
        }
        chunks.push(chunk)
      })
      body.on("error", () => reject(new LinkError("unreachable")))
      body.on("end", () => {
        const charset = /charset=["']?([\w-]+)/i.exec(type)?.[1] ?? "utf-8"
        let decoder: TextDecoder
        try {
          decoder = new TextDecoder(charset)
        } catch {
          decoder = new TextDecoder("utf-8")
        }
        resolve({ html: decoder.decode(Buffer.concat(chunks)) })
      })
    })
    request.on("error", (error) =>
      reject(signal.aborted ? error : new LinkError((error as NodeJS.ErrnoException).code === "EBLOCKED" ? "address" : "unreachable")),
    )
    request.end()
  })
}

/**
 * The posting at `link`, as text (pageText.ts). Throws a LinkError when the
 * link isn't a public web address, the page can't be had in LINK_TIME_MS, or
 * it has no text; or, once `signal` is aborted, whatever stopped it.
 */
export async function readPosting(link: string, signal?: AbortSignal): Promise<string> {
  const timeout = AbortSignal.timeout(LINK_TIME_MS)
  const stop = signal ? AbortSignal.any([signal, timeout]) : timeout
  let url = fetchableUrl(link)
  for (let hop = 0; hop <= MOST_REDIRECTS; hop++) {
    if (!url) throw new LinkError("address")
    let got: Got
    try {
      got = await get(url, stop)
    } catch (error) {
      if (signal?.aborted) throw error
      throw error instanceof LinkError ? error : new LinkError("unreachable")
    }
    if ("html" in got) {
      const text = postingFromHtml(got.html)
      if (!text) throw new LinkError("empty")
      return text
    }
    url = fetchableUrl(got.redirect)
  }
  throw new LinkError("unreachable")
}
