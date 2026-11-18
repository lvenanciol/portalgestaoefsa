import { useMemo, useState } from 'react'
import { Eye, TrendingUp, TrendingDown, Minus, ChevronRight, Link2 } from 'lucide-react'
import { PEN, SEMAFORO_CORES, type Semaforo } from '@/pen/tokens'
import { SectionHeader } from '@/pen/components'
import { BotaoExportar, tabelaHtml, secao, esc } from '@/pen/components/BotaoExportar'
import { usePenFiltro } from '@/pen/PenShell'

// ============================================================================
// FASE 2.3 — DIAGNÓSTICO DE AMBIENTE  (SOMENTE LEITURA)
//
// Blocos:
//   1. 6 cards PESTEL — 2 fatores cada, com impacto Alto/Médio/Baixo
//   2. Matriz SWOT 2x2 — cada item carrega empresa, evidência e responsável
//   3. Matriz FOFA — 4 estratégias derivadas, CLICÁVEIS, exibindo a força e a
//      oportunidade de origem
//   4. Resumo das 5 Forças de Porter
//   5. Cadeia de valor com elos críticos destacados
//
// Diretiva: "Somente leitura nesta etapa" — nenhum campo editável, nenhum
// botão de salvar. É tela de leitura por decisão, não por falta de tempo.
// ============================================================================

type Impacto = 'alto' | 'medio' | 'baixo'
type OrigemSWOT = 'forca' | 'fraqueza' | 'oportunidade' | 'ameaca'

interface FatorPestel {
  letra: string
  nome: string
  fatores: Array<{ texto: string; impacto: Impacto }>
}

const PESTEL: FatorPestel[] = [
  {
    letra: 'P',
    nome: 'Político',
    fatores: [
      {
        texto: 'Reforma tributária em transição altera a apuração de ICMS/PIS/COFINS no ciclo.',
        impacto: 'alto',
      },
      { texto: 'Regras de rotulagem nutricional exigem adequação de embalagem.', impacto: 'medio' },
    ],
  },
  {
    letra: 'E',
    nome: 'Econômico',
    fatores: [
      {
        texto: 'Inflação de perecíveis acima do IPCA comprime a margem do varejo.',
        impacto: 'alto',
      },
      { texto: 'Custo de capital elevado encarece a expansão de lojas.', impacto: 'alto' },
    ],
  },
  {
    letra: 'S',
    nome: 'Social',
    fatores: [
      {
        texto: 'Busca por conveniência e compra mais frequente em menor volume.',
        impacto: 'medio',
      },
      { texto: 'Escassez de mão de obra para reposição e operação de loja.', impacto: 'alto' },
    ],
  },
  {
    letra: 'T',
    nome: 'Tecnológico',
    fatores: [
      { texto: 'Integração Sankhya/ERP permite apuração fiscal automatizada.', impacto: 'alto' },
      { texto: 'Marketplaces e venda direta abrem canal sem loja física.', impacto: 'medio' },
    ],
  },
  {
    letra: 'E',
    nome: 'Ambiental',
    fatores: [
      {
        texto: 'Cadeia de frio e descarte de perecíveis sob pressão de conformidade.',
        impacto: 'alto',
      },
      { texto: 'Embalagem retornável ganha tração como redução de resíduo.', impacto: 'medio' },
    ],
  },
  {
    letra: 'L',
    nome: 'Legal',
    fatores: [
      {
        texto: 'LGPD exige controle de acesso e trilha de auditoria nos sistemas.',
        impacto: 'medio',
      },
      { texto: 'Normas sanitárias de transporte e armazenagem de fresco.', impacto: 'alto' },
    ],
  },
]

interface ItemSwot {
  id: string
  origem: OrigemSWOT
  texto: string
  empresa: string
  evidencia: string
  responsavel: string
}

const SWOT: ItemSwot[] = [
  {
    id: 'f1',
    origem: 'forca',
    texto: 'Malha de distribuição própria com entrega programada',
    empresa: 'Extrafruti',
    evidência: 'Ruptura média de 2,1% no trimestre contra 5,4% do mercado local.',
    responsavel: 'Diretoria de Operações',
  },
  {
    id: 'f2',
    origem: 'forca',
    texto: 'Relação longa com fornecedores de hortifruti',
    empresa: 'Casafruti',
    evidência: '92% das compras com contrato vigente e prazo médio de 38 dias.',
    responsavel: 'Comercial Casafruti',
  },
  {
    id: 'fr1',
    origem: 'fraqueza',
    texto: 'Turnover operacional de 5,4% ao mês',
    empresa: 'Extrafruti',
    evidência: 'Meta de 3,0%; 16 tarefas atrasadas concentradas em operação de loja.',
    responsavel: 'Gestão de Pessoas',
  },
  {
    id: 'fr2',
    origem: 'fraqueza',
    texto: 'Inventário em ondas impede apurar a quebra com precisão',
    empresa: 'Extrafruti',
    evidência: 'EI de 413 produtos contra EF de 254 em outubro — bases diferentes.',
    responsavel: 'Controladoria',
  },
  {
    id: 'o1',
    origem: 'oportunidade',
    texto: 'Embalagem retornável sob contrato no atacarejo',
    empresa: 'FoldBox',
    evidência: 'Receita de R$ 3,65 mi com 3 operadores em negociação.',
    responsavel: 'Diretoria FoldBox',
  },
  {
    id: 'o2',
    origem: 'oportunidade',
    texto: 'Automação fiscal liberando time de controladoria',
    empresa: 'Extrafruti',
    evidência: '35% do processo já automatizado; meta de 70% no ciclo.',
    responsavel: 'Tecnologia e Controladoria',
  },
  {
    id: 'a1',
    origem: 'ameaca',
    texto: 'Entrada de atacarejo regional com preço agressivo',
    empresa: 'Casafruti',
    evidência: 'Duas inaugurações no raio de 3 km das lojas âncora.',
    responsavel: 'Comercial Casafruti',
  },
  {
    id: 'a2',
    origem: 'ameaca',
    texto: 'Escassez de mão de obra para reposição',
    empresa: 'Extrafruti',
    evidência: 'Tempo médio de vaga aberta subiu de 12 para 27 dias.',
    responsavel: 'Gestão de Pessoas',
  },
]

interface EstrategiaFofa {
  id: string
  nome: string
  tipo: 'ofensiva' | 'defensiva' | 'reforco' | 'reducao'
  descricao: string
  /** ids no SWOT que originam a estratégia */
  forcas: string[]
  oportunidades: string[]
}

const FOFA: EstrategiaFofa[] = [
  {
    id: 'e1',
    nome: 'Ofensiva: escala na malha própria',
    tipo: 'ofensiva',
    descricao:
      'Usar a malha de entrega programada para sustentar o contrato de retornáveis no atacarejo, vendendo o ganho de ruptura como prova.',
    forcas: ['f1'],
    oportunidades: ['o1'],
  },
  {
    id: 'e2',
    nome: 'Defensiva: barrar o atacarejo no preço',
    tipo: 'defensiva',
    descricao:
      'Antecipar negociação de contrato com fornecedores de hortifruti para sustentar preço estável nas lojas âncora.',
    forcas: ['f2'],
    oportunidades: ['a1'],
  },
  {
    id: 'e3',
    nome: 'Reforço: automação fiscal contra turnover',
    tipo: 'reforco',
    descricao:
      'Acelerar a automação fiscal para liberar horas de controladoria e realocar esse time na rotina de loja.',
    forcas: ['o2'],
    oportunidades: ['fr1'],
  },
  {
    id: 'e4',
    nome: 'Redução: inventário confiável contra escassez',
    tipo: 'reducao',
    descricao:
      'Fechar o inventário em base única para reduzir reposição manual e dependência de mão de obra escassa.',
    forcas: ['fr2'],
    oportunidades: ['a2'],
  },
]

interface ForcaPorter {
  nome: string
  intensidade: Impacto
  resumo: string
  evidencia: string
}

const PORTER: ForcaPorter[] = [
  {
    nome: 'Rivalidade entre concorrentes',
    intensidade: 'alto',
    resumo: 'Atacarejo regional compete por preço no mesmo raio de loja.',
    evidencia: '2 inaugurações no raio de 3 km das lojas âncora em 12 meses.',
  },
  {
    nome: 'Poder de barganha dos fornecedores',
    intensidade: 'medio',
    resumo: 'Hortifruti tem contrato longo; perecíveis de terceiros não.',
    evidencia: '92% das compras contratadas, prazo médio de 38 dias.',
  },
  {
    nome: 'Poder de barganha dos clientes',
    intensidade: 'alto',
    resumo: 'Cliente de varejo compara preço na hora; atacado negocia volume.',
    evidencia: 'Ticket médio estável e migração para compras menores e frequentes.',
  },
  {
    nome: 'Ameaça de novos entrantes',
    intensidade: 'medio',
    resumo: 'Operar fresco exige cadeia de frio e capital de giro alto.',
    evidencia: 'Custo de capital elevado encarece a abertura de loja nova.',
  },
  {
    nome: 'Ameaça de substitutos',
    intensidade: 'baixo',
    resumo: 'Entrega por aplicativo complementa, não substitui a compra do dia.',
    evidencia: 'Marketplaces representam parcela pequena do volume.',
  },
]

interface Elo {
  nome: string
  critico: boolean
  nota: string
}

const CADEIA: Array<{ bloco: string; elos: Elo[] }> = [
  {
    bloco: 'Primário',
    elos: [
      {
        nome: 'Suprimento de hortifruti',
        critico: true,
        nota: 'Contrato e prazo definem preço e disponibilidade.',
      },
      {
        nome: 'Armazenagem em câmara fria',
        critico: true,
        nota: 'Falha aqui vira quebra e perda de margem.',
      },
      {
        nome: 'Distribuição e roteirização',
        critico: true,
        nota: 'A malha própria é a vantagem competitiva.',
      },
      {
        nome: 'Operação de loja',
        critico: true,
        nota: 'Turnover de 5,4% pressiona reposição e atendimento.',
      },
      {
        nome: 'Atendimento ao cliente',
        critico: false,
        nota: 'Padronizado, menor variância entre lojas.',
      },
    ],
  },
  {
    bloco: 'Apoio',
    elos: [
      { nome: 'Compras e negociação', critico: true, nota: 'Define custo e sustentação de preço.' },
      {
        nome: 'Gestão de pessoas',
        critico: true,
        nota: 'Retenção é o gargalo declarado do ciclo.',
      },
      {
        nome: 'Tecnologia e ERP',
        critico: false,
        nota: 'Automação fiscal em curso, não bloqueia hoje.',
      },
      {
        nome: 'Controladoria',
        critico: false,
        nota: 'Depende do inventário único para fechar a apuração.',
      },
    ],
  },
]

const COR_IMPACTO: Record<Impacto, { cor: string; rotulo: string }> = {
  alto: { cor: SEMAFORO_CORES.vermelho.cor, rotulo: 'Alto' },
  medio: { cor: SEMAFORO_CORES.ambar.cor, rotulo: 'Médio' },
  baixo: { cor: SEMAFORO_CORES.verde.cor, rotulo: 'Baixo' },
}

const ESTILO_SWOT: Record<OrigemSWOT, { titulo: string; cor: string; fundo: string }> = {
  forca: { titulo: 'Forças', cor: SEMAFORO_CORES.verde.cor, fundo: PEN.sucessoClaro },
  fraqueza: { titulo: 'Fraquezas', cor: SEMAFORO_CORES.vermelho.cor, fundo: PEN.criticoClaro },
  oportunidade: { titulo: 'Oportunidades', cor: PEN.acento, fundo: PEN.acentoClaro },
  ameaca: { titulo: 'Ameaças', cor: SEMAFORO_CORES.ambar.cor, fundo: PEN.atencaoClaro },
}

function IconeImpacto({ nivel }: { nivel: Impacto }) {
  const cor = COR_IMPACTO[nivel].cor
  if (nivel === 'alto') return <TrendingUp className="h-3 w-3" style={{ color: cor }} />
  if (nivel === 'medio') return <Minus className="h-3 w-3" style={{ color: cor }} />
  return <TrendingDown className="h-3 w-3" style={{ color: cor }} />
}

export default function PenDiagnosticoPage() {
  const { empresa, ciclo } = usePenFiltro()
  const [aberta, setAberta] = useState<string | null>('e1')

  // filtro global filtra por empresa quando não é "Todas"
  const filtraEmpresa = (e: string) => empresa === 'Todas' || e === empresa

  const swotVisivel = useMemo(() => SWOT.filter((s) => filtraEmpresa(s.empresa)), [empresa])
  const fofaVisivel = useMemo(() => {
    if (empresa === 'Todas') return FOFA
    const ids = new Set(swotVisivel.map((s) => s.id))
    return FOFA.filter(
      (e) => e.forcas.some((f) => ids.has(f)) || e.oportunidades.some((o) => ids.has(o)),
    )
  }, [empresa, swotVisivel])

  const itemPorId = useMemo(() => {
    const m: Record<string, ItemSwot> = {}
    for (const s of SWOT) m[s.id] = s
    return m
  }, [])

  const criticos = CADEIA.reduce((n, b) => n + b.elos.filter((e) => e.critico).length, 0)

  return (
    <div className="space-y-4">
      <SectionHeader
        titulo="Diagnóstico de Ambiente"
        descricao={`PESTEL, SWOT, FOFA, Porter e cadeia de valor — ${empresa} · ${ciclo}`}
        acao={
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-bold"
              style={{ background: '#F1F3F5', color: PEN.textoSecundario, borderRadius: 6 }}
            >
              <Eye className="h-3 w-3" />
              somente leitura
            </span>
            <BotaoExportar
              titulo="Diagnóstico de Ambiente"
              corpo={() =>
                secao(
                  'PESTEL — 6 dimensões',
                  tabelaHtml(
                    ['Dimensão', 'Fator', 'Impacto'],
                    PESTEL.flatMap((d) =>
                      d.fatores.map((f) => [
                        esc(d.nome),
                        esc(f.texto),
                        {
                          v: COR_IMPACTO[f.impacto].rotulo,
                          cls:
                            f.impacto === 'alto'
                              ? 'vermelho'
                              : f.impacto === 'medio'
                                ? 'ambar'
                                : 'verde',
                        },
                      ]),
                    ),
                  ),
                ) +
                secao(
                  'Matriz SWOT',
                  tabelaHtml(
                    ['Tipo', 'Item', 'Empresa', 'Evidência', 'Responsável'],
                    swotVisivel.map((s) => [
                      esc(ESTILO_SWOT[s.origem].titulo),
                      esc(s.texto),
                      esc(s.empresa),
                      esc(s.evidencia),
                      esc(s.responsavel),
                    ]),
                  ),
                ) +
                secao(
                  'Matriz FOFA — estratégias derivadas',
                  tabelaHtml(
                    ['Estratégia', 'Tipo', 'Descrição'],
                    fofaVisivel.map((e) => [esc(e.nome), esc(e.tipo), esc(e.descricao)]),
                  ),
                ) +
                secao(
                  '5 Forças de Porter',
                  tabelaHtml(
                    ['Força', 'Intensidade', 'Resumo', 'Evidência'],
                    PORTER.map((f) => [
                      esc(f.nome),
                      {
                        v: COR_IMPACTO[f.intensidade].rotulo,
                        cls:
                          f.intensidade === 'alto'
                            ? 'vermelho'
                            : f.intensidade === 'medio'
                              ? 'ambar'
                              : 'verde',
                      },
                      esc(f.resumo),
                      esc(f.evidencia),
                    ]),
                  ),
                ) +
                secao(
                  'Cadeia de valor',
                  tabelaHtml(
                    ['Bloco', 'Elo', 'Crítico', 'Observação'],
                    CADEIA.flatMap((b) =>
                      b.elos.map((e) => [
                        esc(b.bloco),
                        esc(e.nome),
                        { v: e.critico ? 'Sim' : 'Não', cls: e.critico ? 'vermelho' : '' },
                        esc(e.nota),
                      ]),
                    ),
                  ),
                )
              }
            />
          </div>
        }
      />

      {/* ================= PESTEL ================= */}
      <div>
        <SectionHeader
          titulo="PESTEL — 6 dimensões"
          descricao="Dois fatores por dimensão, com impacto no ciclo."
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PESTEL.map((d) => (
            <div
              key={d.letra + d.nome}
              className="p-3"
              style={{
                background: PEN.cartao,
                borderRadius: PEN.raio,
                border: `1px solid ${PEN.borda}`,
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-extrabold text-white"
                  style={{ background: PEN.acento }}
                >
                  {d.letra}
                </span>
                <p className="text-[12px] font-bold" style={{ color: PEN.texto }}>
                  {d.nome}
                </p>
              </div>
              <div className="mt-2 space-y-1.5">
                {d.fatores.map((f) => (
                  <div key={f.texto} className="flex items-start gap-1.5">
                    <span className="mt-0.5 shrink-0">
                      <IconeImpacto nivel={f.impacto} />
                    </span>
                    <div className="min-w-0">
                      <p
                        className="text-[10.5px] leading-snug"
                        style={{ color: PEN.textoSecundario }}
                      >
                        {f.texto}
                      </p>
                      <span
                        className="mt-0.5 inline-block text-[9px] font-bold uppercase tracking-wide"
                        style={{ color: COR_IMPACTO[f.impacto].cor }}
                      >
                        impacto {COR_IMPACTO[f.impacto].rotulo}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ================= SWOT 2x2 ================= */}
      <div>
        <SectionHeader
          titulo="Matriz SWOT"
          descricao="Cada item com empresa, evidência e responsável."
        />
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ['forca', 'fraqueza'],
              ['oportunidade', 'ameaca'],
            ] as OrigemSWOT[][]
          ).map((linha, li) => (
            <div key={li} className="contents">
              {linha.map((origem) => {
                const est = ESTILO_SWOT[origem]
                const itens = swotVisivel.filter((s) => s.origem === origem)
                return (
                  <div
                    key={origem}
                    className="p-3"
                    style={{
                      background: PEN.cartao,
                      borderRadius: PEN.raio,
                      border: `1px solid ${PEN.borda}`,
                      borderTop: `3px solid ${est.cor}`,
                    }}
                  >
                    <div className="flex items-baseline justify-between">
                      <p
                        className="text-[11.5px] font-bold uppercase tracking-wide"
                        style={{ color: est.cor }}
                      >
                        {est.titulo}
                      </p>
                      <span className="text-[10px]" style={{ color: PEN.textoFraco }}>
                        {itens.length}
                      </span>
                    </div>
                    <div className="mt-1.5 space-y-2">
                      {itens.length === 0 ? (
                        <p className="text-[10.5px]" style={{ color: PEN.textoFraco }}>
                          Nenhum item no escopo selecionado.
                        </p>
                      ) : (
                        itens.map((s) => (
                          <div
                            key={s.id}
                            className="rounded-md p-2"
                            style={{ background: est.fundo }}
                          >
                            <p
                              className="text-[11px] font-semibold leading-snug"
                              style={{ color: PEN.texto }}
                            >
                              {s.texto}
                            </p>
                            <p
                              className="mt-1 text-[10px] leading-snug"
                              style={{ color: PEN.textoSecundario }}
                            >
                              <span className="font-bold">Evidência: </span>
                              {s.evidencia}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9.5px]">
                              <span
                                className="rounded px-1 py-0.5 font-bold"
                                style={{ background: '#FFFFFF', color: PEN.texto }}
                              >
                                {s.empresa}
                              </span>
                              <span style={{ color: PEN.textoFraco }}>{s.responsavel}</span>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ================= FOFA ================= */}
      <div>
        <SectionHeader
          titulo="Matriz FOFA — estratégias derivadas"
          descricao="Clique numa estratégia para ver a força e a oportunidade que a originaram."
        />
        <div className="space-y-2">
          {fofaVisivel.length === 0 ? (
            <p className="px-3 py-4 text-[11.5px]" style={{ color: PEN.textoFraco }}>
              Nenhuma estratégia derivada no escopo selecionado.
            </p>
          ) : (
            fofaVisivel.map((e) => {
              const ab = aberta === e.id
              return (
                <div
                  key={e.id}
                  style={{
                    background: PEN.cartao,
                    borderRadius: PEN.raio,
                    border: `1px solid ${ab ? PEN.acento : PEN.borda}`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setAberta(ab ? null : e.id)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                  >
                    <ChevronRight
                      className="h-3.5 w-3.5 shrink-0 transition-transform"
                      style={{
                        color: PEN.acento,
                        transform: ab ? 'rotate(90deg)' : 'none',
                      }}
                    />
                    <span
                      className="min-w-0 flex-1 text-[11.5px] font-bold"
                      style={{ color: PEN.texto }}
                    >
                      {e.nome}
                    </span>
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                      style={{ background: PEN.acentoClaro, color: PEN.acento }}
                    >
                      {e.tipo}
                    </span>
                  </button>
                  {ab && (
                    <div className="px-3 pb-3" style={{ borderTop: `1px solid #F0F2F5` }}>
                      <p
                        className="mt-2 text-[11px] leading-relaxed"
                        style={{ color: PEN.textoSecundario }}
                      >
                        {e.descricao}
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {[...e.forcas, ...e.oportunidades].map((id) => {
                          const o = itemPorId[id]
                          if (!o) return null
                          const est = ESTILO_SWOT[o.origem]
                          return (
                            <div
                              key={id}
                              className="flex items-start gap-1.5 rounded-md p-1.5"
                              style={{ background: est.fundo }}
                            >
                              <Link2
                                className="mt-0.5 h-3 w-3 shrink-0"
                                style={{ color: est.cor }}
                              />
                              <div className="min-w-0">
                                <span
                                  className="text-[9px] font-bold uppercase tracking-wide"
                                  style={{ color: est.cor }}
                                >
                                  {o.origem}
                                </span>
                                <p
                                  className="text-[10.5px] leading-snug"
                                  style={{ color: PEN.texto }}
                                >
                                  {o.texto}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ================= PORTER + CADEIA ================= */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <SectionHeader
            titulo="5 Forças de Porter"
            descricao="Intensidade de cada força no ambiente do grupo."
          />
          <div
            className="overflow-hidden"
            style={{
              background: PEN.cartao,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.borda}`,
            }}
          >
            {PORTER.map((f, i) => {
              const c = COR_IMPACTO[f.intensidade]
              return (
                <div
                  key={f.nome}
                  className="px-3 py-2.5"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #F0F2F5' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11.5px] font-bold" style={{ color: PEN.texto }}>
                      {f.nome}
                    </p>
                    <span
                      className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                      style={{
                        background: '#FFFFFF',
                        color: c.cor,
                        border: `1px solid ${c.cor}33`,
                      }}
                    >
                      {c.rotulo}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 text-[10.5px] leading-snug"
                    style={{ color: PEN.textoSecundario }}
                  >
                    {f.resumo}
                  </p>
                  <p className="mt-1 text-[9.5px] leading-snug" style={{ color: PEN.textoFraco }}>
                    {f.evidencia}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <SectionHeader
            titulo="Cadeia de valor"
            descricao={`${criticos} elos críticos destacados.`}
          />
          <div className="space-y-3">
            {CADEIA.map((b) => (
              <div
                key={b.bloco}
                className="p-3"
                style={{
                  background: PEN.cartao,
                  borderRadius: PEN.raio,
                  border: `1px solid ${PEN.borda}`,
                }}
              >
                <p
                  className="text-[9.5px] font-bold uppercase tracking-wider"
                  style={{ color: PEN.textoFraco }}
                >
                  Atividades {b.bloco.toLowerCase()}s
                </p>
                <div className="mt-1.5 space-y-1">
                  {b.elos.map((e) => (
                    <div
                      key={e.nome}
                      className="flex items-start gap-2 rounded-md px-2 py-1.5"
                      style={{
                        background: e.critico ? PEN.criticoClaro : '#FAFBFC',
                        borderLeft: `2px solid ${e.critico ? SEMAFORO_CORES.vermelho.cor : '#E3E7EC'}`,
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold" style={{ color: PEN.texto }}>
                          {e.nome}
                          {e.critico && (
                            <span
                              className="ml-1.5 text-[9px] font-bold uppercase"
                              style={{ color: SEMAFORO_CORES.vermelho.cor }}
                            >
                              crítico
                            </span>
                          )}
                        </p>
                        <p
                          className="text-[10px] leading-snug"
                          style={{ color: PEN.textoSecundario }}
                        >
                          {e.nota}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
