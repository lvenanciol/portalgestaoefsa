import fs from 'node:fs'
import path from 'node:path'
import { generateExtrafrutiIconPng } from './generate-static-icons.mjs'

const publicDir = path.resolve('public')

const targets = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'apple-touch-icon-180.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
]

for (const t of targets) {
  const buf = generateExtrafrutiIconPng(t.size)
  const destPath = path.join(publicDir, t.name)
  fs.writeFileSync(destPath, buf)
  console.log(`Gravado ${t.name}: ${buf.length} bytes`)
}
