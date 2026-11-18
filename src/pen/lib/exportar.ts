import { registrarExportacao } from './dados'

// ============================================================================
// FASE 3.2 — EXPORTAÇÃO EXECUTIVA PARA PDF
//
// Duas saídas:
//   · exportarTela()      — cabeçalho (empresa · ciclo · data) + conteúdo da tela
//   · exportarConsolidado() — UMA página, feita a partir do Cockpit, para o conselho
//
// Técnica: janela de impressão com HTML próprio. Evita dependência nova de
// biblioteca de PDF e usa o motor do próprio navegador — o texto continua
// selecionável e o arquivo é leve.
//
// Toda exportação é registrada em pen_audit com usuário e timestamp
// (registrarExportacao), ANTES de abrir a janela.
// ============================================================================

export interface CabecalhoExport {
  titulo: string
  empresa: string
  ciclo: string
  /** usuário que exportou — vai para pen_audit */
  usuario: string
}

/** Data e hora no padrão brasileiro. */
function agora(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    color: #111827; margin: 0; font-size: 11px; line-height: 1.45;
  }
  header {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #1F6F78; padding-bottom: 8px; margin-bottom: 14px;
  }
  .marca { display: flex; align-items: center; gap: 8px; }
  .logo {
    width: 26px; height: 26px; border-radius: 6px; background: #1F6F78;
    color: #fff; font-weight: 800; font-size: 12px;
    display: flex; align-items: center; justify-content: center;
  }
  h1 { font-size: 15px; margin: 0; letter-spacing: -0.2px; }
  .sub { font-size: 9.5px; color: #5B6673; margin-top: 1px; }
  .meta { text-align: right; font-size: 9.5px; color: #5B6673; }
  .meta strong { color: #111827; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
       color: #8A949F; margin: 16px 0 6px; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 8.5px; text-transform: uppercase;
       letter-spacing: .05em; color: #8A949F; padding: 5px 6px;
       border-bottom: 1px solid #E3E7EC; font-weight: 800; }
  td { padding: 5px 6px; border-bottom: 1px solid #F2F4F6; font-size: 10px; vertical-align: top; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .kpi { border: 1px solid #E3E7EC; border-radius: 8px; padding: 8px 9px; }
  .kpi .rot { font-size: 8px; text-transform: uppercase; letter-spacing: .05em; color: #8A949F; font-weight: 800; }
  .kpi .val { font-size: 17px; font-weight: 800; margin-top: 2px; letter-spacing: -.4px; }
  .kpi .det { font-size: 8.5px; color: #5B6673; margin-top: 1px; }
  .verde { color: #2E7D5B; } .ambar { color: #C98A14; } .vermelho { color: #B3392E; }
  .dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 4px; }
  .bg-verde { background: #2E7D5B; } .bg-ambar { background: #C98A14; } .bg-vermelho { background: #B3392E; }
  footer { margin-top: 16px; padding-top: 6px; border-top: 1px solid #E3E7EC;
           font-size: 8px; color: #8A949F; display: flex; justify-content: space-between; }
  .tag { display: inline-block; padding: 1px 5px; border-radius: 4px;
         font-size: 8px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
`

function documento(cab: CabecalhoExport, corpo: string): string {
  return `<!doctype html><html lang="pt-BR"><head>
<meta charset="utf-8"><title>${esc(cab.titulo)} — ${esc(cab.empresa)}</title>
<style>${CSS}</style></head><body>
<header>
  <div class="marca">
    <div class="logo">PE</div>
    <div>
      <h1>${esc(cab.titulo)}</h1>
      <div class="sub">Plano Estratégico · Grupo Extrafruti</div>
    </div>
  </div>
  <div class="meta">
    <div><strong>${esc(cab.empresa)}</strong></div>
    <div>${esc(cab.ciclo)}</div>
    <div>Emitido em ${agora()}</div>
    <div>por ${esc(cab.usuario)}</div>
  </div>
</header>
${corpo}
<footer>
  <span>Portal de Gestão Executivo · Plano Estratégico</span>
  <span>${esc(cab.empresa)} · ${esc(cab.ciclo)} · ${agora()}</span>
</footer>
</body></html>`
}

/** Abre a janela de impressão (o usuário salva como PDF). */
function imprimir(html: string) {
  const w = window.open('', '_blank', 'width=920,height=760')
  if (!w) {
    // pop-up bloqueado: avisa sem perder o dado
    alert(
      'O navegador bloqueou a janela de exportação. Libere pop-ups para este site e tente de novo.',
    )
    return
  }
  w.document.open()
  w.document.write(html)
  w.document.close()
  // espera o layout para o motor calcular as páginas
  setTimeout(() => {
    try {
      w.focus()
      w.print()
    } catch (_e) {
      /* usuário fecha a janela */
    }
  }, 350)
}

// ---------------------------------------------------------------------------
// 1) exportação genérica de uma tela (HTML já montado pela tela)
// ---------------------------------------------------------------------------

export async function exportarTela(cab: CabecalhoExport, corpoHtml: string): Promise<void> {
  await registrarExportacao(cab.titulo, 'PDF', cab.empresa, cab.usuario)
  imprimir(documento(cab, corpoHtml))
}

// ---------------------------------------------------------------------------
// 2) consolidado de UMA página a partir do Cockpit (para o conselho)
// ---------------------------------------------------------------------------

export interface ConsolidadoDados {
  receita: number | null
  receitaMeta: number | null
  ebitda: number | null
  ebitdaMeta: number | null
  turnover: number | null
  turnoverMeta: number | null
  iniNoPrazo: number
  iniTotal: number
  empresas: Array<{ nome: string; progresso: number }>
  alertas: Array<{ nivel: string; titulo: string; detalhe: string }>
  ritos: Array<{ data: string; rito: string; pauta: string; responsavel: string }>
}

function reais(v: number | null): string {
  if (v === null || v === undefined) return '—'
  if (v >= 1_000_000)
    return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mi`
  return `R$ ${v.toLocaleString('pt-BR')}`
}

function pct(v: number | null, casas = 1): string {
  if (v === null || v === undefined) return '—'
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
}

function dataBr(s: string): string {
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s
}

function ating(real: number | null, meta: number | null): { txt: string; cls: string; bg: string } {
  if (real === null || meta === null || meta === 0) return { txt: '—', cls: '', bg: 'bg-vermelho' }
  const p = (real / meta) * 100
  const cls = p >= 100 ? 'verde' : p >= 90 ? 'ambar' : 'vermelho'
  const bg = p >= 100 ? 'bg-verde' : p >= 90 ? 'bg-ambar' : 'bg-vermelho'
  return { txt: `${p.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`, cls, bg }
}

/**
 * Gera o consolidado de UMA página: 4 KPIs, execução por empresa, alertas
 * críticos e os próximos ritos. Serve para envio ao conselho.
 */
export async function exportarConsolidado(
  cab: CabecalhoExport,
  d: ConsolidadoDados,
): Promise<void> {
  await registrarExportacao('Cockpit · consolidado', 'PDF 1 página', cab.empresa, cab.usuario)

  const r = ating(d.receita, d.receitaMeta)
  const e = ating(d.ebitda, d.ebitdaMeta)
  // turnover é "menor é melhor": compara ao contrário
  const tOk = d.turnover !== null && d.turnoverMeta !== null
  const tAting =
    tOk && d.turnoverMeta !== 0 ? (d.turnoverMeta / (d.turnover as number)) * 100 : null
  const tCls = tAting === null ? '' : tAting >= 100 ? 'verde' : tAting >= 90 ? 'ambar' : 'vermelho'
  const tBg =
    tAting === null
      ? 'bg-vermelho'
      : tAting >= 100
        ? 'bg-verde'
        : tAting >= 90
          ? 'bg-ambar'
          : 'bg-vermelho'
  const iAting = d.iniTotal > 0 ? (d.iniNoPrazo / d.iniTotal) * 100 : null
  const iCls = iAting === null ? '' : iAting >= 100 ? 'verde' : iAting >= 90 ? 'ambar' : 'vermelho'

  const corpo = `
<h2>Indicadores do ciclo</h2>
<div class="kpis">
  <div class="kpi">
    <div class="rot">Receita</div>
    <div class="val">${reais(d.receita)}</div>
    <div class="det">Meta ${reais(d.receitaMeta)} · <span class="${r.cls}"><span class="dot ${r.bg}"></span>${r.txt}</span></div>
  </div>
  <div class="kpi">
    <div class="rot">EBITDA</div>
    <div class="val">${pct(d.ebitda)}</div>
    <div class="det">Meta ${pct(d.ebitdaMeta)} · <span class="${e.cls}"><span class="dot ${e.bg}"></span>${e.txt}</span></div>
  </div>
  <div class="kpi">
    <div class="rot">Turnover</div>
    <div class="val">${pct(d.turnover)}</div>
    <div class="det">Meta ${pct(d.turnoverMeta)} · <span class="${tCls}"><span class="dot ${tBg}"></span>menor é melhor</span></div>
  </div>
  <div class="kpi">
    <div class="rot">Iniciativas no prazo</div>
    <div class="val">${d.iniNoPrazo}/${d.iniTotal}</div>
    <div class="det"><span class="${iCls}"><span class="dot ${iAting === null ? 'bg-vermelho' : iAting >= 100 ? 'bg-verde' : iAting >= 90 ? 'bg-ambar' : 'bg-vermelho'}"></span>${iAting === null ? '—' : `${iAting.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`}</span></div>
  </div>
</div>

<h2>Execução por empresa</h2>
<table>
  <thead><tr><th>Empresa</th><th class="num">Execução do plano</th><th>Situação</th></tr></thead>
  <tbody>
    ${d.empresas
      .map((x) => {
        const cls = x.progresso >= 100 ? 'verde' : x.progresso >= 90 ? 'ambar' : 'vermelho'
        const bg = x.progresso >= 100 ? 'bg-verde' : x.progresso >= 90 ? 'bg-ambar' : 'bg-vermelho'
        const rot = x.progresso >= 100 ? 'No alvo' : x.progresso >= 90 ? 'Atenção' : 'Crítico'
        return `<tr><td><strong>${esc(x.nome)}</strong></td><td class="num">${x.progresso.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%</td><td class="${cls}"><span class="dot ${bg}"></span>${rot}</td></tr>`
      })
      .join('')}
  </tbody>
</table>

<h2>Alertas de desvio</h2>
<table>
  <thead><tr><th style="width:74px">Nível</th><th>Tema</th><th>Detalhe</th></tr></thead>
  <tbody>
    ${
      d.alertas.length
        ? d.alertas
            .map((a) => {
              const cls =
                a.nivel === 'critico' ? 'vermelho' : a.nivel === 'atencao' ? 'ambar' : 'verde'
              const rot =
                a.nivel === 'critico' ? 'Crítico' : a.nivel === 'atencao' ? 'Atenção' : 'No alvo'
              return `<tr><td class="${cls}">${rot}</td><td>${esc(a.titulo)}</td><td>${esc(a.detalhe)}</td></tr>`
            })
            .join('')
        : '<tr><td colspan="3">Nenhum desvio no escopo.</td></tr>'
    }
  </tbody>
</table>

<h2>Próximos ritos</h2>
<table>
  <thead><tr><th style="width:74px">Data</th><th style="width:150px">Rito</th><th>Pauta</th><th style="width:120px">Responsável</th></tr></thead>
  <tbody>
    ${
      d.ritos.length
        ? d.ritos
            .map(
              (x) =>
                `<tr><td>${dataBr(x.data)}</td><td><strong>${esc(x.rito)}</strong></td><td>${esc(x.pauta)}</td><td>${esc(x.responsavel)}</td></tr>`,
            )
            .join('')
        : '<tr><td colspan="4">Nenhum rito no escopo.</td></tr>'
    }
  </tbody>
</table>
`

  imprimir(documento(cab, corpo))
}
