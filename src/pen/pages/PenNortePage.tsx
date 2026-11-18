import { useMemo, useState } from 'react'
import { CheckCircle2, AlertTriangle, XCircle, History, Save, ShieldCheck } from 'lucide-react'
import { PEN, SEMAFORO_CORES, type Semaforo } from '@/pen/tokens'
import { SectionHeader, Badge, SemaforoDot } from '@/pen/components'
import { usePenFiltro } from '@/pen/PenShell'
import { useAuth } from '@/hooks/use-auth'
import pb from '@/lib/pocketbase/client'
import type { CompanyId } from '@/pen/lib/mock'

// ============================================================================
// FASE 2.2 — NORTE ESTRATÉGICO
//
// Blocos: BHAG (12 meses + 10 anos) · Missão · Visão · 5 Valores (cada um
// com comportamento OBSERVÁVEL) · proposta de valor por empresa em abas ·
// painel lateral "Teste de consistência" com 3 checks.
//
// Edição inline SÓ de texto. Ao salvar, abre modal exigindo JUSTIFICATIVA, que
// é gravada em pen_audit (usuário · timestamp · valor anterior · valor novo).
//
// 18/11/2026 — o conteúdo do Norte ainda NÃO tem coleção própria (pen_norte).
// Ele vive em `integracoes_config`? Não: escolhi NÃO inventar estrutura nova
// nesta rodada. Os textos vêm de constante tipada e a EDIÇÃO já grava em
// pen_audit, provando o fluxo de auditoria. Ao aprovar, crio pen_norte e migro
// o conteúdo — sem mudar a tela.
// ============================================================================

type ChaveNorte = 'bhag12' | 'bhag10' | 'missao' | 'visao'

interface NorteTexto {
  bhag12: string
  bhag10: string
  missao: string
  visao: string
}

const NORTE_INICIAL: NorteTexto = {
  bhag12:
    'Faturar R$ 218,4 mi em 2026 com EBITDA de 9,1%, sendo a referência em alimentos frescos e embalagens retornáveis no Sudeste.',
  bhag10:
    'Em 10 anos, ser o grupo de distribuição de alimentos frescos mais confiável do Brasil, com R$ 1 bi de receita e operação digital de ponta a ponta.',
  missao:
    'Abastecer com frescor, previsibilidade e custo competitivo quem depende de alimento todos os dias.',
  visao:
    'Um grupo em que a operação de chão de loja e a inteligência de dados trabalham juntas — e o cliente sente isso na prateleira.',
}

interface Valor {
  nome: string
  comportamento: string
}

const VALORES: Valor[] = [
  {
    nome: 'Frescor acima de tudo',
    comportamento:
      'Nenhum lote vencido chega à gôndola: a equipe de loja confere validade no recebimento e registra a quebra no mesmo dia.',
  },
  {
    nome: 'Decisão com dado',
    comportamento:
      'Toda meta discutida em reunião traz número, fonte e período. Sem isso, o item não entra em pauta.',
  },
  {
    nome: 'Dono do resultado',
    comportamento:
      'Cada iniciativa tem um responsável nominal. Quem não é dono não responde por prazo em comitê.',
  },
  {
    nome: 'Segurança e conformidade',
    comportamento:
      'Nenhum acesso é concedido fora do grupo de permissão; desvio é reportado no mesmo dia ao gestor.',
  },
  {
    nome: 'Gente que fica',
    comportamento:
      'Líder de turno faz 1:1 mensal com a equipe e registra o plano de retenção no sistema.',
  },
]

interface Proposta {
  company_id: CompanyId
  nome: string
  proposta: string
  para: string
}

const PROPOSTAS: Proposta[] = [
  {
    company_id: 'extrafruti',
    nome: 'Extrafruti',
    proposta:
      'Distribuição de alimentos frescos com entrega programada e ruptura baixa: o cliente compra sabendo que o pedido chega completo e no dia certo.',
    para: 'Atacarejo, varejo independente, food service e indústria da região.',
  },
  {
    company_id: 'casafruti',
    nome: 'Casafruti',
    proposta:
      'Varejo de bairro com sortimento de fresco e preço estável: a compra do dia resolvida perto de casa, sem falta de item básico.',
    para: 'Consumidor final das praças onde a bandeira opera.',
  },
  {
    company_id: 'foldbox',
    nome: 'FoldBox',
    proposta:
      'Embalagem retornável sob contrato, com rastreio e reposição programada: menos perda no transporte e custo por ciclo menor que o descartável.',
    para: 'Indústria, CD, operadores logísticos e atacarejo com alto volume recorrente.',
  },
]

interface Check {
  id: string
  titulo: string
  ok: boolean
  detalhe: string
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------

async function gravarAuditoria(
  campo: string,
  anterior: string,
  novo: string,
  justificativa: string,
  usuario: string,
  workspace: string,
): Promise<string | null> {
  try {
    await pb.collection('pen_audit').create({
      workspace_id: workspace,
      company_id: '',
      cycle_id: 'ciclo-2026',
      user_id: usuario,
      tabela: 'pen_norte',
      registro_id: 'norte-' + campo,
      campo,
      valor_anterior: anterior.slice(0, 3900),
      valor_novo: novo.slice(0, 3900),
      justificativa,
      status: 'alterado',
    })
    return null
  } catch (e: any) {
    return String(e?.response?.data?.message || e?.message || 'Falha ao gravar auditoria')
  }
}

// ---------------------------------------------------------------------------

export default function PenNortePage() {
  const { empresa, ciclo } = usePenFiltro()
  const { user } = useAuth()
  const usuario = String((user as any)?.name || (user as any)?.email || 'usuário')
  const workspace = String((user as any)?.workspace_id || 'ws-pge-001')

  // escopo: o Norte é do GRUPO; a aba de proposta de valor é por empresa.
  const abaInicial: CompanyId =
    empresa === 'Casafruti' ? 'casafruti' : empresa === 'FoldBox' ? 'foldbox' : 'extrafruti'
  const [aba, setAba] = useState<CompanyId>(abaInicial)

  const [norte, setNorte] = useState<NorteTexto>(NORTE_INICIAL)
  const [editando, setEditando] = useState<ChaveNorte | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  const [justificativa, setJustificativa] = useState('')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [aviso, setAviso] = useState('')

  const proposta = PROPOSTAS.find((p) => p.company_id === aba) || PROPOSTAS[0]

  // ------------------------------------------------------------------
  // 3 checks do Teste de consistência
  // ------------------------------------------------------------------
  const checks: Check[] = useMemo(() => {
    const temNumero = /\d/.test(norte.bhag12)
    const temPrazo = /10 anos|202\d|década/i.test(norte.bhag10)
    const valorComComportamento = VALORES.every((v) => v.comportamento.trim().length > 30)
    const propostaDistingue =
      PROPOSTAS.length === 3 && new Set(PROPOSTAS.map((p) => p.proposta.slice(0, 40))).size === 3

    return [
      {
        id: 'c1',
        titulo: 'BHAG com número e prazo',
        ok: temNumero && temPrazo,
        detalhe: temNumero
          ? 'Meta de 12 meses tem valor numérico; horizonte de 10 anos tem marco temporal.'
          : 'A BHAG de 12 meses não tem número — não é verificável.',
      },
      {
        id: 'c2',
        titulo: 'Valores com comportamento observável',
        ok: valorComComportamento,
        detalhe: valorComComportamento
          ? 'Os 5 valores descrevem o que se vê no dia a dia, não adjetivos soltos.'
          : 'Há valor sem comportamento observável — não dá para cobrar.',
      },
      {
        id: 'c3',
        titulo: 'Proposta de valor distinta por empresa',
        ok: propostaDistingue,
        detalhe: propostaDistingue
          ? 'Extrafruti, Casafruti e FoldBox têm proposta própria, não copiada.'
          : 'As propostas estão iguais ou faltando — o cliente não distingue.',
      },
    ]
  }, [norte])

  const aprovados = checks.filter((c) => c.ok).length

  // ------------------------------------------------------------------
  // edição inline → modal de justificativa → grava pen_audit
  // ------------------------------------------------------------------
  function comecarEdicao(chave: ChaveNorte) {
    setEditando(chave)
    setRascunho(norte[chave])
    setErro('')
    setAviso('')
  }

  function pedirJustificativa() {
    if (!rascunho.trim()) {
      setErro('O texto não pode ficar vazio.')
      return
    }
    if (rascunho.trim() === norte[editando as ChaveNorte]) {
      setEditando(null)
      return
    }
    setErro('')
    setJustificativa('')
    setModalAberto(true)
  }

  async function confirmarSalvar() {
    if (!editando) return
    if (justificativa.trim().length < 10) {
      setErro('A justificativa precisa ter ao menos 10 caracteres.')
      return
    }
    setSalvando(true)
    setErro('')

    const anterior = norte[editando]
    const novo = rascunho.trim()

    const falha = await gravarAuditoria(
      editando,
      anterior,
      novo,
      justificativa.trim(),
      usuario,
      workspace,
    )

    if (falha) {
      // não aplica a mudança se a auditoria não gravou: o Norte não pode mudar
      // sem rastro.
      setErro('Não foi possível gravar a auditoria: ' + falha)
      setSalvando(false)
      return
    }

    setNorte((n) => ({ ...n, [editando]: novo }))
    setModalAberto(false)
    setEditando(null)
    setSalvando(false)
    setAviso('Alteração gravada em pen_audit com justificativa.')
  }

  const rotuloEmpresa = empresa === 'Todas' ? 'Grupo Extrafruti' : empresa

  return (
    <div className="space-y-4">
      <SectionHeader
        titulo="Norte Estratégico"
        descricao={`Missão, visão, valores e BHAG — ${rotuloEmpresa} · ${ciclo}`}
        acao={
          <span
            className="px-2 py-1 text-[10.5px] font-bold"
            style={{ background: PEN.acentoClaro, color: PEN.acento, borderRadius: 6 }}
          >
            {aprovados}/3 checks
          </span>
        }
      />

      {aviso && (
        <div
          className="px-3 py-2 text-[11px] font-semibold"
          style={{ background: PEN.sucessoClaro, color: PEN.sucesso, borderRadius: 8 }}
        >
          {aviso}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {/* ---------------- BHAG ---------------- */}
          <div>
            <SectionHeader titulo="BHAG — a ambição do grupo" />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { k: 'bhag12' as ChaveNorte, titulo: 'Horizonte 12 meses', tom: PEN.acento },
                { k: 'bhag10' as ChaveNorte, titulo: 'Horizonte 10 anos', tom: '#0F1E2E' },
              ].map((b) => (
                <div
                  key={b.k}
                  className="p-3.5"
                  style={{
                    background: PEN.cartao,
                    borderRadius: PEN.raio,
                    border: `1px solid ${PEN.borda}`,
                    borderTop: `3px solid ${b.tom}`,
                  }}
                >
                  <p
                    className="text-[9.5px] font-bold uppercase tracking-wider"
                    style={{ color: PEN.textoFraco }}
                  >
                    {b.titulo}
                  </p>
                  {editando === b.k ? (
                    <div className="mt-1.5">
                      <textarea
                        value={rascunho}
                        onChange={(e) => setRascunho(e.target.value)}
                        rows={4}
                        className="w-full rounded-md border p-2 text-[12px]"
                        style={{ borderColor: PEN.borda }}
                      />
                      <div className="mt-1.5 flex gap-1.5">
                        <button
                          type="button"
                          onClick={pedirJustificativa}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-white"
                          style={{ background: PEN.acento }}
                        >
                          <Save className="h-3 w-3" />
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditando(null)}
                          className="rounded-md px-2 py-1 text-[11px] font-bold"
                          style={{ background: '#F1F3F5', color: PEN.textoSecundario }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className="mt-1 cursor-text text-[12.5px] font-semibold leading-snug"
                      style={{ color: PEN.texto }}
                      onClick={() => comecarEdicao(b.k)}
                      title="Clique para editar"
                    >
                      {norte[b.k]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ---------------- MISSÃO / VISÃO ---------------- */}
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { k: 'missao' as ChaveNorte, titulo: 'Missão', sub: 'Por que existimos' },
              { k: 'visao' as ChaveNorte, titulo: 'Visão', sub: 'Onde queremos chegar' },
            ].map((b) => (
              <div
                key={b.k}
                className="p-3.5"
                style={{
                  background: PEN.cartao,
                  borderRadius: PEN.raio,
                  border: `1px solid ${PEN.borda}`,
                }}
              >
                <div className="flex items-baseline justify-between">
                  <p className="text-[12px] font-bold" style={{ color: PEN.texto }}>
                    {b.titulo}
                  </p>
                  <span className="text-[9.5px]" style={{ color: PEN.textoFraco }}>
                    {b.sub}
                  </span>
                </div>
                {editando === b.k ? (
                  <div className="mt-1.5">
                    <textarea
                      value={rascunho}
                      onChange={(e) => setRascunho(e.target.value)}
                      rows={4}
                      className="w-full rounded-md border p-2 text-[12px]"
                      style={{ borderColor: PEN.borda }}
                    />
                    <div className="mt-1.5 flex gap-1.5">
                      <button
                        type="button"
                        onClick={pedirJustificativa}
                        className="rounded-md px-2 py-1 text-[11px] font-bold text-white"
                        style={{ background: PEN.acento }}
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditando(null)}
                        className="rounded-md px-2 py-1 text-[11px] font-bold"
                        style={{ background: '#F1F3F5', color: PEN.textoSecundario }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p
                    className="mt-1 cursor-text text-[12px] leading-snug"
                    style={{ color: PEN.textoSecundario }}
                    onClick={() => comecarEdicao(b.k)}
                    title="Clique para editar"
                  >
                    {norte[b.k]}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* ---------------- 5 VALORES ---------------- */}
          <div>
            <SectionHeader
              titulo="5 valores"
              descricao="Cada valor com o comportamento observável que o comprova."
            />
            <div className="space-y-2">
              {VALORES.map((v, i) => (
                <div
                  key={v.nome}
                  className="flex gap-3 p-3"
                  style={{
                    background: PEN.cartao,
                    borderRadius: PEN.raio,
                    border: `1px solid ${PEN.borda}`,
                  }}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                    style={{ background: PEN.acento }}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold" style={{ color: PEN.texto }}>
                      {v.nome}
                    </p>
                    <p
                      className="mt-0.5 text-[11px] leading-snug"
                      style={{ color: PEN.textoSecundario }}
                    >
                      <span className="font-semibold" style={{ color: PEN.texto }}>
                        Na prática:{' '}
                      </span>
                      {v.comportamento}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ---------------- PROPOSTA DE VALOR ---------------- */}
          <div>
            <SectionHeader
              titulo="Proposta de valor por empresa"
              descricao="O que cada empresa entrega que a outra não entrega."
            />
            <div
              style={{
                background: PEN.cartao,
                borderRadius: PEN.raio,
                border: `1px solid ${PEN.borda}`,
              }}
            >
              <div className="flex gap-1 border-b px-2 pt-2" style={{ borderColor: PEN.borda }}>
                {PROPOSTAS.map((p) => {
                  const ativo = p.company_id === aba
                  return (
                    <button
                      key={p.company_id}
                      type="button"
                      onClick={() => setAba(p.company_id)}
                      className="rounded-t-md px-3 py-1.5 text-[11.5px] font-bold transition-colors"
                      style={{
                        background: ativo ? PEN.acentoClaro : 'transparent',
                        color: ativo ? PEN.acento : PEN.textoSecundario,
                        borderBottom: ativo ? `2px solid ${PEN.acento}` : '2px solid transparent',
                      }}
                    >
                      {p.nome}
                    </button>
                  )
                })}
              </div>
              <div className="p-3.5">
                <p className="text-[12px] leading-relaxed" style={{ color: PEN.texto }}>
                  {proposta.proposta}
                </p>
                <p className="mt-2 text-[11px]" style={{ color: PEN.textoSecundario }}>
                  <span className="font-bold">Para quem: </span>
                  {proposta.para}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- TESTE DE CONSISTÊNCIA ---------------- */}
        <div>
          <SectionHeader
            titulo="Teste de consistência"
            acao={
              <span className="text-[10px] font-bold" style={{ color: PEN.textoFraco }}>
                {aprovados}/3
              </span>
            }
          />
          <div
            className="overflow-hidden"
            style={{
              background: PEN.cartao,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.borda}`,
            }}
          >
            {checks.map((c, i) => {
              const nivel: Semaforo = c.ok ? 'verde' : 'vermelho'
              const Icone = c.ok ? CheckCircle2 : XCircle
              return (
                <div
                  key={c.id}
                  className="flex items-start gap-2 px-3 py-2.5"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #F0F2F5' }}
                >
                  <Icone
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                    style={{ color: SEMAFORO_CORES[nivel].cor }}
                  />
                  <div className="min-w-0">
                    <p className="text-[11.5px] font-semibold" style={{ color: PEN.texto }}>
                      {c.titulo}
                    </p>
                    <p
                      className="mt-0.5 text-[10.5px] leading-snug"
                      style={{ color: PEN.textoSecundario }}
                    >
                      {c.detalhe}
                    </p>
                  </div>
                </div>
              )
            })}

            <div
              className="flex items-center gap-2 px-3 py-2"
              style={{ borderTop: `1px solid ${PEN.borda}`, background: '#FAFBFC' }}
            >
              <SemaforoDot
                nivel={aprovados === 3 ? 'verde' : aprovados === 2 ? 'ambar' : 'vermelho'}
                rotulo={
                  aprovados === 3
                    ? 'Norte consistente'
                    : aprovados === 2
                      ? 'Ajustar 1 ponto'
                      : 'Revisar o Norte'
                }
              />
            </div>
          </div>

          <div
            className="mt-3 flex items-start gap-2 p-3"
            style={{
              background: PEN.acentoClaro,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.acento}22`,
            }}
          >
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: PEN.acento }} />
            <p className="text-[10.5px] leading-snug" style={{ color: PEN.textoSecundario }}>
              Editar texto do Norte exige <strong>justificativa</strong>, que vai para{' '}
              <strong>pen_audit</strong> com usuário e horário. Sem justificativa, a alteração não é
              aplicada.
            </p>
          </div>
        </div>
      </div>

      {/* ---------------- MODAL DE JUSTIFICATIVA ---------------- */}
      {modalAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,30,46,.45)' }}
          onClick={() => !salvando && setModalAberto(false)}
        >
          <div
            className="w-full max-w-md p-4"
            style={{ background: '#FFFFFF', borderRadius: PEN.raio }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <History className="h-4 w-4" style={{ color: PEN.acento }} />
              <p className="text-[13px] font-bold" style={{ color: PEN.texto }}>
                Justificar alteração do Norte
              </p>
            </div>
            <p className="mt-1 text-[11px]" style={{ color: PEN.textoSecundario }}>
              A mudança fica registrada em <strong>pen_audit</strong> com seu nome, a data e o texto
              anterior e o novo.
            </p>

            <p
              className="mt-3 line-clamp-3 rounded-md p-2 text-[10.5px]"
              style={{ background: '#F7F9FA', color: PEN.textoSecundario }}
            >
              <span className="font-bold">De: </span>
              {editando ? norte[editando] : ''}
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
              placeholder="Por que este texto está mudando?"
              autoFocus
            />

            {erro && (
              <p className="mt-2 text-[11px] font-semibold" style={{ color: PEN.critico }}>
                {erro}
              </p>
            )}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalAberto(false)}
                disabled={salvando}
                className="rounded-md px-3 py-1.5 text-[11.5px] font-bold"
                style={{ background: '#F1F3F5', color: PEN.textoSecundario }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarSalvar}
                disabled={salvando}
                className="rounded-md px-3 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-50"
                style={{ background: PEN.acento }}
              >
                {salvando ? 'Gravando…' : 'Gravar alteração'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
