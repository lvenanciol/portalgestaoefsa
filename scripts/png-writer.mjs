import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

// Tabela CRC32
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  crcTable[n] = c >>> 0
}

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function createChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const toCrc = Buffer.concat([typeBuf, data])
  const crcVal = Buffer.alloc(4)
  crcVal.writeUInt32BE(crc32(toCrc), 0)
  return Buffer.concat([len, typeBuf, data, crcVal])
}

export function writePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // 8 bit depth
  ihdrData[9] = 6 // RGBA
  ihdrData[10] = 0 // deflate
  ihdrData[11] = 0 // filter
  ihdrData[12] = 0 // no interlace

  const ihdrChunk = createChunk('IHDR', ihdrData)

  const rowBytes = width * 4
  const rawScanlines = Buffer.alloc(height * (rowBytes + 1))
  let offset = 0
  for (let y = 0; y < height; y++) {
    rawScanlines[offset++] = 0 // filter type 0: none
    rgba.copy(rawScanlines, offset, y * rowBytes, (y + 1) * rowBytes)
    offset += rowBytes
  }

  const deflated = zlib.deflateSync(rawScanlines, { level: 9 })
  const idatChunk = createChunk('IDAT', deflated)
  const iendChunk = createChunk('IEND', Buffer.alloc(0))

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk])
}
