import { getPngDataUrl } from './pwa-png-builder'

export function getPngBase64(size: number): string {
  const dataUrl = getPngDataUrl(size)
  return dataUrl.split(',')[1] || ''
}

export { getPngDataUrl }
