/*
  Gerador puro de PNG da marca Extrafruti (100% autônomo, formato binário ISO/IEC 15948:2004).
  Produz um arquivo binário PNG válido sem canal alpha (RGB puro), fundo sólido verde #1B5E20,
  respiro circular branco #FFFFFF e logomarca oficial Extrafruti 2026 (maçã laranja #F37021,
  folha verde #2E7D32 e tipografia institucional 'extrafruti' em verde #2E7D32).
*/

const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC_TABLE[n] = c >>> 0
}

export function calcCrc32(buf: Uint8Array, offset = 0, length = buf.length - offset): number {
  let c = 0xffffffff
  const end = offset + length
  for (let i = offset; i < end; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

export function calcAdler32(buf: Uint8Array): number {
  let s1 = 1
  let s2 = 0
  const len = buf.length
  for (let i = 0; i < len; i++) {
    s1 = (s1 + buf[i]) % 65521
    s2 = (s2 + s1) % 65521
  }
  return ((s2 << 16) | s1) >>> 0
}

export function createPngChunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length
  const chunk = new Uint8Array(4 + 4 + len + 4)
  const view = new DataView(chunk.buffer)

  view.setUint32(0, len, false)
  for (let i = 0; i < 4; i++) {
    chunk[4 + i] = type.charCodeAt(i)
  }
  chunk.set(data, 8)

  const crc = calcCrc32(chunk, 4, 4 + len)
  view.setUint32(8 + len, crc, false)

  return chunk
}

export function zlibDeflateUncompressed(raw: Uint8Array): Uint8Array {
  const maxBlock = 65535
  const numBlocks = Math.ceil(raw.length / maxBlock) || 1
  const totalLen = 2 + numBlocks * 5 + raw.length + 4
  const out = new Uint8Array(totalLen)
  const view = new DataView(out.buffer)

  out[0] = 0x78
  out[1] = 0x01

  let inOffset = 0
  let outOffset = 2

  for (let b = 0; b < numBlocks; b++) {
    const isLast = b === numBlocks - 1
    const blockLen = Math.min(raw.length - inOffset, maxBlock)

    out[outOffset] = isLast ? 0x01 : 0x00
    outOffset++

    view.setUint16(outOffset, blockLen, true)
    outOffset += 2
    view.setUint16(outOffset, ~blockLen & 0xffff, true)
    outOffset += 2

    out.set(raw.subarray(inOffset, inOffset + blockLen), outOffset)
    inOffset += blockLen
    outOffset += blockLen
  }

  const adler = calcAdler32(raw)
  view.setUint32(outOffset, adler, false)

  return out
}

export function buildExtrafrutiPngBytes(size: number): Uint8Array {
  const BG_R = 27 // #1B5E20
  const BG_G = 94
  const BG_B = 32

  const WHITE_R = 255
  const WHITE_G = 255
  const WHITE_B = 255

  const ORANGE_R = 243 // #F37021
  const ORANGE_G = 112
  const ORANGE_B = 33

  const GREEN_R = 46 // #2E7D32
  const GREEN_G = 125
  const GREEN_B = 50

  const bytesPerLine = 1 + size * 3
  const rawBytes = new Uint8Array(bytesPerLine * size)

  const cx = size / 2
  const cy = size / 2
  const circleRadius = size * 0.425

  for (let y = 0; y < size; y++) {
    const lineStart = y * bytesPerLine
    rawBytes[lineStart] = 0

    for (let x = 0; x < size; x++) {
      let rSum = 0
      let gSum = 0
      let bSum = 0

      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const px = x + (sx + 0.5) / 2
          const py = y + (sy + 0.5) / 2

          const nx = (px / size) * 512
          const ny = (py / size) * 512

          let r = BG_R
          let g = BG_G
          let b = BG_B

          const dx = px - cx
          const dy = py - cy
          const distCenter = Math.sqrt(dx * dx + dy * dy)

          if (distCenter <= circleRadius) {
            r = WHITE_R
            g = WHITE_G
            b = WHITE_B

            // Folha verde superior
            const leafDx = nx - 268
            const leafDy = ny - 122
            const cosL = 0.88
            const sinL = 0.47
            const rxL = leafDx * cosL + leafDy * sinL
            const ryL = -leafDx * sinL + leafDy * cosL
            if ((rxL * rxL) / (18 * 18) + (ryL * ryL) / (38 * 38) <= 1 && nx >= 252 && ny <= 152) {
              r = GREEN_R
              g = GREEN_G
              b = GREEN_B
            }

            // Arcos superiores laranja
            const leftDist = Math.sqrt((nx - 198) * (nx - 198) + (ny - 188) * (ny - 188))
            const rightDist = Math.sqrt((nx - 314) * (nx - 314) + (ny - 188) * (ny - 188))

            const inUpperArches =
              (leftDist <= 74 && leftDist >= 34 && ny <= 232 && nx <= 258) ||
              (rightDist <= 74 && rightDist >= 34 && ny <= 232 && nx >= 254)

            if (inUpperArches) {
              if (!(ny > 222 && nx >= 226 && nx <= 286)) {
                r = ORANGE_R
                g = ORANGE_G
                b = ORANGE_B
              }
            }

            // Sorriso inferior laranja
            const bottomDist = Math.sqrt((nx - 256) * (nx - 256) + (ny - 260) * (ny - 260))
            if (
              bottomDist >= 132 &&
              bottomDist <= 166 &&
              ny >= 344 &&
              ny <= 420 &&
              nx >= 148 &&
              nx <= 364
            ) {
              r = ORANGE_R
              g = ORANGE_G
              b = ORANGE_B
            }

            // Tipografia central 'extrafruti'
            if (ny >= 262 && ny <= 322 && nx >= 148 && nx <= 364) {
              const yMid = 294
              let isGlyph = false

              // 'e' (150..172)
              if (nx >= 150 && nx <= 172 && ny >= 278 && ny <= 312) {
                const edx = nx - 161
                const edy = ny - yMid
                const distE = Math.sqrt(edx * edx + edy * edy)
                if (distE <= 15 && distE >= 8 && !(nx > 165 && ny > 296 && ny < 308)) {
                  isGlyph = true
                }
                if (Math.abs(ny - yMid) <= 3 && nx >= 150 && nx <= 171) isGlyph = true
              }

              // 'x' (176..198)
              if (nx >= 176 && nx <= 198 && ny >= 278 && ny <= 312) {
                const d1 = Math.abs(nx - 176 - (ny - 278) * (22 / 34))
                const d2 = Math.abs(nx - 198 + (ny - 278) * (22 / 34))
                if (d1 <= 3.5 || d2 <= 3.5) isGlyph = true
              }

              // 't' (202..218)
              if (nx >= 202 && nx <= 218 && ny >= 266 && ny <= 312) {
                if (Math.abs(nx - 210) <= 3.5 && ny >= 266 && ny <= 308) isGlyph = true
                if (Math.abs(ny - 280) <= 3 && nx >= 203 && nx <= 217) isGlyph = true
                if (ny >= 305 && nx >= 210 && nx <= 218 && Math.abs(ny - 310) <= 3) isGlyph = true
              }

              // 'r' (222..238)
              if (nx >= 222 && nx <= 238 && ny >= 278 && ny <= 312) {
                if (Math.abs(nx - 225) <= 3.5) isGlyph = true
                const rdx = nx - 228
                const rdy = ny - 286
                if (rdx >= 0 && Math.sqrt(rdx * rdx + rdy * rdy) <= 9 && ny <= 286) isGlyph = true
              }

              // 'a' (242..264)
              if (nx >= 242 && nx <= 264 && ny >= 278 && ny <= 312) {
                const adx = nx - 253
                const ady = ny - yMid
                const distA = Math.sqrt(adx * adx + ady * ady)
                if (distA <= 15 && distA >= 8) isGlyph = true
                if (Math.abs(nx - 262) <= 3.5 && ny >= 282 && ny <= 312) isGlyph = true
              }

              // 'f' (268..284)
              if (nx >= 268 && nx <= 284 && ny >= 262 && ny <= 312) {
                if (Math.abs(nx - 276) <= 3.5 && ny >= 268 && ny <= 312) isGlyph = true
                if (Math.abs(ny - 280) <= 3 && nx >= 270 && nx <= 283) isGlyph = true
                if (ny <= 268 && nx >= 276 && nx <= 284 && Math.abs(ny - 264) <= 3) isGlyph = true
              }

              // 'r' (288..304)
              if (nx >= 288 && nx <= 304 && ny >= 278 && ny <= 312) {
                if (Math.abs(nx - 291) <= 3.5) isGlyph = true
                const rdx = nx - 294
                const rdy = ny - 286
                if (rdx >= 0 && Math.sqrt(rdx * rdx + rdy * rdy) <= 9 && ny <= 286) isGlyph = true
              }

              // 'u' (308..328)
              if (nx >= 308 && nx <= 328 && ny >= 278 && ny <= 312) {
                if (Math.abs(nx - 312) <= 3.5 && ny <= 304) isGlyph = true
                if (Math.abs(nx - 324) <= 3.5 && ny >= 278 && ny <= 312) isGlyph = true
                if (ny >= 304 && nx >= 312 && nx <= 324 && Math.abs(ny - 310) <= 3.5) isGlyph = true
              }

              // 't' (332..346)
              if (nx >= 332 && nx <= 346 && ny >= 266 && ny <= 312) {
                if (Math.abs(nx - 338) <= 3.5 && ny >= 266 && ny <= 308) isGlyph = true
                if (Math.abs(ny - 280) <= 3 && nx >= 333 && nx <= 345) isGlyph = true
                if (ny >= 305 && nx >= 338 && nx <= 346 && Math.abs(ny - 310) <= 3) isGlyph = true
              }

              // 'i' (350..362)
              if (nx >= 350 && nx <= 362 && ny >= 264 && ny <= 312) {
                if (Math.abs(nx - 355) <= 3.5 && ny >= 278 && ny <= 312) isGlyph = true
                const idx = nx - 355
                const idy = ny - 268
                if (idx * idx + idy * idy <= 12) isGlyph = true
              }

              if (isGlyph) {
                r = GREEN_R
                g = GREEN_G
                b = GREEN_B
              }
            }
          }

          rSum += r
          gSum += g
          bSum += b
        }
      }

      const pixelOffset = lineStart + 1 + x * 3
      rawBytes[pixelOffset] = Math.round(rSum / 4)
      rawBytes[pixelOffset + 1] = Math.round(gSum / 4)
      rawBytes[pixelOffset + 2] = Math.round(bSum / 4)
    }
  }

  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  const ihdrData = new Uint8Array(13)
  const ihdrView = new DataView(ihdrData.buffer)
  ihdrView.setUint32(0, size, false)
  ihdrView.setUint32(4, size, false)
  ihdrData[8] = 8
  ihdrData[9] = 2 // RGB
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0
  const ihdrChunk = createPngChunk('IHDR', ihdrData)

  const compressed = zlibDeflateUncompressed(rawBytes)
  const idatChunk = createPngChunk('IDAT', compressed)

  const iendChunk = createPngChunk('IEND', new Uint8Array(0))

  const totalSize = signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length
  const pngBytes = new Uint8Array(totalSize)
  let pos = 0

  pngBytes.set(signature, pos)
  pos += signature.length

  pngBytes.set(ihdrChunk, pos)
  pos += ihdrChunk.length

  pngBytes.set(idatChunk, pos)
  pos += idatChunk.length

  pngBytes.set(iendChunk, pos)
  pos += iendChunk.length

  return pngBytes
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function getPngDataUrl(size: number): string {
  const bytes = buildExtrafrutiPngBytes(size)
  const b64 = bytesToBase64(bytes)
  return `data:image/png;base64,${b64}`
}
