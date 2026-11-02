import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import type { Plugin } from 'vite'

interface PNGImage {
  width: number
  height: number
  // RGBA buffer (width * height * 4)
  data: Buffer
}

function parsePNG(buf: Buffer): PNGImage {
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error('Not a valid PNG signature')
  }

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let compressionMethod = 0
  let filterMethod = 0
  let interlaceMethod = 0
  const idatChunks: Buffer[] = []
  let palette: Buffer | null = null
  let trns: Buffer | null = null

  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const chunkData = buf.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length

    if (type === 'IHDR') {
      width = chunkData.readUInt32BE(0)
      height = chunkData.readUInt32BE(4)
      bitDepth = chunkData[8]
      colorType = chunkData[9]
      compressionMethod = chunkData[10]
      filterMethod = chunkData[11]
      interlaceMethod = chunkData[12]
    } else if (type === 'PLTE') {
      palette = chunkData
    } else if (type === 'tRNS') {
      trns = chunkData
    } else if (type === 'IDAT') {
      idatChunks.push(chunkData)
    } else if (type === 'IEND') {
      break
    }
  }

  if (interlaceMethod !== 0) {
    throw new Error('Interlaced PNG not supported')
  }

  const compressedData = Buffer.concat(idatChunks)
  const rawData = zlib.inflateSync(compressedData)

  let bytesPerPixel = 4
  if (colorType === 6) { // RGBA
    bytesPerPixel = bitDepth === 16 ? 8 : 4
  } else if (colorType === 2) { // RGB
    bytesPerPixel = bitDepth === 16 ? 6 : 3
  } else if (colorType === 0) { // Grayscale
    bytesPerPixel = bitDepth === 16 ? 2 : 1
  } else if (colorType === 3) { // Indexed
    bytesPerPixel = 1
  } else {
    throw new Error(`Unsupported PNG colorType: ${colorType}`)
  }

  const stride = width * bytesPerPixel
  const unfilterBuf = Buffer.alloc(height * stride)

  function paethPredictor(a: number, b: number, c: number): number {
    const p = a + b - c
    const pa = Math.abs(p - a)
    const pb = Math.abs(p - b)
    const pc = Math.abs(p - c)
    if (pa <= pb && pa <= pc) return a
    if (pb <= pc) return b
    return c
  }

  let srcPos = 0
  for (let y = 0; y < height; y++) {
    const filter = rawData[srcPos++]
    const rowStart = y * stride
    const prevRowStart = (y - 1) * stride

    for (let x = 0; x < stride; x++) {
      const rawByte = rawData[srcPos++]
      const a = x >= bytesPerPixel ? unfilterBuf[rowStart + x - bytesPerPixel] : 0
      const b = y > 0 ? unfilterBuf[prevRowStart + x] : 0
      const c = y > 0 && x >= bytesPerPixel ? unfilterBuf[prevRowStart + x - bytesPerPixel] : 0

      let val = 0
      switch (filter) {
        case 0: // None
          val = rawByte
          break
        case 1: // Sub
          val = (rawByte + a) & 0xff
          break
        case 2: // Up
          val = (rawByte + b) & 0xff
          break
        case 3: // Average
          val = (rawByte + Math.floor((a + b) / 2)) & 0xff
          break
        case 4: // Paeth
          val = (rawByte + paethPredictor(a, b, c)) & 0xff
          break
        default:
          throw new Error(`Unknown filter type ${filter}`)
      }
      unfilterBuf[rowStart + x] = val
    }
  }

  // Convert to RGBA 8-bit
  const rgba = Buffer.alloc(width * height * 4)
  let outIdx = 0

  for (let y = 0; y < height; y++) {
    const rowStart = y * stride
    for (let x = 0; x < width; x++) {
      if (colorType === 6) { // RGBA
        if (bitDepth === 8) {
          const idx = rowStart + x * 4
          rgba[outIdx++] = unfilterBuf[idx]
          rgba[outIdx++] = unfilterBuf[idx + 1]
          rgba[outIdx++] = unfilterBuf[idx + 2]
          rgba[outIdx++] = unfilterBuf[idx + 3]
        } else { // 16 bit
          const idx = rowStart + x * 8
          rgba[outIdx++] = unfilterBuf[idx]
          rgba[outIdx++] = unfilterBuf[idx + 2]
          rgba[outIdx++] = unfilterBuf[idx + 4]
          rgba[outIdx++] = unfilterBuf[idx + 6]
        }
      } else if (colorType === 2) { // RGB
        if (bitDepth === 8) {
          const idx = rowStart + x * 3
          rgba[outIdx++] = unfilterBuf[idx]
          rgba[outIdx++] = unfilterBuf[idx + 1]
          rgba[outIdx++] = unfilterBuf[idx + 2]
          rgba[outIdx++] = 255
        } else {
          const idx = rowStart + x * 6
          rgba[outIdx++] = unfilterBuf[idx]
          rgba[outIdx++] = unfilterBuf[idx + 2]
          rgba[outIdx++] = unfilterBuf[idx + 4]
          rgba[outIdx++] = 255
        }
      } else if (colorType === 3) { // Indexed
        const pIdx = unfilterBuf[rowStart + x]
        if (palette) {
          rgba[outIdx++] = palette[pIdx * 3]
          rgba[outIdx++] = palette[pIdx * 3 + 1]
          rgba[outIdx++] = palette[pIdx * 3 + 2]
          rgba[outIdx++] = trns && pIdx < trns.length ? trns[pIdx] : 255
        } else {
          rgba[outIdx++] = 0
          rgba[outIdx++] = 0
          rgba[outIdx++] = 0
          rgba[outIdx++] = 255
        }
      } else if (colorType === 0) { // Grayscale
        const g = unfilterBuf[rowStart + x * (bitDepth === 16 ? 2 : 1)]
        rgba[outIdx++] = g
        rgba[outIdx++] = g
        rgba[outIdx++] = g
        rgba[outIdx++] = 255
      }
    }
  }

  return { width, height, data: rgba }
}

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0)
    }
  }
  return (c ^ 0xffffffff) >>> 0
}

function writeChunk(type: string, data: Buffer): Buffer {
  const len = data.length
  const chunk = Buffer.alloc(12 + len)
  chunk.writeUInt32BE(len, 0)
  chunk.write(type, 4, 4, 'ascii')
  data.copy(chunk, 8)
  const typeAndData = chunk.subarray(4, 8 + len)
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len)
  return chunk
}

function encodePNG(img: PNGImage): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  // IHDR
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(img.width, 0)
  ihdr.writeUInt32BE(img.height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace
  const ihdrChunk = writeChunk('IHDR', ihdr)

  // Scanlines with filter type 0 (None)
  const stride = img.width * 4
  const rawScanlines = Buffer.alloc(img.height * (stride + 1))
  for (let y = 0; y < img.height; y++) {
    const rawPos = y * (stride + 1)
    rawScanlines[rawPos] = 0 // Filter type 0
    img.data.copy(rawScanlines, rawPos + 1, y * stride, (y + 1) * stride)
  }

  const idatData = zlib.deflateSync(rawScanlines, { level: 9 })
  const idatChunk = writeChunk('IDAT', idatData)
  const iendChunk = writeChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}

// Redimensiona a imagem para caber em size x size com fundo verde #1B5E20
// e margem interna (padding) para parecer um ícone de app perfeito.
function renderIcon(src: PNGImage, size: number, bg: [number, number, number]): PNGImage {
  const outData = Buffer.alloc(size * size * 4)

  // Preenche com o fundo verde sólido (R, G, B, A=255)
  for (let i = 0; i < size * size; i++) {
    outData[i * 4] = bg[0]
    outData[i * 4 + 1] = bg[1]
    outData[i * 4 + 2] = bg[2]
    outData[i * 4 + 3] = 255
  }

  // Define tamanho do logo com margem (ex: 82% do tamanho do ícone, deixando 9% de padding)
  const paddingRatio = 0.08
  const maxLogoW = Math.round(size * (1 - 2 * paddingRatio))
  const maxLogoH = Math.round(size * (1 - 2 * paddingRatio))

  const scale = Math.min(maxLogoW / src.width, maxLogoH / src.height)
  const targetW = Math.max(1, Math.round(src.width * scale))
  const targetH = Math.max(1, Math.round(src.height * scale))

  const offsetX = Math.round((size - targetW) / 2)
  const offsetY = Math.round((size - targetH) / 2)

  // Bilinear sampling
  for (let ty = 0; ty < targetH; ty++) {
    const sy = (ty / targetH) * (src.height - 1)
    const y0 = Math.floor(sy)
    const y1 = Math.min(src.height - 1, y0 + 1)
    const dy = sy - y0

    const dyPixel = offsetY + ty
    if (dyPixel < 0 || dyPixel >= size) continue

    for (let tx = 0; tx < targetW; tx++) {
      const sx = (tx / targetW) * (src.width - 1)
      const x0 = Math.floor(sx)
      const x1 = Math.min(src.width - 1, x0 + 1)
      const dx = sx - x0

      const dxPixel = offsetX + tx
      if (dxPixel < 0 || dxPixel >= size) continue

      // 4 vizinhos
      const idx00 = (y0 * src.width + x0) * 4
      const idx10 = (y0 * src.width + x1) * 4
      const idx01 = (y1 * src.width + x0) * 4
      const idx11 = (y1 * src.width + x1) * 4

      // Interpolação bilinear RGBA
      const w00 = (1 - dx) * (1 - dy)
      const w10 = dx * (1 - dy)
      const w01 = (1 - dx) * dy
      const w11 = dx * dy

      const r = src.data[idx00] * w00 + src.data[idx10] * w10 + src.data[idx01] * w01 + src.data[idx11] * w11
      const g = src.data[idx00 + 1] * w00 + src.data[idx10 + 1] * w10 + src.data[idx01 + 1] * w01 + src.data[idx11 + 1] * w11
      const b = src.data[idx00 + 2] * w00 + src.data[idx10 + 2] * w10 + src.data[idx01 + 2] * w01 + src.data[idx11 + 2] * w11
      const a = (src.data[idx00 + 3] * w00 + src.data[idx10 + 3] * w10 + src.data[idx01 + 3] * w01 + src.data[idx11 + 3] * w11) / 255

      // Alpha composite over solid background
      const dstIdx = (dyPixel * size + dxPixel) * 4
      const bgR = bg[0]
      const bgG = bg[1]
      const bgB = bg[2]

      outData[dstIdx] = Math.round(r * a + bgR * (1 - a))
      outData[dstIdx + 1] = Math.round(g * a + bgG * (1 - a))
      outData[dstIdx + 2] = Math.round(b * a + bgB * (1 - a))
      outData[dstIdx + 3] = 255
    }
  }

  return { width: size, height: size, data: outData }
}

export function pwaIconsPlugin(): Plugin {
  let sourceLogoPath: string | null = null

  return {
    name: 'vite-plugin-pwa-icons',
    configResolved(config) {
      // Procura a logo da Extrafruti em src/assets/
      const assetsDir = path.resolve(config.root, 'src/assets')
      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir)
        // Preferência para o screenshot anexado recentemente com a logo Extrafruti
        const candidates = files.filter(f => f.toLowerCase().endsWith('.png'))
        // O asset salvo nesta rodada: screenshot-2026-11-02-at-11.07.02-00668.png
        const match = candidates.find(f => f.includes('2026-11-02')) || candidates[0]
        if (match) {
          sourceLogoPath = path.join(assetsDir, match)
        }
      }
    },
    // No dev server, intercepta /apple-touch-icon.png, /icon-192.png e /icon-512.png para servir sob demanda
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next()
        const url = req.url.split('?')[0]

        let targetSize = 0
        if (url === '/apple-touch-icon.png') targetSize = 180
        else if (url === '/icon-192.png') targetSize = 192
        else if (url === '/icon-512.png') targetSize = 512

        if (targetSize > 0 && sourceLogoPath && fs.existsSync(sourceLogoPath)) {
          try {
            const srcBuf = fs.readFileSync(sourceLogoPath)
            const srcImg = parsePNG(srcBuf)
            // #1B5E20 = RGB(27, 94, 32)
            const rendered = renderIcon(srcImg, targetSize, [27, 94, 32])
            const pngBuf = encodePNG(rendered)
            res.setHeader('Content-Type', 'image/png')
            res.setHeader('Cache-Control', 'public, max-age=3600')
            res.end(pngBuf)
            return
          } catch (err) {
            console.error('[vite-plugin-pwa-icons] Erro servindo ícone no dev:', err)
          }
        }
        next()
      })
    },
    // No build de produção, emite os 3 PNGs como assets no bundle e grava em dist/ (e public/)
    generateBundle(_options, bundle) {
      if (!sourceLogoPath || !fs.existsSync(sourceLogoPath)) {
        console.warn('[vite-plugin-pwa-icons] Logo de origem não encontrada')
        return
      }

      try {
        const srcBuf = fs.readFileSync(sourceLogoPath)
        const srcImg = parsePNG(srcBuf)
        const bg: [number, number, number] = [27, 94, 32] // #1B5E20

        const targets = [
          { name: 'apple-touch-icon.png', size: 180 },
          { name: 'icon-192.png', size: 192 },
          { name: 'icon-512.png', size: 512 },
        ]

        for (const target of targets) {
          const rendered = renderIcon(srcImg, target.size, bg)
          const pngBuf = encodePNG(rendered)

          // Emite como asset no bundle
          this.emitFile({
            type: 'asset',
            fileName: target.name,
            source: pngBuf,
          })
        }
      } catch (err) {
        console.error('[vite-plugin-pwa-icons] Erro gerando ícones PWA:', err)
      }
    },
    closeBundle() {
      // Garante também a presença física dos PNGs em public/ para o servidor estático e preview
      if (!sourceLogoPath || !fs.existsSync(sourceLogoPath)) return
      try {
        const publicDir = path.resolve(process.cwd(), 'public')
        if (fs.existsSync(publicDir)) {
          const srcBuf = fs.readFileSync(sourceLogoPath)
          const srcImg = parsePNG(srcBuf)
          const bg: [number, number, number] = [27, 94, 32]

          const targets = [
            { name: 'apple-touch-icon.png', size: 180 },
            { name: 'icon-192.png', size: 192 },
            { name: 'icon-512.png', size: 512 },
          ]

          for (const target of targets) {
            const dest = path.join(publicDir, target.name)
            // Se já não foi gerado ou se queremos garantir
            const rendered = renderIcon(srcImg, target.size, bg)
            const pngBuf = encodePNG(rendered)
            fs.writeFileSync(dest, pngBuf)
          }
        }
      } catch (err) {
        console.warn('[vite-plugin-pwa-icons] closeBundle fallback error:', err)
      }
    },
  }
}
