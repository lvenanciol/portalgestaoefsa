import { useState, useRef } from 'react'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  ArrowRight,
  Database,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import pb from '@/lib/pocketbase/client'

interface JuridicosImportModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  onImportadoSucesso: () => void
}

const CAMPOS_DESTINO = [
  { key: 'numero_processo', label: 'Número do Processo *', padroes: ['processo', 'numero', 'nº'] },
  { key: 'vara_comarca', label: 'Vara / Comarca', padroes: ['vara', 'comarca', 'juizo'] },
  { key: 'autor', label: 'Autor / Requerente', padroes: ['autor', 'requerente', 'polo ativo'] },
  { key: 'reu', label: 'Réu / Requerido', padroes: ['reu', 'réu', 'requerido', 'polo passivo'] },
  { key: 'empresa', label: 'Empresa', padroes: ['empresa', 'unidade', 'cliente'] },
  { key: 'fase_instancia', label: 'Fase / Instância', padroes: ['fase', 'instancia', 'etapa'] },
  { key: 'assunto_tipo', label: 'Assunto / Tipo', padroes: ['assunto', 'tipo', 'natureza'] },
  { key: 'valor_causa', label: 'Valor da Causa', padroes: ['valor', 'causa', 'pedido'] },
  {
    key: 'data_distribuicao',
    label: 'Data de Distribuição',
    padroes: ['distribuicao', 'distribuição', 'data'],
  },
  {
    key: 'advogado',
    label: 'Advogado / Responsável',
    padroes: ['advogado', 'patrono', 'responsavel'],
  },
  { key: 'status', label: 'Status', padroes: ['status', 'situacao', 'situação'] },
  { key: 'risco', label: 'Risco', padroes: ['risco', 'contingencia'] },
  {
    key: 'proxima_audiencia',
    label: 'Próxima Audiência',
    padroes: ['audiencia', 'audiência', 'prazo'],
  },
  {
    key: 'observacoes',
    label: 'Observações',
    padroes: ['observacao', 'observações', 'obs', 'detalhe'],
  },
]

export function JuridicosImportModal({
  aberto,
  onOpenChange,
  onImportadoSucesso,
}: JuridicosImportModalProps) {
  const [passo, setPasso] = useState<1 | 2 | 3>(1)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [colunasPlanilha, setColunasPlanilha] = useState<string[]>([])
  const [linhasBrutas, setLinhasBrutas] = useState<any[][]>([])
  const [mapeamento, setMapeamento] = useState<Record<string, number>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ total: number; inseridos: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reiniciar = () => {
    setPasso(1)
    setArquivo(null)
    setColunasPlanilha([])
    setLinhasBrutas([])
    setMapeamento({})
    setSalvando(false)
    setErro(null)
    setResultado(null)
  }

  const handleArquivoSelecionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setErro(null)
    setArquivo(file)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const wsName = wb.SheetNames[0]
      const ws = wb.Sheets[wsName]
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false })

      if (!rows || rows.length === 0) {
        throw new Error('A planilha selecionada está vazia.')
      }

      const headers = (rows[0] || []).map((h, i) => String(h || `Coluna ${i + 1}`).trim())
      setColunasPlanilha(headers)
      setLinhasBrutas(
        rows.slice(1).filter((r) => r && r.length > 0 && r.some((c) => String(c).trim() !== '')),
      )

      // Auto-mapear colunas baseado nos nomes
      const novoMap: Record<string, number> = {}
      CAMPOS_DESTINO.forEach((campo) => {
        const idx = headers.findIndex((h) => {
          const limpo = h.toLowerCase()
          return campo.padroes.some((p) => limpo.includes(p))
        })
        if (idx !== -1) {
          novoMap[campo.key] = idx
        }
      })
      setMapeamento(novoMap)
      setPasso(2)
    } catch (err: any) {
      setErro(err?.message || 'Falha ao processar arquivo XLSX.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const limparNumero = (val: any): number => {
    if (!val) return 0
    const str = String(val)
      .replace(/[R$\s]/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
    const n = parseFloat(str)
    return isNaN(n) ? 0 : n
  }

  const formatarDataIso = (val: any): string | null => {
    if (!val) return null
    const str = String(val).trim()
    // tenta DD/MM/AAAA
    const partes = str.split(/[/-]/)
    if (partes.length === 3) {
      if (partes[2].length === 4) {
        return `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')} 00:00:00.000Z`
      }
      if (partes[0].length === 4) {
        return `${partes[0]}-${partes[1].padStart(2, '0')}-${partes[2].padStart(2, '0')} 00:00:00.000Z`
      }
    }
    return null
  }

  const mapearStatus = (s: any): 'ativo' | 'suspenso' | 'acordo' | 'encerrado' | 'em_recurso' => {
    const txt = String(s || '').toLowerCase()
    if (txt.includes('susp')) return 'suspenso'
    if (txt.includes('acord')) return 'acordo'
    if (txt.includes('encerr') || txt.includes('arquiv') || txt.includes('baixa'))
      return 'encerrado'
    if (txt.includes('recurs')) return 'em_recurso'
    return 'ativo'
  }

  const mapearRisco = (r: any): 'provavel' | 'possivel' | 'remoto' => {
    const txt = String(r || '').toLowerCase()
    if (txt.includes('prov')) return 'provavel'
    if (txt.includes('remot')) return 'remoto'
    return 'possivel'
  }

  const handleConfirmarImportacao = async () => {
    setSalvando(true)
    setErro(null)

    let inseridos = 0
    const errosLinha: string[] = []

    try {
      for (let i = 0; i < linhasBrutas.length; i++) {
        const linha = linhasBrutas[i]

        const getValor = (campo: string) => {
          const colIdx = mapeamento[campo]
          if (colIdx === undefined || colIdx === null || colIdx < 0) return ''
          return String(linha[colIdx] ?? '').trim()
        }

        const numProc = getValor('numero_processo')
        if (!numProc) continue // ignora linha sem número de processo

        const recordData: Record<string, any> = {
          numero_processo: numProc,
          vara_comarca: getValor('vara_comarca') || 'Vara Cível',
          autor: getValor('autor') || 'Polo Ativo',
          reu: getValor('reu') || 'Extrafruti Distribuidora Ltda',
          empresa: getValor('empresa') || 'Extrafruti',
          fase_instancia: getValor('fase_instancia') || '1ª Instância',
          assunto_tipo: getValor('assunto_tipo') || 'Geral / Cível',
          valor_causa: limparNumero(getValor('valor_causa')),
          advogado: getValor('advogado') || '',
          status: mapearStatus(getValor('status')),
          risco: mapearRisco(getValor('risco')),
          observacoes: getValor('observacoes') || '',
        }

        const dtDist = formatarDataIso(getValor('data_distribuicao'))
        if (dtDist) recordData.data_distribuicao = dtDist

        const dtAud = formatarDataIso(getValor('proxima_audiencia'))
        if (dtAud) recordData.proxima_audiencia = dtAud

        try {
          await pb.collection('processos_juridicos').create(recordData)
          inseridos++
        } catch (e: any) {
          errosLinha.push(`Linha ${i + 2}: ${e.message}`)
        }
      }

      setResultado({
        total: linhasBrutas.length,
        inseridos,
      })
      setPasso(3)
      onImportadoSucesso()
    } catch (err: any) {
      setErro(err?.message || 'Falha ao salvar registros de processos jurídicos.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(o) => {
        if (!o) reiniciar()
        onOpenChange(o)
      }}
    >
      <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto p-6 rounded-2xl shadow-xl border border-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900 pb-2 border-b border-gray-100">
            <FileSpreadsheet className="h-5 w-5 text-[#1B5E20]" />
            Importar Relatório de Processos Jurídicos (XLSX)
          </DialogTitle>
        </DialogHeader>

        {erro && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {erro}
          </div>
        )}

        {/* Passo 1: Selecionar Arquivo */}
        {passo === 1 && (
          <div className="space-y-4 pt-2">
            <p className="text-xs text-gray-600 leading-relaxed">
              Faça upload do relatório de processos em Excel (ex: Extrafruti - Demais Áreas). A
              planilha será lida e você poderá mapear as colunas antes da gravação no banco de
              dados.
            </p>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 hover:border-emerald-600 rounded-xl p-8 text-center cursor-pointer bg-gray-50/50 hover:bg-emerald-50/20 transition-all space-y-3"
            >
              <div className="h-12 w-12 rounded-full bg-emerald-100 text-[#1B5E20] flex items-center justify-center mx-auto">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-800">
                  Clique para selecionar a planilha (.xlsx ou .xls)
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Espelhamento de colunas de processos jurídicos
                </div>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleArquivoSelecionado}
              className="hidden"
            />
          </div>
        )}

        {/* Passo 2: Mapeamento e Prévia */}
        {passo === 2 && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between bg-emerald-50/60 p-3 rounded-lg border border-emerald-200/80 text-xs">
              <span className="font-semibold text-emerald-950">Arquivo: {arquivo?.name}</span>
              <span className="text-emerald-800 font-medium">
                {linhasBrutas.length} linhas detectadas
              </span>
            </div>

            <div className="text-xs text-gray-600">
              Revise o mapeamento das colunas da sua planilha com os campos do sistema:
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto p-1 border border-gray-100 rounded-lg bg-gray-50/50">
              {CAMPOS_DESTINO.map((campo) => (
                <div
                  key={campo.key}
                  className="space-y-1 bg-white p-2.5 rounded-md border border-gray-200 shadow-2xs"
                >
                  <Label className="text-[11px] font-bold text-gray-700">{campo.label}</Label>
                  <Select
                    value={
                      mapeamento[campo.key] !== undefined ? String(mapeamento[campo.key]) : 'none'
                    }
                    onValueChange={(val) => {
                      setMapeamento((prev) => ({
                        ...prev,
                        [campo.key]: val === 'none' ? -1 : parseInt(val, 10),
                      }))
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs bg-gray-50 border-gray-200">
                      <SelectValue placeholder="Ignorar campo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Ignorar campo --</SelectItem>
                      {colunasPlanilha.map((col, idx) => (
                        <SelectItem key={idx} value={String(idx)}>
                          {col} (Col. {idx + 1})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPasso(1)}
                className="h-8 text-xs"
              >
                Voltar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleConfirmarImportacao}
                disabled={salvando}
                className="h-8 text-xs bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
              >
                {salvando ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Database className="h-3.5 w-3.5 mr-1.5" />
                )}
                Gravar {linhasBrutas.length} processos no Banco
              </Button>
            </div>
          </div>
        )}

        {/* Passo 3: Sucesso */}
        {passo === 3 && resultado && (
          <div className="py-6 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-emerald-100 text-[#1B5E20] flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                Importação concluída com sucesso!
              </h3>
              <p className="text-xs text-gray-500 mt-1">
                Foram inseridos <strong>{resultado.inseridos}</strong> de {resultado.total}{' '}
                processos no banco de dados.
              </p>
            </div>
            <Button
              type="button"
              onClick={() => {
                reiniciar()
                onOpenChange(false)
              }}
              className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-xs h-9"
            >
              Concluir
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
