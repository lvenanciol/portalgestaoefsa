// Utilidade executada em ambiente browser/worker para converter bytes em base64 e testar
import { buildExtrafrutiPngBytes, bytesToBase64 } from './pwa-png-builder'

export function getPngBase64(size: number): string {
  const bytes = buildExtrafrutiPngBytes(size)
  return bytesToBase64(bytes)
}

export function getPngDataUrl(size: number): string {
  return `data:image/png;base64,${getPngBase64(size)}`
}
