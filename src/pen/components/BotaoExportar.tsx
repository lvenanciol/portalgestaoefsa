import { useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { PEN } from '@/pen/tokens'
import { usePenFiltro } from '@/pen/PenShell'
import { useAuth } from '@/hooks/use-auth'
import { exportarTela } from '@/pen/lib/exportar'

// ============================================================================
// FASE 3.2 — BOTÃO "PDF" REUTILIZÁVEL
//
// Cada tela do /pen monta seu próprio corpo HTML e usa este botão para:
//   1. exportar em PDF com cabeçalho de empresa, ciclo e data;
//   2. registrar a exportação em pen_audit com usuário e timestamp
//      (o registro acontece dentro de exportarTela, antes de abrir a janela).
//
// Existe para não repetir em cada tela a lógica de cabeçalho + auditoria:
// se a regra de registro mudar, muda num lugar só.
// ============================================================================

interface Props {
  /** título que aparece no cabeçalho do PDF e em pen_audit */
  titulo: string
  /** HTML do conteúdo, já montado pela tela */
  corpo: string | (() => string | null)
  /** desabilita enquanto não há dado na tela */
  pronto?: boolean
}

export function BotaoExportar({ titulo, corpo, pronto = true }: Props) {
  const { empresa, ciclo } = usePenFiltro()
  const { user } = useAuth()
  const [gerando, setGerando] = useState(false)
  const usuario = String((user as any)?.name || (user as any)?.email || 'usuário')

  async function exportar() {
    if (!pronto || gerando) return
    setGerando(true)
    try {
      const html = typeof corpo === 'function' ? corpo() : corpo
      if (!html) {
        alert('Não há dado carregado para exportar nesta tela.')
        return
      }
      await exportarTela({ titulo, empresa, ciclo, usuario }, html)
    } finally {
      // pequeno atraso só para o usuário ver o estado de "gerando"
      setTimeout(() => setGerando(false), 600)
    }
  }

  return (
    <button
      type="button"
      onClick={exportar}
      disabled={!pronto || gerando}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-bold disabled:opacity-40"
      style={{ background: PEN.acentoClaro, color: PEN.acento }}
      title={`Exportar "${titulo}" em PDF — registra em pen_audit`}
    >
      {gerando ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}
      PDF
    </button>
  )
}

// ---------------------------------------------------------------------------
// Helpers de HTML para o corpo do PDF (evitam repetição nas telas)
// ---------------------------------------------------------------------------

export function kpisHtml(
  itens: Array<{ rotulo: string; valor: string; detalhe?: string }>,
): string {
  return `<div class="kpis">${itens
    .map(
      (k) =>
        `<div class="kpi"><div class="rot">${esc(k.rotulo)}</div><div class="val">${esc(
          k.valor,
        )}</div>${k.detalhe ? `<div class="det">${esc(k.detalhe)}</div>` : ''}</div>`,
    )
    .join('')}</div>`
}

export function tabelaHtml(
  colunas: string[],
  linhas: Array<Array<string | { v: string; cls?: string }>>,
  numericas: number[] = [],
): string {
  const cel = (c: string | { v: string; cls?: string }, i: number) => {
    const v = typeof c === 'string' ? c : c.v
    const cls = [numericas.indexOf(i) >= 0 ? 'num' : '', typeof c === 'string' ? '' : c.cls || '']
      .filter(Boolean)
      .join(' ')
    return `<td${cls ? ` class="${cls}"` : ''}>${v}</td>`
  }
  return `<table><thead><tr>${colunas
    .map((c, i) => `<th${numericas.indexOf(i) >= 0 ? ' class="num"' : ''}>${esc(c)}</th>`)
    .join('')}</tr></thead><tbody>${
    linhas.length
      ? linhas.map((l) => `<tr>${l.map(cel).join('')}</tr>`).join('')
      : `<tr><td colspan="${colunas.length}">Nenhum registro.</td></tr>`
  }</tbody></table>`
}

export function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function secao(titulo: string, conteudo: string): string {
  return `<h2>${esc(titulo)}</h2>${conteudo}`
}
