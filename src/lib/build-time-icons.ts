// Build-time icon synchronization
if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') {
  try {
    const { renderExtrafrutiIcon } = await import('../../scripts/generate-vector-raster.mjs')
    const { writePNG } = await import('../../scripts/png-writer.mjs')
    const fs = await import('node:fs')
    const path = await import('node:path')
    const publicDir = path.resolve(process.cwd(), 'public')
    const targets = [
      { size: 180, filename: 'apple-touch-icon.png' },
      { size: 180, filename: 'apple-touch-icon-180.png' },
      { size: 167, filename: 'apple-touch-icon-167.png' },
      { size: 152, filename: 'apple-touch-icon-152.png' },
      { size: 120, filename: 'apple-touch-icon-120.png' },
      { size: 192, filename: 'icon-192.png' },
      { size: 512, filename: 'icon-512.png' },
      { size: 64, filename: 'favicon-64.png' },
      { size: 32, filename: 'favicon-32.png' },
    ]
    for (const t of targets) {
      const rgba = renderExtrafrutiIcon(t.size)
      const png = writePNG(t.size, t.size, rgba)
      fs.writeFileSync(path.join(publicDir, t.filename), png)
    }
  } catch (e) {
    // ignore
  }
}

export {}
