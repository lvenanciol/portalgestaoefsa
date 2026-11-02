import fs from 'node:fs'
import path from 'node:path'
import { writePNG } from './png-writer.mjs'

const BG_COLOR = { r: 0x1b, g: 0x5e, b: 0x20 } // #1B5E20 verde oficial
const ORANGE = { r: 243, g: 112, b: 33 } // #F37021 laranja oficial Extrafruti
const GREEN_LEAF = { r: 67, g: 160, b: 71 } // #43A047 verde folha
const GREEN_TEXT = { r: 46, g: 125, b: 50 } // #2E7D32 verde texto extrafruti

// Let's create high quality rasterized Extrafruti icon buffer in any target dimension (180, 192, 512, etc.)
// Solid green background #1B5E20, 100% opaque without alpha transparency
export function renderExtrafrutiIcon(size) {
  const canvas = Buffer.alloc(size * size * 4)

  // 1. Fill canvas with solid green #1B5E20
  for (let i = 0; i < size * size; i++) {
    const idx = i * 4
    canvas[idx] = BG_COLOR.r
    canvas[idx + 1] = BG_COLOR.g
    canvas[idx + 2] = BG_COLOR.b
    canvas[idx + 3] = 255
  }

  // We can render the geometry onto a super-sampled grid or direct coordinate space.
  // Standard coordinate space of SVG is 512x512 with center at (256, 256).
  // The symbol consists of:
  // - White circle background: center (256, 256), radius 216
  // - Green leaf at top: apex around (300, 56) to (256, 128)
  // - Upper orange apple arc
  // - Lower orange smile/tray
  // - Extrafruti text

  // To ensure pixel-perfect fidelity with the official Extrafruti logo,
  // let's evaluate points against the mathematical shapes with anti-aliasing (super-sampling 2x2 or 3x3)
  const ss = 2 // 2x2 super-sampling for smooth edges
  const ssSize = size * ss

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rSum = 0,
        gSum = 0,
        bSum = 0

      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          // Normalized coordinates in 512x512 space
          const nx = ((px + (sx + 0.5) / ss) / size) * 512
          const ny = ((py + (sy + 0.5) / ss) / size) * 512

          const sampleColor = sampleLogoAt(nx, ny)
          rSum += sampleColor.r
          gSum += sampleColor.g
          bSum += sampleColor.b
        }
      }

      const destIdx = (py * size + px) * 4
      canvas[destIdx] = Math.round(rSum / (ss * ss))
      canvas[destIdx + 1] = Math.round(gSum / (ss * ss))
      canvas[destIdx + 2] = Math.round(bSum / (ss * ss))
      canvas[destIdx + 3] = 255
    }
  }

  return canvas
}

function sampleLogoAt(x, y) {
  // Distance from center (256, 256)
  const dx = x - 256
  const dy = y - 256
  const distCenter = Math.sqrt(dx * dx + dy * dy)

  // Outside circle (radius 216) -> Background Green #1B5E20
  if (distCenter > 216) {
    return BG_COLOR
  }

  // Inside circle, default is White #FFFFFF
  let color = { r: 255, g: 255, b: 255 }

  // 1. Folha verde superior:
  // d="M256,128 C242,94 268,64 300,56 C306,86 288,118 256,128 Z"
  if (isPointInLeaf(x, y)) {
    return GREEN_LEAF
  }

  // 2. Arco superior da maçã (laranja):
  // Composto por dois lobos que se curvam de (136, 220) até (376, 220)
  if (isPointInUpperApple(x, y)) {
    return ORANGE
  }

  // 3. Sorriso / Bandeja inferior da maçã (laranja):
  if (isPointInLowerApple(x, y)) {
    return ORANGE
  }

  // 4. Texto "extrafruti" centralizado (em torno de y = 265 a y = 315)
  if (isPointInTextExtrafruti(x, y)) {
    return GREEN_TEXT
  }

  return color
}

function isPointInLeaf(x, y) {
  if (x < 240 || x > 310 || y < 54 || y > 132) return false
  // Approximate ellipse/polygon of the leaf
  const cx = 278
  const cy = 92
  const angle = -0.6
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const rx = (x - cx) * cos - (y - cy) * sin
  const ry = (x - cx) * sin + (y - cy) * cos
  return (rx * rx) / (20 * 20) + (ry * ry) / (38 * 38) <= 1
}

function isPointInUpperApple(x, y) {
  if (y < 125 || y > 225 || x < 120 || x > 392) return false
  // Left lobe: center ~(186, 175)
  const dLeft = Math.hypot(x - 186, y - 175)
  const inOuterLeft = dLeft <= 58
  const inInnerLeft = dLeft <= 28 && y > 155

  // Right lobe: center ~(326, 175)
  const dRight = Math.hypot(x - 326, y - 175)
  const inOuterRight = dRight <= 58
  const inInnerRight = dRight <= 28 && y > 155

  if ((inOuterLeft && !inInnerLeft) || (inOuterRight && !inInnerRight)) {
    // Cutout bottom straight at y=220
    if (y <= 222) return true
  }
  return false
}

function isPointInLowerApple(x, y) {
  if (y < 350 || y > 425 || x < 140 || x > 372) return false
  // Outer ellipse arc
  const dOuter = Math.hypot((x - 256) / 108, (y - 320) / 100)
  // Inner ellipse arc
  const dInner = Math.hypot((x - 256) / 104, (y - 320) / 72)
  return dOuter <= 1 && dInner >= 1 && y >= 360
}

// Letter rasterization for extrafruti text:
// The text is rendered between x=135 and x=377, y=260 to y=312
// Let's verify letters: e x t r a f r u t i
function isPointInTextExtrafruti(x, y) {
  if (y < 255 || y > 320 || x < 135 || x > 377) return false

  // Letter bounding boxes approx:
  // e: 138-160
  // x: 162-184
  // t: 186-204
  // r: 206-224
  // a: 226-250
  // f: 252-272 (has descender or tall ascender)
  // r: 274-292
  // u: 294-318
  // t: 320-338
  // i: 342-358

  // 'e' (138-160, y: 272-306)
  if (x >= 138 && x <= 160 && y >= 272 && y <= 306) {
    const cx = 149,
      cy = 289
    const d = Math.hypot(x - cx, y - cy)
    if (d <= 17 && d >= 9) {
      if (x > cx + 4 && y > cy + 2 && y < cy + 12) return false // opening
      return true
    }
    if (y >= 286 && y <= 292 && x >= 138 && x <= 160) return true // bar
  }

  // 'x' (162-184, y: 272-306)
  if (x >= 162 && x <= 184 && y >= 272 && y <= 306) {
    const d1 = Math.abs(y - 272 - (x - 162) * 1.5)
    const d2 = Math.abs(y - 272 - (184 - x) * 1.5)
    if (d1 <= 4.5 || d2 <= 4.5) return true
  }

  // 't' (186-204, y: 260-306)
  if (x >= 186 && x <= 204 && y >= 260 && y <= 306) {
    if (x >= 191 && x <= 199 && y >= 260 && y <= 302) return true // vertical stem
    if (y >= 272 && y <= 278 && x >= 186 && x <= 204) return true // crossbar
    if (y >= 298 && y <= 306 && x >= 191 && x <= 204) return true // bottom curve
  }

  // 'r' (206-224, y: 272-306)
  if (x >= 206 && x <= 224 && y >= 272 && y <= 306) {
    if (x >= 206 && x <= 214) return true // vertical stem
    if (x >= 214 && x <= 224 && y >= 272 && y <= 286) {
      const d = Math.hypot(x - 214, y - 286)
      if (d <= 12 && d >= 5 && y <= 282) return true
    }
  }

  // 'a' (226-250, y: 272-306)
  if (x >= 226 && x <= 250 && y >= 272 && y <= 306) {
    const cx = 237,
      cy = 290
    const d = Math.hypot(x - cx, y - cy)
    if (d <= 15 && d >= 7) return true
    if (x >= 242 && x <= 250 && y >= 274 && y <= 306) return true // right stem
  }

  // 'f' (252-272, y: 254-322) - central feature of Extrafruti logo
  if (x >= 252 && x <= 272 && y >= 254 && y <= 322) {
    if (x >= 258 && x <= 266) return true // long stem
    if (y >= 254 && y <= 266 && x >= 258 && x <= 272) {
      const d = Math.hypot(x - 266, y - 266)
      if (d <= 10 && d >= 3 && y <= 266) return true // top hook
    }
    if (y >= 272 && y <= 278 && x >= 252 && x <= 272) return true // crossbar
  }

  // 'r' (274-292, y: 272-306)
  if (x >= 274 && x <= 292 && y >= 272 && y <= 306) {
    if (x >= 274 && x <= 282) return true // vertical stem
    if (x >= 282 && x <= 292 && y >= 272 && y <= 286) {
      const d = Math.hypot(x - 282, y - 286)
      if (d <= 12 && d >= 5 && y <= 282) return true
    }
  }

  // 'u' (294-318, y: 272-306)
  if (x >= 294 && x <= 318 && y >= 272 && y <= 306) {
    if (x >= 294 && x <= 302 && y <= 298) return true // left stem
    if (x >= 310 && x <= 318) return true // right stem
    if (y >= 296 && y <= 306 && x >= 294 && x <= 318) return true // bottom loop
  }

  // 't' (320-338, y: 260-306)
  if (x >= 320 && x <= 338 && y >= 260 && y <= 306) {
    if (x >= 325 && x <= 333 && y >= 260 && y <= 302) return true
    if (y >= 272 && y <= 278 && x >= 320 && x <= 338) return true
    if (y >= 298 && y <= 306 && x >= 325 && x <= 338) return true
  }

  // 'i' (342-358, y: 260-306)
  if (x >= 342 && x <= 358 && y >= 260 && y <= 306) {
    if (x >= 345 && x <= 353 && y >= 272 && y <= 306) return true // stem
    if (x >= 345 && x <= 353 && y >= 260 && y <= 268) return true // dot
  }

  return false
}
