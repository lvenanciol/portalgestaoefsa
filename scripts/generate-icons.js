// Script para gerar os ícones PNG do PWA (apple-touch-icon 180x180, 192x192, 512x512)
// a partir do logo oficial da Extrafruti hospedado no PocketBase do projeto
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(__dirname, '../public')

const LOGO_URL =
  'https://portal-de-gestao-executivo-b4d94.shrd01.internal.goskip.dev/api/files/pbc_3701359284/jh26s0m19m5m4ny/logo_01_ygiwfat27b.png'

async function main() {
  console.log('Baixando logo original da Extrafruti...')
  const res = await fetch(LOGO_URL)
  if (!res.ok) {
    throw new Error(`Falha ao baixar imagem: ${res.statusText}`)
  }
  const buffer = Buffer.from(await res.arrayBuffer())
  console.log(`Baixado com sucesso! Tamanho: ${buffer.length} bytes.`)

  // Salva o raw em public
  fs.writeFileSync(path.join(publicDir, 'extrafruti-raw.png'), buffer)
  console.log('Salvo public/extrafruti-raw.png')
}

main().catch(console.error)
