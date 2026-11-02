import { renderExtrafrutiIcon } from '../../scripts/generate-vector-raster.mjs'
import { writePNG } from '../../scripts/png-writer.mjs'

// Simple test to ensure the rendering function runs cleanly
export function testRender() {
  const size = 32
  const rgba = renderExtrafrutiIcon(size)
  const png = writePNG(size, size, rgba)
  return png.length
}
