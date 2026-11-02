// Execução da geração dos ícones PWA programáticos a partir de pwa-png-builder
import fs from 'node:fs'
import path from 'node:path'
import { buildExtrafrutiPngBytes } from './src/lib/pwa-png-builder'

const publicDir = path.resolve('public')

const targets = [
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'apple-touch-icon-180.png', size: 180 },
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
]

for (const t of targets) {
  const bytes = buildExtrafrutiPngBytes(t.size)
  fs.writeFileSync(path.join(publicDir, t.name), Buffer.from(bytes))
  console.log(`Generated ${t.name} (${t.size}x${t.size}) - ${bytes.length} bytes`)
}
