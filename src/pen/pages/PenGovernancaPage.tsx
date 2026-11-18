import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, ShieldCheck, History, Filter, Lock, FileClock, AlertTriangle } from 'lucide-react'
import { PEN, SEMAFORO_CORES } from '@/pen/tokens'
import { SectionHeader } from '@/pen/components'
import { SkeletonTabela, ErroBloco } from '@/pen/components/estados'
import { usePenFiltro } from '@/pen/PenShell'
import { useAuth } from '@/hooks/use-auth'
import pb from '@/lib/pocketbase/client'

// ============================================================================
// FASE 2.8 — GOVERNANÇA  (somente leitura; quem altera meta é o CEO/CFO)
//
// Blocos:
//   1. Matriz RACI — 5 processos × 7 papéis, letras R/A/C/I coloridas
//   2. Versionamento do plano
//   3. Política de alteração de meta em texto estruturado
//   4. Trilha de auditoria: filtro por usuário, tabela e período
//
// A permissão de alterar meta está em `users.pode_alterar_meta` e a RLS de
// pen_audit exige essa flag para gravar `campo = 'target'` (migração 079).
// Esta tela LÊ a auditoria; não há botão de editar meta aqui.
// ============================================================================

type Papel =
  | 'CEO'
  | 'CFO'
  | 'Diretor de Operações'
  | 'Comercial'
  | 'Controladoria'
  | 'Gestão de Pessoas'
  | 'Tecnologia'

const PAPEIS: Papel[] = [
  'CEO',
  'CFO',
  'Diretor de Operações',
  'Comercial',
  'Controladoria',
  'Gestão de Pessoas',
  'Tecnologia',
]

type Letra = 'R' | 'A' | 'C' | 'I' | '—'

const PROCESSOS: Array<{ nome: string; raci: Record<Papel, Letra> }> = [
  {
    nome: 'Aprovar metas do ciclo',
    raci: {
      CEO: 'A',
      CFO: 'R',
      'Diretor de Operações': 'C',
      Comercial: 'C',
      Controladoria: 'C',
      'Gestão de Pessoas': 'I',
      Tecnologia: 'I',
    },
  },
  {
    nome: 'Alocar capital entre empresas',
    raci: {
      CEO: 'A',
      CFO: 'R',
      'Diretor de Operações': 'C',
      Comercial: 'I',
      Controladoria: 'C',
      'Gestão de Pessoas': 'I',
      Tecnologia: 'I',
    },
  },
  {
    nome: 'Validar diagnóstico e causas raiz',
    raci: {
      CEO: 'A',
      CFO: 'C',
      'Diretor de Operações': 'R',
      Comercial: 'C',
      Controladoria: 'C',
      'Gestão de Pessoas': 'C',
      Tecnologia: 'I',
    },
  },
  {
    nome: 'Aprovar plano de ação 5W2H',
    raci: {
      CEO: 'A',
      CFO: 'C',
      'Diretor de Operações': 'R',
      Comercial: 'R',
      Controladoria: 'C',
      'Gestão de Pessoas': 'C',
      Tecnologia: 'I',
    },
  },
  {
    nome: 'Revisar o Norte e a BHAG',
    raci: {
      CEO: 'R',
      CFO: 'C',
      'Diretor de Operações': 'C',
      Comercial: 'C',
      Controladoria: 'I',
      'Gestão de Pessoas': 'C',
      Tecnologia: 'I',
    },
  },
]

const COR_LETRA: Record<Letra, { bg: string; cor: string; titulo: string }> = {
  R: { bg: '#E8F1F2', cor: '#1F6F78', titulo: 'Responsável pela execução' },
  A: { bg: '#E9F5EF', cor: '#2E7D5B', titulo: 'Aprovador — só um por processo' },
  C: { bg: '#FDF4E3', cor: '#C98A14', titulo: 'Consultado antes da decisão' },
  I: { bg: '#F1F3F5', cor: '#5B6673', titulo: 'Informado depois da decisão' },
  '—': { bg: 'transparent', cor: '#D5DBE1', titulo: 'Não participa' },
}

interface Versao {
  v: string
  data: string
  autor: string
  resumo: string
  tipo: 'criacao' | 'revisao' | 'meta' | 'correcao'
}

const VERSOES: Versao[] = [
  {
    v: '2.1',
    data: '2026-11-18',
    autor: 'Leonardo Lourenço',
    resumo:
      'Cockpit, Norte, Diagnóstico, Ishikawa, BSC, 5W2H e Acompanhamento implementados; dados ligados ao banco.',
    tipo: 'revisao',
  },
  {
    v: '2.0',
    data: '2026-11-17',
    autor: 'Leonardo Lourenço',
    resumo:
      'Coleções pen_* com isolamento por workspace; mock tipado substituído por leitura real.',
    tipo: 'revisao',
  },
  {
    v: '1.1',
    data: '2026-11-18',
    autor: 'Leonardo Lourenço',
    resumo: 'Baseline corrigido nos objetivos de receita (estava acima do realizado).',
    tipo: 'correcao',
  },
  {
    v: '1.0',
    data: '2026-11-16',
    autor: 'Leonardo Lourenço',
    resumo: 'Criação do Plano Estratégico do ciclo 2026 com 8 objetivos e 8 iniciativas.',
    tipo: 'criacao',
  },
]

const TIPO_VERSAO: Record<Versao['tipo'], { rotulo: string; cor: string }> = {
  criacao: { rotulo: 'Criação', cor: SEMAFORO_CORES.verde.cor },
  revisao: { rotulo: 'Revisão', cor: PEN.acento },
  meta: { rotulo: 'Meta', cor: SEMAFORO_CORES.vermelho.cor },
  correcao: { rotulo: 'Correção', cor: SEMAFORO_CORES.ambar.cor },
}

interface Audit {
  id: string
  created: string
  user_id: string
  tabela: string
  registro_id: string
  campo: string
  valor_anterior: string
  valor_novo: string
  justificativa: string
  status: string
}

function fmtDataHora(s: string): string {
  if (!s) return '—'
  const d = s.slice(0, 10).split('-')
  const h = s.slice(11, 16)
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]} ${h}` : s
}

export default function PenGovernancaPage() {
  const { empresa, ciclo } = usePenFiltro()
  const { user } = useAuth()
  const usuario = String((user as any)?.name || (user as any)?.email || 'usuário')
  const podeAlterarMeta = (user as any)?.pode_alterar_meta === true

  const [auditoria, setAuditoria] = useState<Audit[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [fUsuario, setFUsuario] = useState('todos')
  const [fTabela, setFTabela] = useState('todas')
  const [fDe, setFDe] = useState('')
  const [fAte, setFAte] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const regs = await pb.collection('pen_audit').getFullList({ sort: '-created' })
      setAuditoria(regs as unknown as Audit[])
    } catch (e: any) {
      setErro(String(e?.response?.data?.message || e?.message || 'Falha ao ler a auditoria'))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const usuarios = useMemo(
    () => Array.from(new Set(auditoria.map((a) => a.user_id).filter(Boolean))),
    [auditoria],
  )
  const tabelas = useMemo(
    () => Array.from(new Set(auditoria.map((a) => a.tabela).filter(Boolean))),
    [auditoria],
  )

  const filtrada = useMemo(() => {
    return auditoria.filter((a) => {
      if (fUsuario !== 'todos' && a.user_id !== fUsuario) return false
      if (fTabela !== 'todas' && a.tabela !== fTabela) return false
      const d = String(a.created).slice(0, 10)
      if (fDe && d < fDe) return false
      if (fAte && d > fAte) return false
      return true
    })
  }, [auditoria, fUsuario, fTabela, fDe, fAte])

  return (
    <div className="space-y-4">
      <SectionHeader
        titulo="Governança"
        descricao={`RACI, versionamento e trilha de auditoria — ${empresa} · ${ciclo}`}
        acao={
          <span
            className="inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-bold"
            style={{ background: '#F1F3F5', color: PEN.textoSecundario, borderRadius: 6 }}
          >
            <Eye className="h-3 w-3" />
            somente leitura
          </span>
        }
      />

      {/* aviso de permissão */}
      <div
        className="flex items-start gap-2 p-2.5"
        style={{
          background: podeAlterarMeta ? PEN.sucessoClaro : '#F1F3F5',
          borderRadius: 8,
          border: `1px solid ${podeAlterarMeta ? PEN.sucesso : PEN.borda}33`,
        }}
      >
        {podeAlterarMeta ? (
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: PEN.sucesso }} />
        ) : (
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: PEN.textoFraco }} />
        )}
        <p className="text-[10.5px] leading-snug" style={{ color: PEN.textoSecundario }}>
          <strong style={{ color: podeAlterarMeta ? PEN.sucesso : PEN.texto }}>{usuario}</strong>{' '}
          {podeAlterarMeta
            ? 'tem permissão para alterar metas (CEO/CFO).'
            : 'não tem permissão para alterar metas — apenas CEO e CFO.'}
        </p>
      </div>

      {/* ================= RACI ================= */}
      <div>
        <SectionHeader
          titulo="Matriz RACI"
          descricao="5 processos × 7 papéis. R executa · A aprova · C consulta · I informa."
        />
        <div
          className="overflow-x-auto"
          style={{
            background: PEN.cartao,
            borderRadius: PEN.raio,
            border: `1px solid ${PEN.borda}`,
          }}
        >
          <table className="w-full border-collapse" style={{ minWidth: 760 }}>
            <thead>
              <tr style={{ background: '#FAFBFC' }}>
                <th
                  className="sticky left-0 z-10 px-2 py-1.5 text-left text-[9.5px] font-bold uppercase tracking-wide"
                  style={{
                    color: PEN.textoFraco,
                    borderBottom: `1px solid ${PEN.borda}`,
                    background: '#FAFBFC',
                    minWidth: 210,
                  }}
                >
                  Processo
                </th>
                {PAPEIS.map((p) => (
                  <th
                    key={p}
                    className="px-1 py-1.5 text-center text-[8.5px] font-bold uppercase leading-tight tracking-wide"
                    style={{
                      color: PEN.textoFraco,
                      borderBottom: `1px solid ${PEN.borda}`,
                      minWidth: 62,
                    }}
                  >
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROCESSOS.map((pr) => (
                <tr key={pr.nome}>
                  <td
                    className="sticky left-0 z-10 px-2 py-1.5 text-[10.5px] font-semibold"
                    style={{
                      color: PEN.texto,
                      borderBottom: '1px solid #F0F2F5',
                      background: '#FFFFFF',
                    }}
                  >
                    {pr.nome}
                  </td>
                  {PAPEIS.map((papel) => {
                    const l = pr.raci[papel] || '—'
                    const c = COR_LETRA[l]
                    return (
                      <td
                        key={papel}
                        className="px-1 py-1.5 text-center"
                        style={{ borderBottom: '1px solid #F0F2F5' }}
                      >
                        {l === '—' ? (
                          <span className="text-[10px]" style={{ color: '#D5DBE1' }}>
                            ·
                          </span>
                        ) : (
                          <span
                            className="inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-extrabold"
                            style={{ background: c.bg, color: c.cor }}
                            title={`${l} — ${c.titulo}`}
                          >
                            {l}
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {(['R', 'A', 'C', 'I'] as Letra[]).map((l) => (
            <span
              key={l}
              className="inline-flex items-center gap-1 text-[9.5px]"
              style={{ color: PEN.textoSecundario }}
            >
              <span
                className="inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-extrabold"
                style={{ background: COR_LETRA[l].bg, color: COR_LETRA[l].cor }}
              >
                {l}
              </span>
              {COR_LETRA[l].titulo}
            </span>
          ))}
        </div>
      </div>

      {/* ================= VERSIONAMENTO + POLÍTICA ================= */}
      <div className="grid gap-4 xl:grid-cols-2">
        <div>
          <SectionHeader
            titulo="Versionamento do plano"
            descricao="Toda mudança de conteúdo gera versão com autor e resumo."
            acao={<FileClock className="h-3.5 w-3.5" style={{ color: PEN.textoFraco }} />}
          />
          <div
            className="overflow-hidden"
            style={{
              background: PEN.cartao,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.borda}`,
            }}
          >
            {VERSOES.map((v, i) => {
              const t = TIPO_VERSAO[v.tipo]
              return (
                <div
                  key={v.v}
                  className="px-3 py-2"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #F0F2F5' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11.5px] font-extrabold" style={{ color: PEN.texto }}>
                        v{v.v}
                      </span>
                      <span
                        className="rounded px-1 py-0.5 text-[8.5px] font-bold uppercase"
                        style={{
                          background: '#FFFFFF',
                          color: t.cor,
                          border: `1px solid ${t.cor}44`,
                        }}
                      >
                        {t.rotulo}
                      </span>
                    </div>
                    <span className="text-[9.5px] tabular-nums" style={{ color: PEN.textoFraco }}>
                      {fmtDataHora(v.data)}
                    </span>
                  </div>
                  <p
                    className="mt-0.5 text-[10.5px] leading-snug"
                    style={{ color: PEN.textoSecundario }}
                  >
                    {v.resumo}
                  </p>
                  <p className="mt-0.5 text-[9px]" style={{ color: PEN.textoFraco }}>
                    {v.autor}
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <SectionHeader
            titulo="Política de alteração de meta"
            descricao="Regra escrita, não acordo verbal."
          />
          <div
            className="p-3"
            style={{
              background: PEN.cartao,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.borda}`,
            }}
          >
            {[
              {
                t: 'Quem pode alterar',
                d: 'Somente CEO e CFO. A permissão é um campo no usuário (pode_alterar_meta) e a regra de banco exige essa marca para gravar mudança de meta.',
              },
              {
                t: 'O que é obrigatório',
                d: 'Justificativa escrita de no mínimo 10 caracteres, valor anterior e novo valor. Sem justificativa, a gravação é recusada.',
              },
              {
                t: 'O que fica registrado',
                d: 'Tabela de auditoria com usuário, data e hora, campo alterado, valor anterior, novo valor e justificativa. Não há exclusão de registro de auditoria.',
              },
              {
                t: 'Quando é permitido',
                d: 'Revisão trimestral, ou a qualquer momento em caso de evento externo relevante — sempre com justificativa.',
              },
              {
                t: 'O que NÃO é permitido',
                d: 'Alterar meta para "fechar" o número com o realizado, sem evidência, ou fora de rito. O plano não se ajusta ao resultado; o resultado é que se explica.',
              },
            ].map((b, i) => (
              <div
                key={b.t}
                className="flex gap-2 py-1.5"
                style={{ borderTop: i === 0 ? 'none' : '1px solid #F0F2F5' }}
              >
                <span
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8.5px] font-extrabold text-white"
                  style={{ background: PEN.acento }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[10.5px] font-bold" style={{ color: PEN.texto }}>
                    {b.t}
                  </p>
                  <p className="text-[10px] leading-snug" style={{ color: PEN.textoSecundario }}>
                    {b.d}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ================= TRILHA DE AUDITORIA ================= */}
      <div>
        <SectionHeader
          titulo="Trilha de auditoria"
          descricao="Toda alteração registrada em pen_audit, com filtro por usuário, tabela e período."
          acao={
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold"
              style={{ color: PEN.textoFraco }}
            >
              <History className="h-3 w-3" />
              {filtrada.length} de {auditoria.length}
            </span>
          }
        />

        {/* filtros */}
        <div
          className="mb-2 flex flex-wrap items-end gap-2 p-2.5"
          style={{
            background: PEN.cartao,
            borderRadius: PEN.raio,
            border: `1px solid ${PEN.borda}`,
          }}
        >
          <div>
            <label
              className="block text-[9px] font-bold uppercase"
              style={{ color: PEN.textoFraco }}
            >
              Usuário
            </label>
            <select
              value={fUsuario}
              onChange={(e) => setFUsuario(e.target.value)}
              className="mt-0.5 rounded-md border px-1.5 py-1 text-[11px]"
              style={{
                borderColor: PEN.borda,
                color: PEN.texto,
                background: '#FFF',
                minWidth: 140,
              }}
            >
              <option value="todos">Todos</option>
              {usuarios.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block text-[9px] font-bold uppercase"
              style={{ color: PEN.textoFraco }}
            >
              Tabela
            </label>
            <select
              value={fTabela}
              onChange={(e) => setFTabela(e.target.value)}
              className="mt-0.5 rounded-md border px-1.5 py-1 text-[11px]"
              style={{
                borderColor: PEN.borda,
                color: PEN.texto,
                background: '#FFF',
                minWidth: 140,
              }}
            >
              <option value="todas">Todas</option>
              {tabelas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="block text-[9px] font-bold uppercase"
              style={{ color: PEN.textoFraco }}
            >
              De
            </label>
            <input
              type="date"
              value={fDe}
              onChange={(e) => setFDe(e.target.value)}
              className="mt-0.5 rounded-md border px-1.5 py-1 text-[11px]"
              style={{ borderColor: PEN.borda, color: PEN.texto }}
            />
          </div>
          <div>
            <label
              className="block text-[9px] font-bold uppercase"
              style={{ color: PEN.textoFraco }}
            >
              Até
            </label>
            <input
              type="date"
              value={fAte}
              onChange={(e) => setFAte(e.target.value)}
              className="mt-0.5 rounded-md border px-1.5 py-1 text-[11px]"
              style={{ borderColor: PEN.borda, color: PEN.texto }}
            />
          </div>
          <button
            type="button"
            onClick={carregar}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[10.5px] font-bold"
            style={{ background: PEN.acentoClaro, color: PEN.acento }}
          >
            <Filter className="h-3 w-3" />
            Atualizar
          </button>
        </div>

        {erro && <ErroBloco mensagem={erro} onTentar={carregar} />}

        {carregando ? (
          <SkeletonTabela linhas={4} colunas={7} />
        ) : auditoria.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center px-4 py-10 text-center"
            style={{
              background: PEN.cartao,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.borda}`,
            }}
          >
            <FileClock className="mb-2 h-7 w-7" style={{ color: PEN.textoFraco }} />
            <p className="text-[12px] font-bold" style={{ color: PEN.texto }}>
              Nenhuma alteração registrada
            </p>
            <p
              className="mt-1 max-w-md text-[10.5px] leading-snug"
              style={{ color: PEN.textoSecundario }}
            >
              A trilha fica vazia até a primeira alteração real. Ela é populada por: edição de texto
              no Norte (com justificativa) e alteração de % concluído no Plano 5W2H, além de cada
              exportação em PDF.
            </p>
          </div>
        ) : filtrada.length === 0 ? (
          <p
            className="px-3 py-6 text-center text-[11px]"
            style={{
              background: PEN.cartao,
              borderRadius: PEN.raio,
              border: `1px solid ${PEN.borda}`,
              color: PEN.textoFraco,
            }}
          >
            Nenhum registro com esses filtros.
          </p>
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
                  {['Data e hora', 'Usuário', 'Tabela', 'Campo', 'De', 'Para', 'Justificativa'].map(
                    (h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-2 py-1.5 text-[9.5px] font-bold uppercase tracking-wide"
                        style={{ color: PEN.textoFraco, borderBottom: `1px solid ${PEN.borda}` }}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filtrada.map((a) => (
                  <tr key={a.id} className="hover:bg-[#F7F9FA]">
                    <td
                      className="whitespace-nowrap px-2 py-1.5 text-[10px] font-semibold tabular-nums"
                      style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                    >
                      {fmtDataHora(a.created)}
                    </td>
                    <td
                      className="px-2 py-1.5 text-[10.5px]"
                      style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                    >
                      {a.user_id}
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-1.5 text-[9.5px] font-bold uppercase"
                      style={{ color: PEN.acento, borderBottom: '1px solid #F0F2F5' }}
                    >
                      {a.tabela}
                    </td>
                    <td
                      className="whitespace-nowrap px-2 py-1.5 text-[10px]"
                      style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                    >
                      {a.campo}
                    </td>
                    <td
                      className="max-w-[160px] truncate px-2 py-1.5 text-[10px]"
                      style={{ color: PEN.textoFraco, borderBottom: '1px solid #F0F2F5' }}
                      title={a.valor_anterior}
                    >
                      {a.valor_anterior || '—'}
                    </td>
                    <td
                      className="max-w-[160px] truncate px-2 py-1.5 text-[10px] font-semibold"
                      style={{ color: PEN.texto, borderBottom: '1px solid #F0F2F5' }}
                      title={a.valor_novo}
                    >
                      {a.valor_novo || '—'}
                    </td>
                    <td
                      className="max-w-[260px] px-2 py-1.5 text-[10px] leading-snug"
                      style={{ color: PEN.textoSecundario, borderBottom: '1px solid #F0F2F5' }}
                    >
                      {a.justificativa || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* nota de escopo */}
      <div
        className="flex items-start gap-2 p-2.5"
        style={{
          background: PEN.atencaoClaro,
          borderRadius: 8,
          border: `1px solid ${PEN.atencao}22`,
        }}
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: PEN.atencao }} />
        <p className="text-[10px] leading-snug" style={{ color: PEN.textoSecundario }}>
          A permissão de alterar meta é a flag <strong>pode_alterar_meta</strong> no usuário, e a
          regra de banco (<strong>RLS</strong>) exige essa marca para gravar mudança de meta em
          pen_audit. Esta tela não oferece edição de meta — é leitura e auditoria.
        </p>
      </div>
    </div>
  )
}
