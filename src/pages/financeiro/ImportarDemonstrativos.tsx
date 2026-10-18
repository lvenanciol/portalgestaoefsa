import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertTriangle, Trash2 } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Fase 8 — Importação de demonstrativos contábeis (Balancete/DRE).
// Aceita XLSX, CSV e PDF (extração no sandbox pelo Maestro; aqui o admin
// cola/arrasta o arquivo e o frontend envia CSV/JSON já estruturado —
// para PDF, o Maestro processa e entrega o JSON via chat).

const MESES = [
  { v: '2026-01', l: 'Janeiro/26' },
  { v: '2026-02', l: 'Fevereiro/26' },
  { v: '2026-03', l: 'Março/26' },
  { v: '2026-04', l: 'Abril/26' },
  { v: '2026-05', l: 'Maio/26' },
  { v: '2026-06', l: 'Junho/26' },
  { v: '2026-07', l: 'Julho/26' },
  { v: '2026-08', l: 'Agosto/26' },
  { v: '2026-09', l: 'Setembro/26' },
  { v: '2026-10', l: 'Outubro/26' },
  { v: '2026-11', l: 'Novembro/26' },
  { v: '2026-12', l: 'Dezembro/26' },
]

export default function ImportarDemonstrativos() {
  const [tipo, setTipo] = useState('balancete')
  const [periodo, setPeriodo] = useState('2026-10')
  const [empresa, setEmpresa] = useState('')
  const [jsonTexto, setJsonTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Parser de CSV (separador ; ou tab) → linhas conforme tipo
  const parseCsv = (texto: string) => {
    const sep = texto.includes('\t') ? '\t' : texto.split('\n')[0].includes(';') ? ';' : ','
    const linhas = texto.split(/\r?\n/).filter((l) => l.trim())
    if (linhas.length === 0) return null
    const header = linhas[0].split(sep).map((h) => h.trim().toUpperCase())
    const num = (s?: string) => {
      if (!s) return 0
      const t = s
        .trim()
        .replace(/[R$\s]/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
      const v = parseFloat(t)
      return isNaN(v) ? 0 : v
    }
    const out: any[] = []
    for (let i = 1; i < linhas.length; i++) {
      const c = linhas[i].split(sep).map((x) => x.trim())
      const row: any = {}
      header.forEach((h, j) => (row[h] = c[j]))
      if (tipo === 'balancete') {
        const conta = row['CONTA'] || row['CTA'] || ''
        const nome = row['NOME'] || row['DESCRICAO'] || row['DESCR'] || ''
        if (!nome) continue
        out.push({
          conta: conta,
          nome: nome,
          grau: conta && !conta.includes('.') ? 1 : 2,
          saldo_anterior: num(row['SALDO ANTERIOR'] || row['SALDOANTERIOR']),
          debitos: num(row['DEBITOS'] || row['DÉBITOS'] || row['DEBITO']),
          creditos: num(row['CREDITOS'] || row['CRÉDITOS'] || row['CREDITO']),
          saldo_atual: num(row['SALDO ATUAL'] || row['SALDOATUAL'] || row['SALDO']),
        })
      } else {
        const nome = row['NOME'] || row['DESCRICAO'] || row['CONTA'] || ''
        if (!nome) continue
        out.push({
          ordem: out.length,
          conta: row['CONTA'] || '',
          nome: nome,
          nivel:
            row['NIVEL'] === 'grupo' ? 'grupo' : row['NIVEL'] === 'subtotal' ? 'subtotal' : 'linha',
          valor: num(row['VALOR'] || row['VALOR DO MES'] || row['TOTAL']),
        })
      }
    }
    return out.length ? out : null
  }

  const handleArquivo = async (file: File) => {
    setResultado(null)
    if (file.name.toLowerCase().endsWith('.pdf')) {
      setResultado({
        ok: false,
        msg: 'PDF detectado — o Maestro processa PDFs pelo chat. Envie o arquivo no chat ou use XLSX/CSV aqui.',
      })
      return
    }
    const texto = await file.text()
    const linhas = parseCsv(texto)
    if (!linhas) {
      setResultado({
        ok: false,
        msg: 'Não consegui interpretar o arquivo. Verifique colunas (CONTA, NOME, SALDO ANTERIOR, DÉBITOS, CRÉDITOS, SALDO ATUAL).',
      })
      return
    }
    setJsonTexto(JSON.stringify(linhas))
    setResultado({ ok: true, msg: linhas.length + ' linhas reconhecidas — revise e envie.' })
  }

  const enviar = async () => {
    setEnviando(true)
    setResultado(null)
    try {
      const linhas = JSON.parse(jsonTexto)
      await pb.send('/backend/v1/demonstrativos/importar', {
        method: 'POST',
        body: JSON.stringify({ tipo, periodo, empresa, linhas }),
      })
      setResultado({
        ok: true,
        msg: 'Importação concluída! As telas Balancete/DRE já leem estes dados.',
      })
      setJsonTexto('')
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || String(e)
      setResultado({ ok: false, msg: 'Erro: ' + msg })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-2.5">
        <div className="h-9 w-9 rounded-lg bg-emerald-50 border border-emerald-200/60 flex items-center justify-center text-[#1B5E20]">
          <Upload className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Importar Demonstrativo Contábil</h2>
          <p className="text-[12px] text-gray-500">
            Balancete de Verificação ou DRE gerados no Sankhya (XLSX/CSV). O import substitui o
            período inteiro.
          </p>
        </div>
      </div>

      {/* Config */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Tipo
          </Label>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger className="h-10 bg-gray-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="balancete">Balancete de Verificação</SelectItem>
              <SelectItem value="dre">DRE</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Período
          </Label>
          <Select value={periodo} onValueChange={setPeriodo}>
            <SelectTrigger className="h-10 bg-gray-50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MESES.map((m) => (
                <SelectItem key={m.v} value={m.v}>
                  {m.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Empresa (opcional)
          </Label>
          <Input
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            placeholder="Ex.: Extrafruti consolidado"
            className="h-10 bg-gray-50"
          />
        </div>
      </div>

      {/* Arquivo */}
      <div
        className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center bg-gray-50/50 hover:bg-gray-50 transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const f = e.dataTransfer.files?.[0]
          if (f) handleArquivo(f)
        }}
      >
        <FileSpreadsheet className="h-8 w-8 text-gray-400 mx-auto mb-2" />
        <p className="text-[13px] font-semibold text-gray-700">
          Arraste o arquivo ou clique para selecionar
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          XLSX exportado como CSV ou CSV nativo · PDF: envie pelo chat para o Maestro processar
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,.tsv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleArquivo(f)
          }}
        />
      </div>

      {/* JSON reconhecido (editável) */}
      {jsonTexto && (
        <div className="grid gap-1.5">
          <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            Linhas reconhecidas (JSON — editável antes de enviar)
          </Label>
          <textarea
            value={jsonTexto}
            onChange={(e) => setJsonTexto(e.target.value)}
            rows={8}
            className="w-full text-[11px] font-mono bg-gray-50 border border-gray-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20"
          />
        </div>
      )}

      {/* Resultado */}
      {resultado && (
        <div
          className={cn(
            'p-3 rounded-lg border text-[13px] font-medium flex items-center gap-2',
            resultado.ok
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-red-50 border-red-200 text-red-700',
          )}
        >
          {resultado.ok ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {resultado.msg}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={enviar}
          disabled={enviando || !jsonTexto}
          className="h-10 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
        >
          {enviando ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-1.5" />
          )}
          {enviando
            ? 'Importando...'
            : 'Importar ' + (tipo === 'balancete' ? 'Balancete' : 'DRE') + ' — ' + periodo}
        </Button>
        {jsonTexto && (
          <Button
            variant="ghost"
            onClick={() => {
              setJsonTexto('')
              setResultado(null)
            }}
            className="h-10 text-gray-500"
          >
            <Trash2 className="h-4 w-4 mr-1" /> Limpar
          </Button>
        )}
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        Colunas esperadas — Balancete: CONTA, NOME, SALDO ANTERIOR, DÉBITOS, CRÉDITOS, SALDO ATUAL ·
        DRE: CONTA, NOME, NIVEL (grupo/subtotal/linha), VALOR. A quadratura (ΣD = ΣC) é verificada
        automaticamente na leitura.
      </p>
    </div>
  )
}
