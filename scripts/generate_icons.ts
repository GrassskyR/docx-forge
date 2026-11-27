import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { deflateSync } from "node:zlib"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outDir = join(root, "packages/desktop/build")
mkdirSync(outDir, { recursive: true })

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const tag = Buffer.from(type, "ascii")
  const body = Buffer.concat([tag, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(size: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1)
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", idat),
    pngChunk("IEND", Buffer.alloc(0)),
  ])
}

function inRoundedRect(
  x: number,
  y: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
): boolean {
  if (x < x0 || x > x0 + w || y < y0 || y > y0 + h) return false
  const cx = Math.max(x0 + r, Math.min(x, x0 + w - r))
  const cy = Math.max(y0 + r, Math.min(y, y0 + h - r))
  const dx = x - cx
  const dy = y - cy
  return dx * dx + dy * dy <= r * r
}

function renderIcon(size: number): Buffer {
  const rgba = new Uint8Array(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const u = ((px + 0.5) / size) * 512
      const v = ((py + 0.5) / size) * 512
      const idx = (py * size + px) * 4
      if (!inRoundedRect(u, v, 24, 24, 464, 464, 108)) continue

      const t = (u + v) / 1024
      let r = Math.round(29 + (15 - 29) * t)
      let g = Math.round(78 + (23 - 78) * t)
      let b = Math.round(216 + (42 - 216) * t)

      const inDoc = inRoundedRect(u, v, 128, 112, 244, 300, 20)
      const inCutCorner = u > 296 && v < 188 && u - 296 > v - 112
      if (inDoc && !inCutCorner) {
        r = 255
        g = 255
        b = 255
        if (u >= 296 && v <= 188) {
          r = 191
          g = 219
          b = 254
        } else if (inRoundedRect(u, v, 168, 216, 164, 22, 11)) {
          r = 37
          g = 99
          b = 235
        } else if (inRoundedRect(u, v, 168, 264, 136, 18, 9)) {
          r = 148
          g = 163
          b = 184
        } else if (inRoundedRect(u, v, 168, 304, 164, 18, 9)) {
          r = 203
          g = 213
          b = 225
        } else if (inRoundedRect(u, v, 168, 344, 108, 18, 9)) {
          r = 203
          g = 213
          b = 225
        }
      }

      rgba[idx] = r
      rgba[idx + 1] = g
      rgba[idx + 2] = b
      rgba[idx + 3] = 255
    }
  }
  return encodePng(size, rgba)
}

function encodeIco(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(pngs.length, 4)

  const entries: Buffer[] = []
  let offset = 6 + pngs.length * 16
  for (const item of pngs) {
    const entry = Buffer.alloc(16)
    entry[0] = item.size >= 256 ? 0 : item.size
    entry[1] = item.size >= 256 ? 0 : item.size
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(item.data.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += item.data.length
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)])
}

writeFileSync(join(outDir, "icon.png"), renderIcon(512))
const icoFrames = [16, 32, 48, 256].map((size) => ({ size, data: renderIcon(size) }))
writeFileSync(join(outDir, "icon.ico"), encodeIco(icoFrames))
console.log("Generated icon.png and icon.ico in", outDir)
