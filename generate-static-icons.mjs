import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// Tabela CRC32 estática
const CRC_TABLE = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  CRC_TABLE[n] = c >>> 0
}

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const toCrc = Buffer.concat([typeBuf, data])
  const crcVal = crc32(toCrc)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crcVal, 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

export function generateExtrafrutiIconPng(size) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(size, 0)
  ihdrData.writeUInt32BE(size, 4)
  ihdrData[8] = 8
  ihdrData[9] = 2 // Color type 2: RGB (SEM alpha)
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0
  const ihdrChunk = makeChunk('IHDR', ihdrData)

  // Paleta oficial Extrafruti
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

  const rawScanlines = []
  const cx = size / 2
  const cy = size / 2
  const circleRadius = size * 0.425

  for (let y = 0; y < size; y++) {
    const line = Buffer.alloc(1 + size * 3)
    line[0] = 0 // Filter None

    for (let x = 0; x < size; x++) {
      let rSum = 0
      let gSum = 0
      let bSum = 0

      // Supersampling 2x2 para antialiasing limpo
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

            // Folha verde superior central da maçã (inclinada)
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

            // Arco superior da maçã (laranja #F37021)
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

            // Sorriso / Bandeja inferior da maçã (laranja #F37021)
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

            // Tipografia central 'extrafruti' em verde #2E7D32
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

      const pixelOffset = 1 + x * 3
      line[pixelOffset] = Math.round(rSum / 4)
      line[pixelOffset + 1] = Math.round(gSum / 4)
      line[pixelOffset + 2] = Math.round(bSum / 4)
    }

    rawScanlines.push(line)
  }

  const rawData = Buffer.concat(rawScanlines)
  const compressedData = zlib.deflateSync(rawData, { level: 9 })
  const idatChunk = makeChunk('IDAT', compressedData)
  const iendChunk = makeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}
