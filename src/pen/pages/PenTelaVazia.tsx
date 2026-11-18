import { PEN } from '@/pen/tokens'
import { SectionHeader } from '@/pen/components'
import { usePenFiltro } from '@/pen/PenShell'

// ============================================================================
// FASE 0.1 — TELAS VAZIAS DO PLANO
//
// A diretiva do Portão 0 é explícita: "entregue apenas shell com telas
// vazias". Portanto nenhuma tela desta fase tem conteúdo, cálculo ou dado.
// O que existe é o cabeçalho de contexto (empresa e ciclo vindos do filtro
// global) e um marcador dizendo o que a tela VAI receber.
//
// Isso também funciona como trava: se alguém preencher uma tela antes da
// fundação ser aprovada, o marcador aparece e denuncia.
// ============================================================================

export function PenTelaVazia({
  titulo,
  descricao,
  recebe,
}: {
  titulo: string
  descricao: string
  recebe: string[]
}) {
  const { empresa, ciclo } = usePenFiltro()

  return (
    <div className="space-y-4">
      <SectionHeader
        titulo={titulo}
        descricao={descricao}
        acao={
          <div className="flex items-center gap-1.5">
            <span
              className="px-2 py-1 text-[10.5px] font-bold"
              style={{
                background: PEN.acentoClaro,
                color: PEN.acento,
                borderRadius: 6,
              }}
            >
              {empresa}
            </span>
            <span
              className="px-2 py-1 text-[10.5px] font-bold"
              style={{ background: '#F1F3F5', color: PEN.textoSecundario, borderRadius: 6 }}
            >
              {ciclo}
            </span>
          </div>
        }
      />

      <div
        className="flex flex-col items-center justify-center px-6 py-14 text-center"
        style={{
          background: PEN.cartao,
          borderRadius: PEN.raio,
          border: `1px dashed ${PEN.borda}`,
        }}
      >
        <div
          className="mb-3 flex h-11 w-11 items-center justify-center"
          style={{ background: PEN.acentoClaro, borderRadius: 999 }}
        >
          <span style={{ color: PEN.acento, fontSize: 17, fontWeight: 800 }}>0</span>
        </div>

        <p className="text-[14px] font-bold" style={{ color: PEN.texto }}>
          Fase 0 — tela vazia por definição
        </p>
        <p
          className="mt-1 max-w-md text-[12px] leading-relaxed"
          style={{ color: PEN.textoSecundario }}
        >
          O shell está pronto e navegável. O conteúdo desta tela entra na fase seguinte, depois do
          aceite do Portão 0.
        </p>

        <div className="mt-5 w-full max-w-md text-left">
          <p
            className="mb-1.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: PEN.textoFraco }}
          >
            Vai receber
          </p>
          <ul className="space-y-1">
            {recebe.map((r) => (
              <li
                key={r}
                className="flex items-start gap-1.5 text-[11.5px]"
                style={{ color: PEN.textoSecundario }}
              >
                <span style={{ color: PEN.acento }}>·</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
