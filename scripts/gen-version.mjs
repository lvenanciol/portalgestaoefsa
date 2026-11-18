// ============================================================================
// GERA src/lib/app-version.ts A PARTIR DO package.json
//
// 18/11/2026 — SOLUÇÃO DEFINITIVA de um problema que já custou 4 rodadas:
// a sidebar mostrava versão congelada (0.0.664 enquanto o app rodava 0.0.684)
// e o dono concluía, com razão, que o navegador servia bundle antigo.
//
// Por que um script e não import: o tsconfig não tem resolveJsonModule e o
// vite.config.ts não é gravável pelo agente. Um arquivo gerado no prebuild
// contorna as duas limitações.
//
// ORDEM DO PIPELINE (verificada): o Skip incrementa o package.json ANTES de
// rodar o prebuild — comparar `version` do package.json com o `version` que o
// apply_changes devolve mostrou sempre o mesmo número (0.0.681 = 0.0.681).
// Portanto ler o package.json aqui produz o número do build que está saindo,
// sem precisar de "+1" no chute.
//
// Se o arquivo já estiver com o número certo, não reescreve (evita diff
// inútil a cada build).
// ============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkgPath = resolve(raiz, 'package.json')
const destino = resolve(raiz, 'src/lib/app-version.ts')

let versao = '0.0.0'
try {
  versao = String(JSON.parse(readFileSync(pkgPath, 'utf8')).version || '0.0.0')
} catch (e) {
  console.warn('[gen-version] falha ao ler package.json: ' + e.message)
}

let hash = ''
try {
  hash = execSync('git rev-parse --short HEAD', { cwd: raiz, encoding: 'utf8' }).trim()
} catch {
  hash = ''
}

const conteudo = `// ============================================================================
// ARQUIVO GERADO — NÃO EDITAR À MÃO.
//
// Gerado por scripts/gen-version.mjs no prebuild, a partir do package.json.
// Editar aqui é inútil: o próximo build sobrescreve. A versão da sidebar passa
// a acompanhar o build automaticamente, sem sincronização manual.
//
// Existe porque importar o package.json está bloqueado (tsconfig sem
// resolveJsonModule) e injetar via vite.config.ts também (arquivo não
// gravável pelo agente). Este era o único ponto do pipeline que não
// acompanhava as versões — e fazia o dono concluir que o navegador servia
// bundle antigo.
// ============================================================================
export const APP_VERSION = '${versao}'
export const APP_BUILD = '${hash}'
`

let atual = ''
try {
  if (existsSync(destino)) atual = readFileSync(destino, 'utf8')
} catch {
  atual = ''
}

if (atual === conteudo) {
  console.log(`[gen-version] sem mudanca (v${versao})`)
} else {
  writeFileSync(destino, conteudo, 'utf8')
  console.log(`[gen-version] escrito: v${versao}${hash ? ' (' + hash + ')' : ''}`)
}
