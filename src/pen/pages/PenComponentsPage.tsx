import { PEN, SEMAFORO_CORES } from '@/pen/tokens'
import {
  KpiCard,
  StatusCard,
  SemaforoDot,
  ProgressBar,
  DataTable,
  Badge,
  SectionHeader,
  type ColunaTabela,
  type BadgeVariante,
} from '@/pen/components'

// ============================================================================
// FASE 0.2 — VITRINE DOS COMPONENTES (/pen/components)
//
// Cada componente aparece uma vez, com o estado real e um rótulo do que é.
// Serve como referência visual única: o que está aqui é o que as telas usam.
// ============================================================================

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section
      className="p-4"
      style={{ background: PEN.cartao, borderRadius: PEN.raio, border: `1px solid ${PEN.borda}` }}
    >
      <p
        className="mb-3 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: PEN.textoFraco }}
      >
        {titulo}
      </p>
      {children}
    </section>
  )
}

const COLUNAS: ColunaTabela[] = [
  { key: 'iniciativa', label: 'Iniciativa', largura: 220 },
  { key: 'empresa', label: 'Empresa', largura: 110 },
  {
    key: 'responsavel',
    label: 'Responsável',
    largura: 140,
  },
  {
    key: 'prazo',
    label: 'Prazo',
    align: 'center',
    largura: 90,
  },
  {
    key: 'meta',
    label: 'Meta',
    align: 'right',
    largura: 90,
    render: (r: any) => r.meta.toLocaleString('pt-BR'),
  },
  {
    key: 'atingimento',
    label: 'Ating.',
    align: 'right',
    largura: 80,
    render: (r: any) => (
      <span
        className="font-bold tabular-nums"
        style={{
          color:
            r.atingimento >= 100 ? PEN.sucesso : r.atingimento >= 90 ? PEN.atencao : PEN.critico,
        }}
      >
        {r.atingimento}%
      </span>
    ),
  },
  {
    key: 'validacao',
    label: 'Validação',
    ordenavel: false,
    largura: 110,
    render: (r: any) => (
      <Badge
        variante={
          r.atingimento >= 100 ? 'validated' : r.atingimento >= 90 ? 'pending' : 'discarded'
        }
      />
    ),
  },
]

const EXEMPLO = [
  {
    id: '1',
    iniciativa: 'Reduzir quebra de perecíveis',
    empresa: 'Extrafruti',
    responsavel: 'Lorena',
    prazo: '31/03',
    meta: 2.5,
    atingimento: 92,
  },
  {
    id: '2',
    iniciativa: 'Ampliar base ativa no varejo',
    empresa: 'Casafruti',
    responsavel: 'Tiago',
    prazo: '30/06',
    meta: 1500,
    atingimento: 104,
  },
  {
    id: '3',
    iniciativa: 'Retornáveis em novos clientes',
    empresa: 'FoldBox',
    responsavel: 'Léo',
    prazo: '31/12',
    meta: 120,
    atingimento: 71,
  },
]

export default function PenComponentsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[18px] font-extrabold" style={{ color: PEN.texto }}>
          Biblioteca de componentes
        </h2>
        <p className="mt-0.5 text-[12px]" style={{ color: PEN.textoSecundario }}>
          Referência visual única do módulo. Toda tela do plano usa estes componentes — nada de
          estilo solto por página.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Bloco titulo="KpiCard — label · valor · variação · meta · semáforo">
          <div className="grid gap-3 sm:grid-cols-2">
            <KpiCard
              label="Quebra — Extrafruti"
              valor={2.31}
              variacao={-4.2}
              meta={2.5}
              formato="percentual"
              casas={2}
              sufixo="do faturamento"
            />
            <KpiCard label="Novos clientes" valor={1563} variacao={12.7} meta={1500} />
            <KpiCard label="Margem de contribuição" valor={null} meta={18} formato="percentual" />
            <KpiCard
              label="Turnover operacional"
              valor={6.1}
              variacao={2.3}
              meta={3}
              formato="percentual"
              sufixo="% ao mês"
            />
          </div>
        </Bloco>

        <Bloco titulo="StatusCard — estado com semáforo">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <StatusCard
              titulo="Diagnóstico concluído"
              estado="verde"
              descricao="6 de 6 frentes validadas pela diretoria."
            />
            <StatusCard
              titulo="Ishikawa em revisão"
              estado="ambar"
              descricao="2 causas aguardando evidência."
            />
            <StatusCard
              titulo="BSC do ciclo"
              estado="vermelho"
              descricao="Metas financeiras sem responsável."
            />
            <StatusCard titulo="5W2H" estado="cinza" descricao="Ainda não iniciado." />
          </div>
        </Bloco>

        <Bloco titulo="SemaforoDot — 4 níveis">
          <div className="flex flex-wrap items-center gap-5">
            {(['verde', 'ambar', 'vermelho', 'cinza'] as const).map((n) => (
              <div key={n} className="flex flex-col items-start gap-1">
                <SemaforoDot nivel={n} rotulo={SEMAFORO_CORES[n].rotulo} />
                <code className="text-[10px]" style={{ color: PEN.textoFraco }}>
                  {n}
                </code>
              </div>
            ))}
            <div
              className="flex items-center gap-2 border-l pl-4"
              style={{ borderColor: PEN.borda }}
            >
              <span className="text-[11px]" style={{ color: PEN.textoSecundario }}>
                só o ponto
              </span>
              <SemaforoDot nivel="verde" />
              <SemaforoDot nivel="ambar" />
              <SemaforoDot nivel="vermelho" />
              <SemaforoDot nivel="cinza" tamanho={6} />
            </div>
          </div>
        </Bloco>

        <Bloco titulo="ProgressBar — com e sem dado">
          <div className="space-y-3">
            <div>
              <div
                className="mb-1 flex justify-between text-[11px]"
                style={{ color: PEN.textoSecundario }}
              >
                <span>104% da meta</span>
                <span className="font-bold" style={{ color: PEN.sucesso }}>
                  104%
                </span>
              </div>
              <ProgressBar valor={104} cor={PEN.sucesso} />
            </div>
            <div>
              <div
                className="mb-1 flex justify-between text-[11px]"
                style={{ color: PEN.textoSecundario }}
              >
                <span>92% da meta</span>
                <span className="font-bold" style={{ color: PEN.atencao }}>
                  92%
                </span>
              </div>
              <ProgressBar valor={92} cor={PEN.atencao} />
            </div>
            <div>
              <div
                className="mb-1 flex justify-between text-[11px]"
                style={{ color: PEN.textoSecundario }}
              >
                <span>71% da meta</span>
                <span className="font-bold" style={{ color: PEN.critico }}>
                  71%
                </span>
              </div>
              <ProgressBar valor={71} cor={PEN.critico} />
            </div>
            <div>
              <div className="mb-1 text-[11px]" style={{ color: PEN.textoFraco }}>
                sem dado
              </div>
              <ProgressBar valor={null} rotuloDireita="aguardando fonte" />
            </div>
          </div>
        </Bloco>

        <Bloco titulo="Badge — validated · pending · discarded">
          <div className="flex flex-wrap items-center gap-2">
            {(['validated', 'pending', 'discarded'] as BadgeVariante[]).map((v) => (
              <Badge key={v} variante={v} />
            ))}
            <Badge variante="validated" rotulo="Aprovado pelo CEO" />
            <Badge variante="pending" rotulo="Aguardando evidência" />
            <Badge variante="discarded" rotulo="Fora do ciclo" />
          </div>
        </Bloco>

        <Bloco titulo="SectionHeader — com e sem ação">
          <div className="space-y-4">
            <SectionHeader
              titulo="Frentes estratégicas"
              descricao="As 6 frentes priorizadas no ciclo 2026."
              acao={
                <button
                  type="button"
                  className="px-2.5 py-1 text-[11px] font-bold text-white"
                  style={{ background: PEN.acento, borderRadius: 8 }}
                >
                  Adicionar
                </button>
              }
            />
            <SectionHeader titulo="Sem ação à direita" descricao="Só título e descrição." />
          </div>
        </Bloco>
      </div>

      <Bloco titulo="DataTable — ordenação por clique, densidade compacta">
        <p className="mb-2.5 text-[11px]" style={{ color: PEN.textoSecundario }}>
          Clique em qualquer cabeçalho para ordenar (▲/▼). A coluna Validação não ordena de
          propósito — é um selo.
        </p>
        <DataTable
          colunas={COLUNAS}
          dados={EXEMPLO}
          chaveLinha={(r: any) => r.id}
          ordemInicial={{ key: 'atingimento', dir: 'asc' }}
          onLinhaClique={() => {}}
        />
      </Bloco>
    </div>
  )
}
