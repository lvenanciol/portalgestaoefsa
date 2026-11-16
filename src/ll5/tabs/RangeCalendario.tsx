import { useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================================================
// CALENDÁRIO DE INTERVALO COM ARRASTO (b4, 15/11/2026)
//
// Um único calendário onde o usuário define início e fim ARRASTANDO o mouse
// sobre os dias. Devolve as duas datas e o número de dias do intervalo.
//
// Também aceita clique simples: primeiro clique = início, segundo = fim.
// ============================================================================

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/**
 * 15/11/2026 — BUG DO CALENDÁRIO (b4):
 * `toISOString()` converte para UTC. Uma data local 01/11 às 00:00 vira
 * 31/10 em UTC (-03:00) — o calendário selecionava o DIA ANTERIOR ao clicado.
 * Agora a string ISO é montada com os componentes LOCAIS.
 */
function iso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + dia
}

function mesmoDia(a: string, b: string): boolean {
  return a === b
}

export default function RangeCalendario({
  inicio,
  fim,
  onChange,
}: {
  inicio: string
  fim: string
  onChange: (inicio: string, fim: string) => void
}) {
  const hoje = new Date()
  const [mesRef, setMesRef] = useState(() => {
    const base = inicio ? new Date(inicio + 'T12:00:00') : hoje
    return new Date(base.getFullYear(), base.getMonth(), 1)
  })

  const arrastando = useRef(false)
  const [ancora, setAncora] = useState<string>('')
  const [hover, setHover] = useState<string>('')

  // grade de 6 semanas x 7 dias
  const dias = useMemo(() => {
    const primeiro = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1)
    const inicioGrade = new Date(primeiro)
    inicioGrade.setDate(inicioGrade.getDate() - primeiro.getDay())

    const out: Array<{ data: string; dia: number; doMes: boolean }> = []
    for (let i = 0; i < 42; i++) {
      const d = new Date(inicioGrade)
      d.setDate(d.getDate() + i)
      out.push({
        data: iso(d),
        dia: d.getDate(),
        doMes: d.getMonth() === mesRef.getMonth(),
      })
    }
    return out
  }, [mesRef])

  const aplicar = (a: string, b: string) => {
    const [de, ate] = a <= b ? [a, b] : [b, a]
    onChange(de, ate)
  }

  const pressionar = (d: string) => {
    arrastando.current = true
    setAncora(d)
    setHover(d)
    onChange(d, d)
  }

  const entrar = (d: string) => {
    if (!arrastando.current) return
    setHover(d)
    aplicar(ancora, d)
  }

  const soltar = () => {
    if (arrastando.current && ancora && hover) aplicar(ancora, hover)
    arrastando.current = false
  }

  const clicar = (d: string) => {
    // 16/11/2026 — CLIQUE SIMPLES = UMA DATA SÓ.
    //
    // O dono precisa escolher a data da sessão com um clique. Antes eu
    // alternava entre "abrir intervalo" e "fechar intervalo", e o segundo
    // clique transformava o dia escolhido num RANGE — a data efetiva virava
    // a outra ponta.
    //
    // Agora:
    //   · clique  → seleciona SÓ aquele dia (início = fim = d)
    //   · arrasto → define o intervalo (comportamento preservado)
    //
    // Quem quiser intervalo arrasta; quem quer um dia, clica.
    onChange(d, d)
    setAncora(d)
    setHover(d)
  }

  const noIntervalo = (d: string) => {
    if (!inicio || !fim) return false
    return d >= inicio && d <= fim
  }

  const navegar = (delta: number) => {
    setMesRef(new Date(mesRef.getFullYear(), mesRef.getMonth() + delta, 1))
  }

  const diasIntervalo =
    inicio && fim
      ? Math.round(
          (new Date(fim + 'T12:00:00').getTime() - new Date(inicio + 'T12:00:00').getTime()) /
            86400000,
        ) + 1
      : 0

  return (
    <div
      className="rounded-lg border border-gray-200 bg-white p-2.5 select-none"
      onMouseUp={soltar}
      onMouseLeave={soltar}
    >
      <div className="flex items-center justify-between mb-1.5">
        <button
          type="button"
          onClick={() => navegar(-1)}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-[11.5px] font-bold text-gray-800">
          {MESES[mesRef.getMonth()]} {mesRef.getFullYear()}
        </span>
        <button
          type="button"
          onClick={() => navegar(1)}
          className="p-1 rounded hover:bg-gray-100 text-gray-500"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {DIAS.map((d, i) => (
          <span key={i} className="text-center text-[9px] font-bold text-gray-400 uppercase">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {dias.map((d) => {
          const ehInicio = mesmoDia(d.data, inicio)
          const ehFim = mesmoDia(d.data, fim)
          const dentro = noIntervalo(d.data)
          return (
            <button
              key={d.data}
              type="button"
              onMouseDown={() => pressionar(d.data)}
              onMouseEnter={() => entrar(d.data)}
              onClick={() => clicar(d.data)}
              className={cn(
                'h-6 rounded text-[10.5px] tabular-nums transition-colors',
                !d.doMes && 'text-gray-300',
                d.doMes && !dentro && !ehInicio && !ehFim && 'text-gray-700 hover:bg-gray-100',
                dentro && !ehInicio && !ehFim && 'bg-emerald-100 text-emerald-900',
                (ehInicio || ehFim) && 'bg-[#1b5e20] text-white font-bold',
              )}
              title={d.data.split('-').reverse().join('/')}
            >
              {d.dia}
            </button>
          )
        })}
      </div>

      <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex items-center justify-between text-[10.5px]">
        <span className="text-gray-500">
          {inicio && fim ? (
            <>
              <strong className="text-gray-800">{inicio.split('-').reverse().join('/')}</strong> →{' '}
              <strong className="text-gray-800">{fim.split('-').reverse().join('/')}</strong> ·{' '}
              {diasIntervalo} dia(s)
            </>
          ) : inicio ? (
            <>Início {inicio.split('-').reverse().join('/')} — arraste até o fim</>
          ) : (
            'Arraste sobre os dias para definir o período'
          )}
        </span>
        {(inicio || fim) && (
          <button
            type="button"
            onClick={() => {
              onChange('', '')
              setAncora('')
              setHover('')
            }}
            className="text-[10px] font-semibold text-red-600 hover:underline"
          >
            limpar
          </button>
        )}
      </div>
    </div>
  )
}
