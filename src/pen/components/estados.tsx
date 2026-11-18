import { AlertTriangle, RefreshCw } from 'lucide-react'
import { PEN } from '@/pen/tokens'

// ============================================================================
// FASE 3.1 — SKELETON E ERRO POR BLOCO
//
// Diretiva: "skeleton de carregamento e estado de erro por bloco, nunca por
// tela inteira". Estes dois componentes são aplicados AO REDOR de cada bloco:
// um bloco lento mostra skeleton enquanto os outros já exibem dado, e um bloco
// que falhou mostra o erro ali, sem apagar o resto da tela.
// ============================================================================

/** Bloco cinza pulsante com a forma do conteúdo que vai chegar. */
export function Skeleton({
  altura = 16,
  largura = '100%',
  raio = 6,
  className,
}: {
  altura?: number
  largura?: number | string
  raio?: number
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        height: altura,
        width: largura,
        borderRadius: raio,
        background: 'linear-gradient(90deg,#EEF1F4 25%,#E4E9EE 50%,#EEF1F4 75%)',
        backgroundSize: '200% 100%',
        animation: 'pen-skeleton 1.4s ease-in-out infinite',
      }}
    />
  )
}

/** Skeleton no formato de um KpiCard. */
export function SkeletonKpi() {
  return (
    <div
      className="p-3.5"
      style={{ background: PEN.cartao, borderRadius: PEN.raio, border: `1px solid ${PEN.borda}` }}
    >
      <div className="flex items-start justify-between">
        <Skeleton altura={10} largura={90} />
        <Skeleton altura={8} largura={8} raio={999} />
      </div>
      <div className="mt-2.5">
        <Skeleton altura={22} largura={110} />
      </div>
      <div className="mt-3">
        <Skeleton altura={6} />
      </div>
      <div className="mt-1.5 flex justify-between">
        <Skeleton altura={8} largura={50} />
        <Skeleton altura={8} largura={30} />
      </div>
    </div>
  )
}

/** Skeleton de cartão de empresa / status. */
export function SkeletonCard() {
  return (
    <div
      className="p-3.5"
      style={{ background: PEN.cartao, borderRadius: PEN.raio, border: `1px solid ${PEN.borda}` }}
    >
      <Skeleton altura={12} largura={100} />
      <div className="mt-2">
        <Skeleton altura={9} largura={70} />
      </div>
      <div className="mt-3">
        <Skeleton altura={20} largura={62} />
      </div>
      <div className="mt-2">
        <Skeleton altura={6} />
      </div>
    </div>
  )
}

/** Skeleton de linhas de tabela. */
export function SkeletonTabela({ linhas = 4, colunas = 5 }: { linhas?: number; colunas?: number }) {
  return (
    <div
      className="overflow-hidden"
      style={{ background: PEN.cartao, borderRadius: PEN.raio, border: `1px solid ${PEN.borda}` }}
    >
      <div className="flex gap-4 px-3 py-2" style={{ background: '#FAFBFC' }}>
        {Array.from({ length: colunas }).map((_, i) => (
          <Skeleton key={i} altura={8} largura={70} />
        ))}
      </div>
      {Array.from({ length: linhas }).map((_, l) => (
        <div key={l} className="flex gap-4 px-3 py-2.5" style={{ borderTop: '1px solid #F0F2F5' }}>
          {Array.from({ length: colunas }).map((_, c) => (
            <Skeleton key={c} altura={10} largura={c === 0 ? 70 : 90} />
          ))}
        </div>
      ))}
    </div>
  )
}

/**
 * Estado de erro de UM bloco, com ação de tentar de novo.
 * Ocupa o lugar do conteúdo daquele bloco — não a tela.
 */
export function ErroBloco({
  mensagem,
  onTentar,
  compacto,
}: {
  mensagem: string
  onTentar?: () => void
  compacto?: boolean
}) {
  return (
    <div
      className={compacto ? 'p-3' : 'p-4'}
      style={{
        background: PEN.criticoClaro,
        borderRadius: PEN.raio,
        border: `1px solid ${PEN.critico}33`,
      }}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: PEN.critico }} />
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] font-bold" style={{ color: PEN.critico }}>
            Não foi possível carregar este bloco
          </p>
          <p className="mt-0.5 break-words text-[10.5px]" style={{ color: PEN.textoSecundario }}>
            {mensagem}
          </p>
          {onTentar && (
            <button
              type="button"
              onClick={onTentar}
              className="mt-2 inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-bold"
              style={{
                background: PEN.critico,
                color: '#FFFFFF',
                borderRadius: 6,
              }}
            >
              <RefreshCw className="h-3 w-3" />
              Tentar de novo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Aviso discreto quando o bloco está exibindo o FALLBACK do mock porque o
 * banco falhou ou está vazio. Não é erro (há conteúdo na tela), mas o dono
 * precisa saber que aquele número não é do banco.
 */
export function AvisoFallback({ compacto }: { compacto?: boolean }) {
  return (
    <div
      className={compacto ? 'px-2 py-1' : 'px-3 py-1.5'}
      style={{
        background: PEN.atencaoClaro,
        borderRadius: 6,
        border: `1px solid ${PEN.atencao}33`,
      }}
      title="Este bloco está exibindo os números de referência do ciclo, não o dado do banco."
    >
      <p className="text-[10px] font-semibold" style={{ color: PEN.atencao }}>
        exibindo referência do ciclo (banco indisponível)
      </p>
    </div>
  )
}
