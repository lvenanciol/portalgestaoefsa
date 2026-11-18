import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { History, AlertTriangle, Users, BarChart3 } from 'lucide-react'
import { PEN, SEMAFORO_CORES, type Semaforo } from '@/pen/tokens'
import { SectionHeader, ProgressBar } from '@/pen/components'
import { BotaoExportar, tabelaHtml, secao, esc } from '@/pen/components/BotaoExportar'
import { SkeletonTabela, ErroBloco, AvisoFallback } from '@/pen/components/estados'
import { usePenFiltro } from '@/pen/PenShell'
import { useAuth } from '@/hooks/use-auth'
import { carregarPen, atualizarProgresso, type PenDados } from '@/pen/lib/dados'
import type { CompanyScopeId, PenInitiative } from '@/pen/lib/mock'

// ============================================================================
// FASE 2.6 — PLANO DE AÇÃO 5W2H  (única tela COM escrita)
//
// Blocos:
//   1. DataTable de iniciativas: ID · iniciativa · objetivo · empresa · 5W2H ·
//      GUT · % concluído · status
//   2. Gantt em CSS de 12 meses, sincronizado com o filtro de empresa
//   3. Quadro de capacidade por dono, com barra de carga e alerta acima de 80%
//
// ESCRITA: alterar % concluído exige JUSTIFICATIVA (mínimo 10 caracteres) e
// grava em pen_audit com usuário + timestamp ANTES de gravar o progresso.
// Sem auditoria gravada, o progresso NÃO muda.
// ============================================================================

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function isoAno(): number {
  return new Date().getFullYear()
}

function mesIndice(dataIso?: string | null): number | null {
  if (!dataIso) return null
  const s = String(dataIso).slice(0, 10)
  const p = s.split('-')
  if (p.length !== 3) return null
  const m = Number(p[1])
  if (!m || m < 1 || m > 12) return null
  return m - 1
}

function corStatus(pct: number | null): { cor: string; rotulo: string; nivel: Semaforo } {
  if (pct === null) return { cor: '#9AA4AE', rotulo: 'Sem dado', nivel: 'cinza' }
  if (pct >= 100) return { cor: SEMAFORO_CORES.verde.cor, rotulo: 'Concluída', nivel: 'verde' }
  if (pct >= 60) return { cor: PEN.acento, rotulo: 'Em curso', nivel: 'verde' }
  if (pct >= 25) return { cor: SEMAFORO_CORES.ambar.cor, rotulo: 'Iniciada', nivel: 'ambar' }
  return { cor: SEMAFORO_CORES.vermelho.cor, rotulo: 'Crítica', nivel: 'vermelho' }
}

function gutDe(i: PenInitiative): number | null {
  const g = Number(i.gut_g ?? 0)
  const u = Number(i.gut_u ?? 0)
  const t = Number(i.gut_t ?? 0)
  if (!g || !u || !t) return null
  return g * u * t
}

function fmtPrazo(p?: string | null): string {
  if (!p) return '—'
  const d = String(p).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0].slice(2)}` : p
}

export default function PenPlanoPage() {
  const { empresa, ciclo } = usePenFiltro()
  const { user } = useAuth()
  const usuario = String((user as any)?.name || (user as any)?.email || 'usuário')
  const workspace = String((user as any)?.workspace_id || 'ws-pge-001')

  const escopo: CompanyScopeId =
    empresa === 'Extrafruti'
      ? 'extrafruti'
      : empresa === 'Casafruti'
        ? 'casafruti'
        : empresa === 'FoldBox'
          ? 'foldbox'
          : 'all'

  const [dados, setDados] = useState<PenDados | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')

  // modal de alteração de progresso
  const [alvo, setAlvo] = useState<PenInitiative | null>(null)
  const [novoPct, setNovoPct] = useState(0)
  const [justificativa, setJustificativa] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erroModal, setErroModal] = useState('')

  // expandir a coluna 5W2H de uma linha
  const [expandida, setExpandida] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      setDados(await carregarPen(escopo))
    } catch (e: any) {
      setErro(String(e?.message || e))
    } finally {
      setCarregando(false)
    }
  }, [escopo])

  useEffect(() => {
    carregar()
  }, [carregar])

  const iniciativas = dados?.initiatives.dados ?? []
  const ano = isoAno()

  // objeto vinculado
  const objetivoDe = (i: PenInitiative) => {
    const objs = dados?.objectives.dados ?? []
    return objs.find((o) => o.id === i.objetivo_id) || null
  }

  // ---------------- capacidade por dono ----------------
  const capacidade = useMemo(() => {
    const m: Record<string, { qtd: number; aberta: number; peso: number }> = {}
    for (const i of iniciativas) {
      const dono = String(i.owner_id || 'Sem responsável').trim() || 'Sem responsável'
      if (!m[dono]) m[dono] = { qtd: 0, aberta: 0, peso: 0 }
      m[dono].qtd += 1
      const pct = i.progresso ?? 0
      if (pct < 100) {
        m[dono].aberta += 1
        // carga = esforço restante ponderado pelo peso da iniciativa
        m[dono].peso += ((100 - pct) / 100) * (Number(i.weight) || 1)
      }
    }
    const chaves = Object.keys(m)
    // 18/11/2026 — DEFEITO: eu usava "3 iniciativas abertas = 100%" como
    // referência fixa, e a tela mostrava 325% para um dono com UMA iniciativa.
    // Número sem escala, impossível de explicar ao dono.
    //
    // Correção: a referência é RELATIVA — o dono mais carregado é o teto do
    // grupo (100%), e os demais são proporcionais a ele. Assim a barra sempre
    // tem escala e o alerta de 80% compara donos entre si, que é o que a fase
    // pede ("quadro de capacidade por dono com barra de carga e alerta acima
    // de 80%").
    const pesos = chaves.map((d) => m[d].peso)
    const maior = pesos.length ? Math.max.apply(null, pesos) : 0

    const lista = chaves.map((dono) => {
      const o = m[dono]
      const carga = maior > 0 ? Math.round((o.peso / maior) * 100) : 0
      return { dono, ...o, carga }
    })
    return lista.sort((a, b) => b.carga - a.carga)
  }, [iniciativas])

  const acimaDe80 = capacidade.filter((c) => c.carga > 80).length

  // ---------------- escrita ----------------
  function abrirModal(i: PenInitiative) {
    setAlvo(i)
    setNovoPct(i.progresso ?? 0)
    setJustificativa('')
    setErroModal('')
  }

  async function confirmar() {
    if (!alvo) return
    setErroModal('')
    setSalvando(true)
    const r = await atualizarProgresso(
      { id: alvo.id, titulo: alvo.titulo, progresso: alvo.progresso },
      novoPct,
      justificativa,
      usuario,
      workspace,
    )
    setSalvando(false)
    if (!r.ok) {
      setErroModal(r.erro)
      return
    }
    // atualiza só o item no estado (sem recarregar a página inteira)
    setDados((d) =>
      d
        ? {
            ...d,
            initiatives: {
              ...d.initiatives,
              dados: d.initiatives.dados.map((x) =>
                x.id === alvo.id ? { ...x, progresso: novoPct } : x,
              ),
            },
          }
        : d,
    )
    setAviso(`Progresso de "${alvo.titulo}" gravado em pen_audit com justificativa.`)
    setAlvo(null)
  }

  const algumFallback = dados
    ? [dados.initiatives, dados.objectives].some((b) => b.fonte === 'mock')
    : false

  const mesAtual = new Date().getMonth()

  return (
    <div className="space-y-4">
      <SectionHeader
        titulo="Plano de Ação 5W2H"
        descricao={`Iniciativas, Gantt e capacidade por dono — ${empresa} · ${ciclo}`}
        acao={
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-semibold" style={{ color: PEN.textoFraco }}>
              {iniciativas.length} iniciativas
            </span>
            <BotaoExportar
              titulo="Plano de Ação 5W2H"
              pronto={!carregando}
              corpo={() =>
                secao(
                  'Iniciativas — 5W2H, GUT e progresso',
                  tabelaHtml(
                    [
                      'Iniciativa',
                      'What',
                      'Why',
                      'Where',
                      'Who',
                      'When',
                      'Quanto',
                      'GUT',
                      '%',
                      'Status',
                    ],
                    iniciativas.map((i) => {
                      const g = gutDe(i)
                      const cs = corStatus(i.progresso ?? null)
                      return [
                        esc(i.titulo),
                        esc(i.w_what || '—'),
                        esc(i.w_why || '—'),
                        esc(i.w_where || '—'),
                        esc(i.owner_id || '—'),
                        fmtPrazo(i.prazo),
                        i.w_howmuch ? `R$ ${Number(i.w_howmuch).toLocaleString('pt-BR')}` : '—',
                        g === null ? '—' : String(g),
                        {
                          v: `${i.progresso ?? 0}%`,
                          cls: cs.nivel === 'vermelho' ? 'vermelho' : '',
                        },
                        esc(cs.rotulo),
                      ]
                    }),
                    [6, 7, 8],
                  ),
                ) +
                secao(
                  'Capacidade por dono',
                  tabelaHtml(
                    ['Dono', 'Iniciativas', 'Em aberto', 'Carga', 'Situação'],
                    capacidade.map((c) => [
                      esc(c.dono),
                      String(c.qtd),
                      String(c.aberta),
                      `${c.carga}%`,
                      {
                        v: c.carga > 80 ? 'Sobrecarga' : 'Ok',
                        cls: c.carga > 80 ? 'vermelho' : 'verde',
                      },
                    ]),
                    [1, 2, 3],
                  ),
                )
              }
            />
          </div>
        }
      />

      {erro && <ErroBloco mensagem={erro} onTentar={carregar} />}

      {algumFallback && !carregando && (
        <div className="flex items-center gap-2">
          <AvisoFallback />
          <span className="text-[10px]" style={{ color: PEN.textoFraco }}>
            dados de referência do ciclo — banco não respondeu
          </span>
        </div>
      )}

      {aviso && (
        <div
          className="px-3 py-2 text-[11px] font-semibold"
          style={{ background: PEN.sucessoClaro, color: PEN.sucesso, borderRadius: 8 }}
        >
          {aviso}
        </div>
      )}

      {/* ================= DATATABLE 5W2H ================= */}
      <div>
        <SectionHeader
          titulo="Iniciativas"
          descricao="Clique no percentual para atualizar — a alteração exige justificativa e vai para pen_audit."
        />
        {carregando ? (
          <SkeletonTabela linhas={6} colunas={8} />
        ) : (
          <div
            className="overflow-x-auto"
            style={{
              background: PEN.cartao,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.borda}`,
            }}
          >
            <table className="w-full border-collapse text-left">
              <thead>
                <tr style={{ background: '#FAFBFC' }}>
                  {[
                    'ID',
                    'Iniciativa',
                    'Objetivo',
                    'Empresa',
                    '5W2H',
                    'GUT',
                    '% concl.',
                    'Status',
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-wide"
                      style={{ color: PEN.textoFraco, borderBottom: `1px solid ${PEN.borda}` }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {iniciativas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-2 py-6 text-center text-[11.5px]"
                      style={{ color: PEN.textoFraco }}
                    >
                      Nenhuma iniciativa no escopo selecionado.
                    </td>
                  </tr>
                ) : (
                  iniciativas.map((i, idx) => {
                    const pct = i.progresso ?? null
                    const cs = corStatus(pct)
                    const g = gutDe(i)
                    const obj = objetivoDe(i)
                    const ab = expandida === i.id
                    return (
                      // Fragment com key: sem isso o React reclama de chave e
                      // pode reordenar linhas erradas ao expandir/colapsar.
                      <Fragment key={i.id}>
                        <tr className="hover:bg-[#F7F9FA]">
                          <td
                            className="whitespace-nowrap px-2 py-1.5 text-[10px] font-bold tabular-nums"
                            style={{ color: PEN.textoFraco, borderBottom: '1px solid #F0F2F5' }}
                          >
                            INI-{String(idx + 1).padStart(3, '0')}
                          </td>
                          <td
                            className="px-2 py-1.5 text-[11px] font-semibold"
                            style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                          >
                            {i.titulo}
                          </td>
                          <td
                            className="px-2 py-1.5 text-[10px]"
                            style={{
                              color: PEN.textoSecundario,
                              borderBottom: '1px solid #F0F2F5',
                            }}
                          >
                            {obj ? obj.titulo : '—'}
                          </td>
                          <td
                            className="whitespace-nowrap px-2 py-1.5 text-[10px]"
                            style={{
                              color: PEN.textoSecundario,
                              borderBottom: '1px solid #F0F2F5',
                            }}
                          >
                            {i.company_id || '—'}
                          </td>
                          <td className="px-2 py-1.5" style={{ borderBottom: '1px solid #F0F2F5' }}>
                            <button
                              type="button"
                              onClick={() => setExpandida(ab ? null : i.id)}
                              className="rounded px-1.5 py-0.5 text-[9.5px] font-bold"
                              style={{
                                background: ab ? PEN.acentoClaro : '#F1F3F5',
                                color: ab ? PEN.acento : PEN.textoSecundario,
                              }}
                              title="Ver os 7 campos"
                            >
                              {ab ? 'ocultar' : 'ver 5W2H'}
                            </button>
                          </td>
                          <td
                            className="px-2 py-1.5 text-center text-[11px] font-extrabold tabular-nums"
                            style={{
                              color:
                                g === null
                                  ? PEN.textoFraco
                                  : g >= 60
                                    ? SEMAFORO_CORES.vermelho.cor
                                    : g >= 30
                                      ? SEMAFORO_CORES.ambar.cor
                                      : SEMAFORO_CORES.verde.cor,
                              borderBottom: '1px solid #F0F2F5',
                            }}
                            title={
                              g === null
                                ? 'GUT não informado'
                                : `G ${i.gut_g} × U ${i.gut_u} × T ${i.gut_t}`
                            }
                          >
                            {g === null ? '—' : g}
                          </td>
                          <td
                            className="px-2 py-1.5"
                            style={{ borderBottom: '1px solid #F0F2F5', minWidth: 140 }}
                          >
                            <button
                              type="button"
                              onClick={() => abrirModal(i)}
                              className="flex w-full items-center gap-1.5 text-left"
                              title="Alterar % concluído"
                            >
                              <span
                                className="w-9 shrink-0 text-[11px] font-extrabold tabular-nums"
                                style={{ color: cs.cor }}
                              >
                                {pct === null ? '—' : `${pct}%`}
                              </span>
                              <ProgressBar valor={pct} cor={cs.cor} altura={5} />
                            </button>
                          </td>
                          <td
                            className="whitespace-nowrap px-2 py-1.5"
                            style={{ borderBottom: '1px solid #F0F2F5' }}
                          >
                            <span
                              className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                              style={{
                                background: '#FFFFFF',
                                color: cs.cor,
                                border: `1px solid ${cs.cor}44`,
                              }}
                            >
                              {cs.rotulo}
                            </span>
                          </td>
                        </tr>
                        {ab && (
                          <tr>
                            <td
                              colSpan={8}
                              className="px-3 py-2.5"
                              style={{ background: '#FAFBFC', borderBottom: '1px solid #F0F2F5' }}
                            >
                              <div className="grid gap-2 sm:grid-cols-2">
                                {(
                                  [
                                    ['What — o quê', i.w_what],
                                    ['Why — por quê', i.w_why],
                                    ['Where — onde', i.w_where],
                                    ['Who — quem', i.owner_id],
                                    ['When — quando', fmtPrazo(i.prazo)],
                                    ['How — como', i.w_how],
                                    [
                                      'How much — quanto',
                                      i.w_howmuch
                                        ? `R$ ${Number(i.w_howmuch).toLocaleString('pt-BR')}`
                                        : '—',
                                    ],
                                  ] as Array<[string, any]>
                                ).map(([rot, val]) => (
                                  <div key={rot}>
                                    <p
                                      className="text-[9px] font-bold uppercase tracking-wide"
                                      style={{ color: PEN.textoFraco }}
                                    >
                                      {rot}
                                    </p>
                                    <p
                                      className="text-[10.5px] leading-snug"
                                      style={{ color: val ? PEN.texto : PEN.textoFraco }}
                                    >
                                      {val || 'não informado'}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ================= GANTT CSS 12 MESES ================= */}
      <div>
        <SectionHeader
          titulo="Gantt — 12 meses"
          descricao={`Execução no ano de ${ano}, sincronizada com o filtro de empresa.`}
          acao={<BarChart3 className="h-3.5 w-3.5" style={{ color: PEN.textoFraco }} />}
        />
        <div
          className="overflow-x-auto"
          style={{
            background: PEN.cartao,
            borderRadius: PEN.raio,
            border: `1px solid ${PEN.borda}`,
          }}
        >
          <div style={{ minWidth: 780 }}>
            {/* cabeçalho de meses */}
            <div
              className="grid items-center gap-0 px-3 py-1.5"
              style={{
                gridTemplateColumns: `minmax(200px,1fr) repeat(12, 1fr)`,
                background: '#FAFBFC',
                borderBottom: `1px solid ${PEN.borda}`,
              }}
            >
              <span
                className="text-[9.5px] font-bold uppercase tracking-wide"
                style={{ color: PEN.textoFraco }}
              >
                Iniciativa
              </span>
              {MESES.map((m, idx) => (
                <span
                  key={m}
                  className="text-center text-[9px] font-bold uppercase"
                  style={{ color: idx === mesAtual ? PEN.acento : PEN.textoFraco }}
                >
                  {m}
                </span>
              ))}
            </div>

            {iniciativas.length === 0 ? (
              <p className="px-3 py-5 text-center text-[11px]" style={{ color: PEN.textoFraco }}>
                Nenhuma iniciativa no escopo.
              </p>
            ) : (
              iniciativas.map((i) => {
                const ini = mesIndice(i.inicio) ?? 0
                const fim = mesIndice(i.prazo) ?? ini
                const de = Math.min(ini, fim)
                const ate = Math.max(ini, fim)
                const pct = i.progresso ?? 0
                const cs = corStatus(i.progresso ?? null)
                return (
                  <div
                    key={i.id}
                    className="grid items-center px-3 py-1.5"
                    style={{
                      gridTemplateColumns: `minmax(200px,1fr) repeat(12, 1fr)`,
                      borderBottom: '1px solid #F0F2F5',
                    }}
                  >
                    <span
                      className="truncate pr-2 text-[10.5px] font-medium"
                      style={{ color: PEN.texto }}
                      title={i.titulo}
                    >
                      {i.titulo}
                    </span>
                    {MESES.map((_, m) => {
                      const dentro = m >= de && m <= ate
                      const feito = dentro && pct >= ((m - de + 1) / (ate - de + 1)) * 100
                      return (
                        <div key={m} className="flex h-4 items-center justify-center px-0.5">
                          {dentro ? (
                            <div
                              className="h-2.5 w-full rounded-sm"
                              style={{
                                background: feito ? cs.cor : `${cs.cor}33`,
                              }}
                              title={`${MESES[m]} · ${feito ? 'executado' : 'previsto'}`}
                            />
                          ) : (
                            <div
                              className="h-2.5 w-full rounded-sm"
                              style={{ background: '#F5F7F9' }}
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        </div>
        <p className="mt-1 px-1 text-[9.5px]" style={{ color: PEN.textoFraco }}>
          Barra cheia = mês já executado pelo % concluído · barra clara = previsto · cinza = fora da
          janela.
        </p>
      </div>

      {/* ================= CAPACIDADE POR DONO ================= */}
      <div>
        <SectionHeader
          titulo="Capacidade por dono"
          descricao="Carga relativa: o dono mais carregado é o teto (100%) e os demais são proporcionais. Alerta acima de 80% do teto."
          acao={
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold"
              style={{ color: PEN.textoFraco }}
            >
              <Users className="h-3 w-3" />
              {capacidade.length} donos
            </span>
          }
        />
        {acimaDe80 > 0 && (
          <div
            className="mb-2 flex items-center gap-2 px-3 py-2"
            style={{
              background: PEN.criticoClaro,
              borderRadius: 8,
              border: `1px solid ${PEN.critico}33`,
            }}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" style={{ color: PEN.critico }} />
            <p className="text-[11px] font-semibold" style={{ color: PEN.critico }}>
              {acimaDe80} dono{acimaDe80 > 1 ? 's' : ''} acima de 80% de carga — risco de não
              entregar no prazo.
            </p>
          </div>
        )}

        {carregando ? (
          <SkeletonTabela linhas={3} colunas={3} />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {capacidade.length === 0 ? (
              <p className="text-[11px]" style={{ color: PEN.textoFraco }}>
                Nenhum dono atribuído no escopo.
              </p>
            ) : (
              capacidade.map((c) => {
                const alto = c.carga > 80
                const cor = alto
                  ? SEMAFORO_CORES.vermelho.cor
                  : c.carga > 60
                    ? SEMAFORO_CORES.ambar.cor
                    : SEMAFORO_CORES.verde.cor
                return (
                  <div
                    key={c.dono}
                    className="p-2.5"
                    style={{
                      background: PEN.cartao,
                      borderRadius: PEN.raio,
                      border: `1px solid ${PEN.borda}`,
                      borderLeft: `3px solid ${cor}`,
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className="min-w-0 truncate text-[11.5px] font-bold"
                        style={{ color: PEN.texto }}
                      >
                        {c.dono}
                      </p>
                      <span
                        className="shrink-0 text-[12px] font-extrabold tabular-nums"
                        style={{ color: cor }}
                      >
                        {c.carga}%
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <ProgressBar valor={Math.min(c.carga, 100)} cor={cor} altura={6} />
                    </div>
                    <p className="mt-1 text-[10px]" style={{ color: PEN.textoSecundario }}>
                      {c.qtd} iniciativa{c.qtd > 1 ? 's' : ''} · {c.aberta} em aberto
                      {alto && (
                        <span className="font-bold" style={{ color: cor }}>
                          {' '}
                          · sobrecarga
                        </span>
                      )}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* ================= MODAL DE PROGRESSO ================= */}
      {alvo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,30,46,.45)' }}
          onClick={() => !salvando && setAlvo(null)}
        >
          <div
            className="w-full max-w-md p-4"
            style={{ background: '#FFFFFF', borderRadius: PEN.raio }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <History className="h-4 w-4" style={{ color: PEN.acento }} />
              <p className="text-[13px] font-bold" style={{ color: PEN.texto }}>
                Atualizar % concluído
              </p>
            </div>
            <p className="mt-0.5 text-[11px]" style={{ color: PEN.textoSecundario }}>
              {alvo.titulo}
            </p>

            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                value={novoPct}
                onChange={(e) => setNovoPct(Number(e.target.value))}
                className="min-w-0 flex-1"
              />
              <span
                className="w-12 shrink-0 text-right text-[15px] font-extrabold tabular-nums"
                style={{ color: corStatus(novoPct).cor }}
              >
                {novoPct}%
              </span>
            </div>
            <p className="mt-0.5 text-[10px]" style={{ color: PEN.textoFraco }}>
              Atual: {alvo.progresso ?? 0}% · prazo {fmtPrazo(alvo.prazo)}
            </p>

            <label className="mt-3 block text-[10.5px] font-bold" style={{ color: PEN.texto }}>
              Justificativa (mínimo 10 caracteres)
            </label>
            <textarea
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border p-2 text-[12px]"
              style={{ borderColor: PEN.borda }}
              placeholder="O que foi entregue para justificar este percentual?"
              autoFocus
            />

            {erroModal && (
              <p className="mt-2 text-[11px] font-semibold" style={{ color: PEN.critico }}>
                {erroModal}
              </p>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAlvo(null)}
                disabled={salvando}
                className="rounded-md px-3 py-1.5 text-[11.5px] font-bold"
                style={{ background: '#F1F3F5', color: PEN.textoSecundario }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmar}
                disabled={salvando || justificativa.trim().length < 10}
                className="rounded-md px-3 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-40"
                style={{ background: PEN.acento }}
              >
                {salvando ? 'Gravando…' : 'Gravar'}
              </button>
            </div>
            <p className="mt-2 text-[9.5px]" style={{ color: PEN.textoFraco }}>
              Grava em pen_audit: usuário, horário, valor anterior, novo valor e justificativa.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
