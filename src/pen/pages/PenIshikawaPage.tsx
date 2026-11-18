import { useMemo, useState } from 'react'
import { Eye, ChevronDown, ArrowRight, Crosshair, FileSearch } from 'lucide-react'
import { PEN, SEMAFORO_CORES } from '@/pen/tokens'
import { SectionHeader } from '@/pen/components'
import { BotaoExportar, tabelaHtml, secao, esc } from '@/pen/components/BotaoExportar'
import { usePenFiltro } from '@/pen/PenShell'

// ============================================================================
// FASE 2.4 — ISHIKAWA (causa e efeito)  ·  SOMENTE LEITURA
//
// Referência visual: mockup do módulo PEN (dropdown de desvio no topo,
// espinha de peixe com 6 ramos em SVG, tabela de priorização GUT à direita e
// bloco 5 Porquês abaixo).
//
// Estrutura:
//   · dropdown de desvio — troca o diagrama inteiro
//   · SVG: espinha central + 6 ramos (Máquina, Método, Mão de obra, Material,
//     Meio ambiente, Medição), cada causa com dot de status
//   · tabela de priorização: causa, ramo, G, U, T, score GUT e evidência
//   · clicar numa causa abre o bloco 5 Porquês encadeado até a causa raiz
//
// Status da causa: validada (verde) · a_validar (âmbar) · descartada (cinza)
// ============================================================================

type Ramo = 'maquina' | 'metodo' | 'mao_de_obra' | 'material' | 'meio_ambiente' | 'medicao'

type StatusCausa = 'validada' | 'a_validar' | 'descartada'

interface Causa {
  id: string
  texto: string
  ramo: Ramo
  status: StatusCausa
  G: number // gravidade 1-5
  U: number // urgência 1-5
  T: number // tendência 1-5
  evidencia: string
  porques: string[]
}

interface Desvio {
  id: string
  nome: string
  causaRaiz: string
}

const DESVIOS: Desvio[] = [
  {
    id: 'des-01',
    nome: 'Turnover operacional acima da meta',
    causaRaiz: 'Ausência de trilha de liderança e escala previsível no chão de operação',
  },
  {
    id: 'des-02',
    nome: 'Quebra de perecíveis acima do teto',
    causaRaiz: 'Falta de controle de temperatura automatizado e inventário em base única',
  },
  {
    id: 'des-03',
    nome: 'Receita FoldBox abaixo do plano',
    causaRaiz: 'Ciclo consultivo sem funil de prospecção ativo e portfólio digital',
  },
]

const RAMOS: Array<{ key: Ramo; nome: string }> = [
  { key: 'maquina', nome: 'Máquina' },
  { key: 'metodo', nome: 'Método' },
  { key: 'mao_de_obra', nome: 'Mão de obra' },
  { key: 'material', nome: 'Material' },
  { key: 'meio_ambiente', nome: 'Meio ambiente' },
  { key: 'medicao', nome: 'Medição' },
]

// 18 causas — 3 por ramo, como no mockup
const CAUSAS: Causa[] = [
  // ---- MÁQUINA ----
  {
    id: 'm1',
    texto: 'Escala sem cobertura nos picos',
    ramo: 'maquina',
    status: 'validada',
    G: 4,
    U: 4,
    T: 4,
    evidencia: 'Relatório de ponto por loja em out/26: 38% dos picos sem folguista.',
    porques: [
      'Por que a escala não cobre os picos? Porque é montada por loja, sem visão de demanda.',
      'Por que é montada por loja? Porque não há previsão de fluxo compartilhada.',
      'Por que não há previsão de fluxo? Porque o dado de venda por hora não é usado na escala.',
      'Por que o dado não é usado? Porque a rotina de escala não tem dono definido.',
      'Causa raiz: falta de dono e de rotina de dimensionamento de escala.',
    ],
  },
  {
    id: 'm2',
    texto: 'Câmara sem controle automático',
    ramo: 'maquina',
    status: 'validada',
    G: 5,
    U: 4,
    T: 4,
    evidencia: 'Leituras de temperatura manuais, 2 vezes ao dia, em planilha.',
    porques: [
      'Por que a quebra sobe? Porque a temperatura oscila fora da faixa.',
      'Por que oscila? Porque o controle é manual e depende de quem abre a câmara.',
      'Por que depende de pessoa? Porque não há sensor com alarme automático.',
      'Por que não há sensor? Porque o investimento não entrou no orçamento de capital.',
      'Causa raiz: ausência de controle de temperatura automatizado.',
    ],
  },
  {
    id: 'm3',
    texto: 'Manutenção preventiva em atraso',
    ramo: 'maquina',
    status: 'a_validar',
    G: 3,
    U: 3,
    T: 3,
    evidencia: '12 equipamentos com preventiva vencida há mais de 30 dias.',
    porques: [
      'Por que há parada de equipamento? Porque a preventiva está em atraso.',
      'Por que está em atraso? Porque não há plano de manutenção definido.',
      'Por que não há plano? Porque a gestão de ativos não é estruturada.',
      'Por que não é estruturada? Porque não há responsável pela função.',
      'Causa raiz: gestão de ativos sem estrutura e sem dono.',
    ],
  },
  // ---- MÉTODO ----
  {
    id: 'me1',
    texto: 'Escala 6x1 sem padrão de troca',
    ramo: 'metodo',
    status: 'validada',
    G: 5,
    U: 5,
    T: 4,
    evidencia: 'Três modelos distintos de escala convivendo entre lojas.',
    porques: [
      'Por que o turnover é alto? Porque a jornada é imprevisível.',
      'Por que é imprevisível? Porque cada loja monta a escala de um jeito.',
      'Por que cada loja monta? Porque não há procedimento padrão publicado.',
      'Por que não há procedimento? Porque nunca foi formalizado pela operação.',
      'Causa raiz: falta de padronização da escala.',
    ],
  },
  {
    id: 'me2',
    texto: 'Inventário em ondas, base diferente',
    ramo: 'metodo',
    status: 'validada',
    G: 5,
    U: 4,
    T: 4,
    evidencia: 'EI com 413 produtos contra EF com 254 em out/26.',
    porques: [
      'Por que a quebra não fecha? Porque EI e EF vêm de contagens diferentes.',
      'Por que são diferentes? Porque o inventário roda em ondas parciais.',
      'Por que roda em ondas? Porque não há parada programada para contagem total.',
      'Por que não há parada? Porque a operação não abre mão de um dia de venda.',
      'Causa raiz: inventário sem base única e sem janela programada.',
    ],
  },
  {
    id: 'me3',
    texto: 'Procedimento de recebimento desatualizado',
    ramo: 'metodo',
    status: 'a_validar',
    G: 3,
    U: 3,
    T: 3,
    evidencia: 'POP de recebimento é de 2023 e não cita conferência de validade.',
    porques: [
      'Por que entra lote vencido? Porque o recebimento confere quantidade, não validade.',
      'Por que não confere? Porque o POP não exige essa etapa.',
      'Por que não exige? Porque o procedimento não é revisado desde 2023.',
      'Por que não é revisado? Porque não há ciclo de revisão definido.',
      'Causa raiz: ausência de ciclo de revisão de procedimentos.',
    ],
  },
  // ---- MÃO DE OBRA ----
  {
    id: 'mo1',
    texto: 'Líder de turno sem formação',
    ramo: 'mao_de_obra',
    status: 'validada',
    G: 4,
    U: 4,
    T: 4,
    evidencia: '68% dos líderes de turno promovidos sem trilha de formação.',
    porques: [
      'Por que a equipe sai? Porque não há acompanhamento de perto.',
      'Por que não há? Porque o líder não foi formado para conduzir gente.',
      'Por que não foi? Porque a promoção é por tempo de casa, sem trilha.',
      'Por que a promoção é por tempo? Porque não existe critério de competência.',
      'Causa raiz: promoção sem trilha de liderança.',
    ],
  },
  {
    id: 'mo2',
    texto: 'Salário de entrada abaixo do mercado',
    ramo: 'mao_de_obra',
    status: 'a_validar',
    G: 3,
    U: 4,
    T: 3,
    evidencia: 'Faixa de repositor 8% abaixo da mediana regional (pesquisa interna).',
    porques: [
      'Por que a vaga demora a fechar? Porque o salário atrai pouco.',
      'Por que atrai pouco? Porque a faixa está abaixo do mercado.',
      'Por que está abaixo? Porque o orçamento de pessoal segue a folha antiga.',
      'Por que segue a folha antiga? Porque não há revisão de faixa salarial anual.',
      'Causa raiz: ausência de revisão periódica de faixa salarial.',
    ],
  },
  {
    id: 'mo3',
    texto: 'Onboarding sem acompanhamento',
    ramo: 'mao_de_obra',
    status: 'descartada',
    G: 2,
    U: 2,
    T: 2,
    evidencia: 'Há trilha de onboarding documentada; adesão não foi medida.',
    porques: [
      'Não avançou: a trilha existe e está documentada.',
      'A hipótese de "sem onboarding" não se sustentou na verificação.',
      'Sem evidência de falha no onboarding neste ciclo.',
      'Descartada como causa prioritária.',
      'Manter apenas como observação para o próximo ciclo.',
    ],
  },
  // ---- MATERIAL ----
  {
    id: 'ma1',
    texto: 'Perecível de fornecedor inconsistente',
    ramo: 'material',
    status: 'validada',
    G: 4,
    U: 4,
    T: 4,
    evidencia: '3 fornecedores com 2 desvios de padrão no trimestre.',
    porques: [
      'Por que a quebra sobe? Porque parte do lote chega com vida útil curta.',
      'Por que chega curta? Porque o fornecedor entrega colheita antiga.',
      'Por que aceita? Porque não há critério de vida útil mínima na compra.',
      'Por que não há critério? Porque o contrato não previu esse parâmetro.',
      'Causa raiz: contrato sem cláusula de vida útil mínima.',
    ],
  },
  {
    id: 'ma2',
    texto: 'Embalagem inadequada no transporte',
    ramo: 'material',
    status: 'a_validar',
    G: 3,
    U: 3,
    T: 3,
    evidencia: 'Amostra de 40 caixas com 6 apresentando amassado.',
    porques: [
      'Por que o produto chega danificado? Porque a caixa não protege.',
      'Por que não protege? Porque a embalagem não é dimensionada por carga.',
      'Por que não é dimensionada? Porque não há padrão por tipo de item.',
      'Por que não há padrão? Porque a embalagem é comprada por preço.',
      'Causa raiz: compra de embalagem sem especificação técnica.',
    ],
  },
  {
    id: 'ma3',
    texto: 'Variação de lote sem registro',
    ramo: 'material',
    status: 'a_validar',
    G: 2,
    U: 3,
    T: 3,
    evidencia: 'Sem rastreio de lote por loja no sistema atual.',
    porques: [
      'Por que não se identifica o lote com problema? Porque não há rastreio.',
      'Por que não há? Porque o sistema não exige lote no recebimento.',
      'Por que não exige? Porque o cadastro não tem o campo.',
      'Por que não tem? Porque não foi priorizado na implantação.',
      'Causa raiz: rastreabilidade de lote fora do escopo do ERP.',
    ],
  },
  // ---- MEIO AMBIENTE ----
  {
    id: 'mb1',
    texto: 'Temperatura fora da faixa na descarga',
    ramo: 'meio_ambiente',
    status: 'validada',
    G: 4,
    U: 4,
    T: 4,
    evidencia: 'Descarga em doca sem climatização; tempo médio de 42 min.',
    porques: [
      'Por que o produto perde vida útil? Porque fica exposto na descarga.',
      'Por que fica exposto? Porque a doca não é climatizada.',
      'Por que não é? Porque o projeto original não previu doca fria.',
      'Por que não previu? Porque a expansão priorizou área de venda.',
      'Causa raiz: projeto de CD sem doca climatizada.',
    ],
  },
  {
    id: 'mb2',
    texto: 'Umidade na câmara de hortifruti',
    ramo: 'meio_ambiente',
    status: 'a_validar',
    G: 3,
    U: 3,
    T: 3,
    evidencia: 'Medição pontual: 88% de UR contra faixa recomendada de 90-95%.',
    porques: [
      'Por que o hortifruti murcha? Porque a umidade fica abaixo da faixa.',
      'Por que fica? Porque não há umidificador na câmara.',
      'Por que não há? Porque a especificação da câmara não previu controle.',
      'Por que não previu? Porque o dimensionamento foi só de temperatura.',
      'Causa raiz: dimensionamento de câmara sem controle de umidade.',
    ],
  },
  {
    id: 'mb3',
    texto: 'Iluminação fraca na conferência',
    ramo: 'meio_ambiente',
    status: 'a_validar',
    G: 2,
    U: 2,
    T: 2,
    evidencia: 'Luxímetro abaixo de 300 lux em 2 das 9 áreas conferidas.',
    porques: [
      'Por que passa item com defeito? Porque a conferência visual falha.',
      'Por que falha? Porque a iluminação é fraca na bancada.',
      'Por que é fraca? Porque as lâmpadas nunca foram revisadas.',
      'Por que não foram? Porque não há rotina de manutenção predial.',
      'Causa raiz: ausência de rotina de manutenção predial.',
    ],
  },
  // ---- MEDIÇÃO ----
  {
    id: 'md1',
    texto: 'Sem alarme de temperatura',
    ramo: 'medicao',
    status: 'validada',
    G: 5,
    U: 4,
    T: 4,
    evidencia: 'Desvio de temperatura só é descoberto na leitura seguinte.',
    porques: [
      'Por que o problema demora a aparecer? Porque não há alarme.',
      'Por que não há? Porque a leitura é manual e pontual.',
      'Por que é manual? Porque não há sensor conectado.',
      'Por que não há? Porque a integração não foi contratada.',
      'Causa raiz: ausência de monitoramento contínuo com alarme.',
    ],
  },
  {
    id: 'md2',
    texto: 'Quebra medida em base diferente',
    ramo: 'medicao',
    status: 'validada',
    G: 4,
    U: 4,
    T: 4,
    evidencia: 'Cálculo depende de EI e EF do mesmo conjunto de produtos.',
    porques: [
      'Por que o número não fecha com o BI? Porque a base de comparação difere.',
      'Por que difere? Porque o cálculo usa janelas parciais.',
      'Por que usa? Porque o inventário não fecha no mesmo dia.',
      'Por que não fecha? Porque não há calendário único de inventário.',
      'Causa raiz: calendário de inventário sem base única.',
    ],
  },
  {
    id: 'md3',
    texto: 'Indicador de turnover sem critério',
    ramo: 'medicao',
    status: 'a_validar',
    G: 3,
    U: 3,
    T: 3,
    evidencia: 'Turnover inclui desligamento de contrato temporário na mesma conta.',
    porques: [
      'Por que o turnover parece maior? Porque soma temporário e efetivo.',
      'Por que soma? Porque o indicador não separa vínculo.',
      'Por que não separa? Porque a extração usa uma única origem.',
      'Por que usa uma? Porque o cálculo nunca foi revisto.',
      'Causa raiz: definição do indicador sem segregação por vínculo.',
    ],
  },
]

const STATUS_COR: Record<StatusCausa, { cor: string; rotulo: string }> = {
  validada: { cor: SEMAFORO_CORES.verde.cor, rotulo: 'Validada' },
  a_validar: { cor: SEMAFORO_CORES.ambar.cor, rotulo: 'A validar' },
  descartada: { cor: '#9AA4AE', rotulo: 'Descartada' },
}

const gut = (c: Causa) => c.G * c.U * c.T

function faixaGut(c: Causa): { rotulo: string; cor: string } {
  const s = gut(c)
  if (s >= 60) return { rotulo: 'Alta', cor: SEMAFORO_CORES.vermelho.cor }
  if (s >= 30) return { rotulo: 'Média', cor: SEMAFORO_CORES.ambar.cor }
  return { rotulo: 'Baixa', cor: SEMAFORO_CORES.verde.cor }
}

// ---------------------------------------------------------------------------
// GEOMETRIA DO DIAGRAMA (SVG)
// ---------------------------------------------------------------------------

const W = 1040
const H = 470
const ESPINHA_Y = H / 2

/** x onde o ramo encosta na espinha */
const BASES = [250, 520, 790]
const ACIMA = [0, 1, 2] // índices de ramos em cima
const ABAIXO = [3, 4, 5] // ... e embaixo

export default function PenIshikawaPage() {
  const { empresa, ciclo } = usePenFiltro()
  const [desvioId, setDesvioId] = useState<string>(DESVIOS[0].id)
  const [menuAberto, setMenuAberto] = useState(false)
  const [causaSel, setCausaSel] = useState<string>('me1')

  const desvio = DESVIOS.find((d) => d.id === desvioId) || DESVIOS[0]

  const ordenadas = useMemo(() => [...CAUSAS].sort((a, b) => gut(b) - gut(a)), [])

  const causa = CAUSAS.find((c) => c.id === causaSel) || CAUSAS[0]

  // agrupa por ramo mantendo a ordem dos ramos
  const porRamo = useMemo(() => {
    const m: Record<string, Causa[]> = {}
    for (const r of RAMOS) m[r.key] = CAUSAS.filter((c) => c.ramo === r.key)
    return m
  }, [])

  const validadaCritica = ordenadas.filter((c) => gut(c) >= 60 && c.status === 'validada').length

  return (
    <div className="space-y-4">
      <SectionHeader
        titulo="Ishikawa — causa e efeito"
        descricao={`Diagrama de espinha de peixe e priorização GUT — ${empresa} · ${ciclo}`}
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
              titulo="Ishikawa — causa e efeito"
              corpo={() =>
                secao('Desvio em análise', `<p><strong>${esc(desvio.nome)}</strong></p>`) +
                secao(
                  'Causas por ramo',
                  tabelaHtml(
                    ['Ramo', 'Causa', 'Status', 'G', 'U', 'T', 'GUT', 'Evidência'],
                    ordenadas.map((c) => [
                      esc(RAMOS.find((r) => r.key === c.ramo)?.nome || c.ramo),
                      esc(c.texto),
                      {
                        v: STATUS_COR[c.status].rotulo,
                        cls:
                          c.status === 'validada'
                            ? 'verde'
                            : c.status === 'a_validar'
                              ? 'ambar'
                              : '',
                      },
                      String(c.G),
                      String(c.U),
                      String(c.T),
                      String(gut(c)),
                      esc(c.evidencia),
                    ]),
                    [3, 4, 5, 6],
                  ),
                ) +
                secao(
                  '5 Porquês — ' + causa.texto,
                  `<ol>${causa.porques.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>` +
                    `<p><strong>Causa raiz do desvio:</strong> ${esc(desvio.causaRaiz)}</p>`,
                )
              }
            />
          </div>
        }
      />

      {/* ================= SELETOR DE DESVIO ================= */}
      <div
        className="flex flex-wrap items-center gap-3 p-3"
        style={{
          background: PEN.cartao,
          borderRadius: PEN.raio,
          border: `1px solid ${PEN.borda}`,
        }}
      >
        <div className="flex items-center gap-2">
          <Crosshair className="h-3.5 w-3.5 shrink-0" style={{ color: PEN.acento }} />
          <span className="text-[11px] font-bold" style={{ color: PEN.textoFraco }}>
            Desvio em análise:
          </span>
        </div>

        <div className="relative min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setMenuAberto((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[12px] font-semibold"
            style={{
              background: PEN.acentoClaro,
              color: PEN.acento,
              border: `1px solid ${PEN.acento}33`,
              maxWidth: 460,
            }}
          >
            <span className="truncate">{desvio.nome}</span>
            <ChevronDown
              className="h-3.5 w-3.5 shrink-0 transition-transform"
              style={{ transform: menuAberto ? 'rotate(180deg)' : 'none' }}
            />
          </button>
          {menuAberto && (
            <div
              className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden"
              style={{
                background: '#FFFFFF',
                borderRadius: 8,
                border: `1px solid ${PEN.borda}`,
                boxShadow: '0 6px 20px rgba(15,30,46,.12)',
                maxWidth: 460,
              }}
            >
              {DESVIOS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDesvioId(d.id)
                    setMenuAberto(false)
                  }}
                  className="block w-full px-2.5 py-2 text-left text-[11.5px] font-medium hover:bg-gray-50"
                  style={{
                    color: d.id === desvioId ? PEN.acento : PEN.texto,
                    fontWeight: d.id === desvioId ? 700 : 500,
                  }}
                >
                  {d.nome}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-[10.5px]" style={{ color: PEN.textoFraco }}>
          <span>{CAUSAS.length} causas mapeadas</span>
          <span>·</span>
          <span>{validadaCritica} validadas com GUT alto</span>
        </div>
      </div>

      {/* ================= DIAGRAMA SVG ================= */}
      <div>
        <SectionHeader
          titulo="Diagrama de Ishikawa — 6 ramos"
          descricao="Cada causa traz o dot de status: verde validada · âmbar a validar · cinza descartada."
        />
        <div
          className="overflow-x-auto p-2"
          style={{
            background: PEN.cartao,
            borderRadius: PEN.raio,
            border: `1px solid ${PEN.borda}`,
          }}
        >
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            style={{ minWidth: 860, display: 'block' }}
            role="img"
            aria-label={`Diagrama de Ishikawa do desvio ${desvio.nome}`}
          >
            {/* espinha central */}
            <line
              x1={40}
              y1={ESPINHA_Y}
              x2={W - 150}
              y2={ESPINHA_Y}
              stroke="#0F1E2E"
              strokeWidth={2.2}
            />
            <polygon
              points={`${W - 150},${ESPINHA_Y - 7} ${W - 132},${ESPINHA_Y} ${W - 150},${ESPINHA_Y + 7}`}
              fill="#0F1E2E"
            />

            {/* efeito (cabeça) */}
            <text x={W - 122} y={ESPINHA_Y - 4} fontSize={10} fontWeight={800} fill={PEN.critico}>
              EFEITO
            </text>
            {(() => {
              const palavras = desvio.nome.split(' ')
              const linhas: string[] = []
              let linha = ''
              for (const p of palavras) {
                if ((linha + ' ' + p).trim().length > 16) {
                  if (linha) linhas.push(linha)
                  linha = p
                } else {
                  linha = (linha + ' ' + p).trim()
                }
              }
              if (linha) linhas.push(linha)
              return linhas.slice(0, 4).map((l, i) => (
                <text
                  key={i}
                  x={W - 122}
                  y={ESPINHA_Y + 10 + i * 12}
                  fontSize={9.5}
                  fontWeight={600}
                  fill={PEN.texto}
                >
                  {l}
                </text>
              ))
            })()}

            {/* ramos */}
            {(RAMOS as Array<{ key: Ramo; nome: string }>).map((r, idx) => {
              const acima = idx < 3
              const base = BASES[idx % 3]
              const pontaX = acima ? base - 118 : base - 118
              const pontaY = acima ? 74 : H - 74
              const causas = porRamo[r.key] || []

              // 3 pontos ao longo da diagonal
              const ts = [0.3, 0.55, 0.8]

              return (
                <g key={r.key}>
                  {/* diagonal do ramo */}
                  <line
                    x1={base}
                    y1={ESPINHA_Y}
                    x2={pontaX}
                    y2={pontaY}
                    stroke="#0F1E2E"
                    strokeWidth={1.7}
                  />

                  {/* nome do ramo na ponta */}
                  <text
                    x={pontaX - 2}
                    y={acima ? pontaY - 8 : pontaY + 14}
                    fontSize={10.5}
                    fontWeight={800}
                    textAnchor="middle"
                    fill={PEN.acento}
                  >
                    {r.nome}
                  </text>

                  {causas.map((c, i) => {
                    const t = ts[i] ?? 0.5
                    const px = base + (pontaX - base) * t
                    const py = ESPINHA_Y + (pontaY - ESPINHA_Y) * t
                    const st = STATUS_COR[c.status]
                    // linha horizontal curta para fora da diagonal
                    const dir = acima ? -1 : 1
                    const ly = py + dir * 2
                    const lx1 = px - 84
                    const lx2 = px - 8

                    return (
                      <g key={c.id} style={{ cursor: 'pointer' }} onClick={() => setCausaSel(c.id)}>
                        <line x1={lx1} y1={ly} x2={lx2} y2={ly} stroke="#C9D1D9" strokeWidth={1} />
                        <circle cx={lx1 + 4} cy={ly} r={3.4} fill={st.cor} />
                        <text
                          x={lx1 + 11}
                          y={acima ? ly - 4 : ly + 8}
                          fontSize={8.4}
                          fill={causaSel === c.id ? PEN.acento : PEN.textoSecundario}
                          fontWeight={causaSel === c.id ? 700 : 500}
                        >
                          {c.texto.length > 26 ? c.texto.slice(0, 25) + '…' : c.texto}
                        </text>
                        {/* área de clique maior */}
                        <rect x={lx1 - 2} y={ly - 9} width={100} height={18} fill="transparent" />
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* ================= TABELA + 5 PORQUÊS ================= */}
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div>
          <SectionHeader
            titulo="Priorização das causas — GUT"
            descricao="Score = Gravidade × Urgência × Tendência (1 a 5). Clique para abrir os 5 Porquês."
          />
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
                    ['Causa', 'left'],
                    ['Ramo', 'left'],
                    ['G', 'center'],
                    ['U', 'center'],
                    ['T', 'center'],
                    ['GUT', 'center'],
                    ['Status', 'center'],
                    ['Evidência necessária', 'left'],
                  ].map(([h, al]) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-wide"
                      style={{
                        color: PEN.textoFraco,
                        borderBottom: `1px solid ${PEN.borda}`,
                        textAlign: al as any,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((c) => {
                  const f = faixaGut(c)
                  const st = STATUS_COR[c.status]
                  const ativo = causaSel === c.id
                  const ramoNome = RAMOS.find((r) => r.key === c.ramo)?.nome || c.ramo
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setCausaSel(c.id)}
                      className="cursor-pointer hover:bg-[#F7F9FA]"
                      style={{ background: ativo ? PEN.acentoClaro : undefined }}
                    >
                      <td
                        className="px-2 py-1.5 text-[11px] font-semibold"
                        style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                      >
                        <span
                          className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                          style={{ background: st.cor }}
                          title={st.rotulo}
                        />
                        {c.texto}
                      </td>
                      <td
                        className="whitespace-nowrap px-2 py-1.5 text-[10.5px]"
                        style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                      >
                        {ramoNome}
                      </td>
                      <td
                        className="px-1 py-1.5 text-center text-[11px] tabular-nums"
                        style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                      >
                        {c.G}
                      </td>
                      <td
                        className="px-1 py-1.5 text-center text-[11px] tabular-nums"
                        style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                      >
                        {c.U}
                      </td>
                      <td
                        className="px-1 py-1.5 text-center text-[11px] tabular-nums"
                        style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                      >
                        {c.T}
                      </td>
                      <td
                        className="px-2 py-1.5 text-center text-[11.5px] font-extrabold tabular-nums"
                        style={{ color: f.cor, borderBottom: '1px solid #F0F2F5' }}
                      >
                        {gut(c)}
                      </td>
                      <td
                        className="px-2 py-1.5 text-center"
                        style={{ borderBottom: '1px solid #F0F2F5' }}
                      >
                        <span
                          className="inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase"
                          style={{
                            background: '#FFFFFF',
                            color: f.cor,
                            border: `1px solid ${f.cor}44`,
                          }}
                        >
                          {f.rotulo}
                        </span>
                      </td>
                      <td
                        className="px-2 py-1.5 text-[10px] leading-snug"
                        style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                      >
                        {c.evidencia}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------------- 5 PORQUÊS ---------------- */}
        <div>
          <SectionHeader
            titulo="5 Porquês"
            descricao={`Causa selecionada: ${causa.texto}`}
            acao={<FileSearch className="h-3.5 w-3.5" style={{ color: PEN.textoFraco }} />}
          />
          <div
            style={{
              background: PEN.cartao,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.borda}`,
            }}
          >
            {causa.porques.map((p, i) => {
              const ultimo = i === causa.porques.length - 1
              const descartada = causa.status === 'descartada'
              const cor = descartada ? '#9AA4AE' : ultimo ? SEMAFORO_CORES.vermelho.cor : PEN.acento
              return (
                <div
                  key={i}
                  className="flex gap-2 px-3 py-2"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #F0F2F5' }}
                >
                  <span
                    className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full text-[9px] font-extrabold text-white"
                    style={{ background: cor, width: 18, height: 18 }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p
                      className="text-[10.5px] leading-snug"
                      style={{
                        color: ultimo ? cor : PEN.texto,
                        fontWeight: ultimo ? 700 : 500,
                      }}
                    >
                      {p}
                    </p>
                  </div>
                </div>
              )
            })}

            <div
              className="px-3 py-2"
              style={{ borderTop: `1px solid ${PEN.borda}`, background: '#FAFBFC' }}
            >
              <p
                className="text-[9.5px] font-bold uppercase tracking-wide"
                style={{ color: PEN.textoFraco }}
              >
                Causa raiz do desvio
              </p>
              <p className="mt-0.5 text-[10.5px] font-semibold" style={{ color: PEN.texto }}>
                {desvio.causaRaiz}
              </p>
            </div>
          </div>

          <div
            className="mt-2 flex items-start gap-1.5 p-2.5"
            style={{
              background: PEN.atencaoClaro,
              borderRadius: 8,
              border: `1px solid ${PEN.atencao}33`,
            }}
          >
            <ArrowRight className="mt-0.5 h-3 w-3 shrink-0" style={{ color: PEN.atencao }} />
            <p className="text-[10px] leading-snug" style={{ color: PEN.textoSecundario }}>
              Causa <strong>{STATUS_COR[causa.status].rotulo.toLowerCase()}</strong> · GUT{' '}
              <strong>{gut(causa)}</strong>. Só causa validada com GUT alto deve virar ação no 5W2H.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
