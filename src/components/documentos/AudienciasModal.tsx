import { useState, useRef, useEffect } from 'react'
import {
  CalendarDays,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  MapPin,
  User,
  Scale,
  Search,
  Loader2,
  Database,
  ExternalLink,
  Plus,
  Filter,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import pb from '@/lib/pocketbase/client'

export interface AudienciaRegistro {
  id?: string
  pasta: string
  numero_processo: string
  numero_cnj: string
  vara: string
  cidade_uf: string
  natureza_posicao: string
  cliente_principal: string
  parte_contraria: string
  audiencia_tipo: string
  data_hora_inicio: string
  advogado_responsavel: string
  tipo_audiencia: string // Presencial, Virtual, Híbrida
  processo_id?: string
  observacoes?: string
}

interface AudienciasModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  onAudienciasAlteradas?: () => void
}

export function AudienciasModal({
  aberto,
  onOpenChange,
  onAudienciasAlteradas,
}: AudienciasModalProps) {
  const [abaAtiva, setAbaAtiva] = useState<'lista' | 'importar'>('lista')
  const [audiencias, setAudiencias] = useState<any[]>([])
  const [carregando, setCarregando] = useState(false)
  const [busca, setBusca] = useState('')

  // Estados da importação
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [processandoArquivo, setProcessandoArquivo] = useState(false)
  const [linhasExtraidas, setLinhasExtraidas] = useState<AudienciaRegistro[]>([])
  const [salvandoImportacao, setSalvandoImportacao] = useState(false)
  const [resultadoImportacao, setResultadoImportacao] = useState<{
    total: number
    novas: number
    atualizadas: number
  } | null>(null)
  const [erroImportacao, setErroImportacao] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const carregarAudiencias = async () => {
    setCarregando(true)
    try {
      const res = await pb.collection('audiencias').getList(1, 100, {
        sort: 'data_hora_inicio',
        expand: 'processo_id',
      })
      setAudiencias(res.items || [])
    } catch (err) {
      console.error('Erro ao listar audiências:', err)
      setAudiencias([])
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (aberto) {
      carregarAudiencias()
    }
  }, [aberto])

  const handleArquivoXlsx = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setErroImportacao(null)
    setArquivo(file)
    setProcessandoArquivo(true)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const wsName = wb.SheetNames[0]
      const ws = wb.Sheets[wsName]
      const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false })

      if (!rawRows || rawRows.length < 2) {
        throw new Error('A planilha selecionada está vazia ou não possui cabeçalho válido.')
      }

      // Localizar linha de cabeçalho (pode ser linha 1 ou 2)
      let headerIdx = 0
      for (let r = 0; r < Math.min(rawRows.length, 5); r++) {
        const rowText = (rawRows[r] || []).map((c) => String(c || '').toLowerCase()).join(' ')
        if (
          rowText.includes('pasta') ||
          rowText.includes('processo') ||
          rowText.includes('audiência') ||
          rowText.includes('audiencia') ||
          rowText.includes('vara')
        ) {
          headerIdx = r
          break
        }
      }

      const headers = (rawRows[headerIdx] || []).map((h) =>
        String(h || '')
          .trim()
          .toLowerCase(),
      )

      // Mapeamento das colunas conforme a Pauta de Audiências anexada:
      // Pasta | Número do processo | Nº da vara | Cidade - UF | Natureza - Posição | Cliente principal | Parte contrária | Audiência | Data/hora de início | Advogado Responsável | Tipo de audiência
      const colPasta = headers.findIndex((h) => h.includes('pasta'))
      const colProcesso = headers.findIndex(
        (h) => h.includes('número') || h.includes('numero') || h.includes('processo'),
      )
      const colVara = headers.findIndex((h) => h.includes('vara'))
      const colCidade = headers.findIndex((h) => h.includes('cidade') || h.includes('uf'))
      const colNatureza = headers.findIndex(
        (h) => h.includes('natureza') || h.includes('posição') || h.includes('posicao'),
      )
      const colCliente = headers.findIndex((h) => h.includes('cliente'))
      const colContrario = headers.findIndex(
        (h) => h.includes('contrária') || h.includes('contraria') || h.includes('parte'),
      )
      const colAudiencia = headers.findIndex(
        (h) => h.includes('audiência') || h.includes('audiencia') || h.includes('tipo de ato'),
      )
      const colData = headers.findIndex(
        (h) => h.includes('data') || h.includes('início') || h.includes('inicio'),
      )
      const colAdvogado = headers.findIndex(
        (h) => h.includes('advogado') || h.includes('responsável') || h.includes('responsavel'),
      )
      const colTipo = headers.findIndex(
        (h) =>
          h.includes('tipo de audiência') ||
          h.includes('tipo de audiencia') ||
          h.includes('formato'),
      )

      const dataRows = rawRows.slice(headerIdx + 1).filter((r) => {
        if (!r || r.length === 0) return false
        return r.some((c: any) => String(c || '').trim() !== '')
      })

      const parsed: AudienciaRegistro[] = []

      for (const row of dataRows) {
        const getCol = (idx: number) =>
          idx >= 0 && row[idx] !== undefined ? String(row[idx]).trim() : ''

        const pasta = getCol(colPasta >= 0 ? colPasta : 0)
        let numProc = getCol(colProcesso >= 0 ? colProcesso : 1)
        // Limpar hífen no final se vier com " - "
        numProc = numProc.replace(/[\s-]+$/, '').trim()

        if (!pasta && !numProc) continue

        const vara = getCol(colVara >= 0 ? colVara : 2)
        const cidadeUf = getCol(colCidade >= 0 ? colCidade : 3)
        const natureza = getCol(colNatureza >= 0 ? colNatureza : 4)
        const cliente = getCol(colCliente >= 0 ? colCliente : 5)
        const contrario = getCol(colContrario >= 0 ? colContrario : 6)
        const audTipo = getCol(colAudiencia >= 0 ? colAudiencia : 7)
        const dataStr = getCol(colData >= 0 ? colData : 8)
        const advogado = getCol(colAdvogado >= 0 ? colAdvogado : 9)
        const tipoAud = getCol(colTipo >= 0 ? colTipo : 10)

        // Converter data para ISO string
        let isoData = ''
        if (dataStr) {
          const parsedDate = new Date(dataStr)
          if (!isNaN(parsedDate.getTime())) {
            isoData = parsedDate.toISOString()
          } else {
            // Tenta formato brasileiro DD/MM/AAAA HH:mm
            const matchBR = /(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/.exec(dataStr)
            if (matchBR) {
              const [_, dia, mes, ano, h = '00', m = '00'] = matchBR
              isoData = new Date(
                Number(ano),
                Number(mes) - 1,
                Number(dia),
                Number(h),
                Number(m),
              ).toISOString()
            }
          }
        }

        parsed.push({
          pasta,
          numero_processo: numProc || pasta,
          numero_cnj: numProc || pasta,
          vara,
          cidade_uf: cidadeUf,
          natureza_posicao: natureza,
          cliente_principal: cliente || 'Extrafruti',
          parte_contraria: contrario,
          audiencia_tipo: audTipo || 'Audiência',
          data_hora_inicio: isoData || new Date().toISOString(),
          advogado_responsavel: advogado,
          tipo_audiencia: tipoAud || 'Presencial',
        })
      }

      if (parsed.length === 0) {
        throw new Error(
          'Nenhuma linha de audiência com número de pasta ou processo foi identificada.',
        )
      }

      setLinhasExtraidas(parsed)
    } catch (err: any) {
      setErroImportacao(err?.message || 'Falha ao processar a pauta de audiências.')
    } finally {
      setProcessandoArquivo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Grava as audiências no PocketBase com Upsert (evita duplicar por processo + data_hora_inicio)
  const handleConfirmarImportacao = async () => {
    setSalvandoImportacao(true)
    setErroImportacao(null)

    let novas = 0
    let atualizadas = 0

    try {
      // Carregar mapa de processos para vincular CNJ/código com processo_id
      const processosMap: Record<string, string> = {}
      try {
        const procs = await pb.collection('processos_juridicos').getFullList({
          fields: 'id,numero_processo,numero_cnj,processo_codigo',
        })
        procs.forEach((p) => {
          if (p.numero_processo) processosMap[p.numero_processo.trim()] = p.id
          if (p.numero_cnj) processosMap[p.numero_cnj.trim()] = p.id
          if (p.processo_codigo) processosMap[p.processo_codigo.trim()] = p.id
        })
      } catch (err) {
        console.warn('Aviso ao carregar mapa de processos:', err)
      }

      for (const item of linhasExtraidas) {
        const numProc = item.numero_processo.trim()
        const cnj = item.numero_cnj.trim()
        const pasta = item.pasta.trim()
        const dataInicio = item.data_hora_inicio

        // Tentar vincular processo_id
        const procIdVinculado =
          processosMap[cnj] || processosMap[numProc] || processosMap[pasta] || null

        // Verificar se já existe audiência para este processo nesta mesma data/hora (upsert)
        let existente: any = null
        try {
          const filtro = `(numero_cnj = "${cnj}" || numero_processo = "${numProc}" || pasta = "${pasta}") && data_hora_inicio = "${dataInicio}"`
          existente = await pb.collection('audiencias').getFirstListItem(filtro)
        } catch (_) {
          existente = null
        }

        const dadosPayload: any = {
          pasta,
          numero_processo: numProc,
          numero_cnj: cnj,
          vara: item.vara,
          cidade_uf: item.cidade_uf,
          natureza_posicao: item.natureza_posicao,
          cliente_principal: item.cliente_principal,
          parte_contraria: item.parte_contraria,
          audiencia_tipo: item.audiencia_tipo,
          data_hora_inicio: dataInicio,
          advogado_responsavel: item.advogado_responsavel,
          tipo_audiencia: item.tipo_audiencia,
          processo_id: procIdVinculado || existente?.processo_id || '',
        }

        if (existente) {
          await pb.collection('audiencias').update(existente.id, dadosPayload)
          atualizadas++
        } else {
          await pb.collection('audiencias').create(dadosPayload)
          novas++
        }
      }

      setResultadoImportacao({
        total: linhasExtraidas.length,
        novas,
        atualizadas,
      })
      await carregarAudiencias()
      if (onAudienciasAlteradas) onAudienciasAlteradas()
    } catch (err: any) {
      console.error('Erro na importação de audiências:', err)
      setErroImportacao(err?.message || 'Falha ao salvar audiências no banco de dados.')
    } finally {
      setSalvandoImportacao(false)
    }
  }

  const fmtDataHora = (dataStr: string) => {
    if (!dataStr) return '—'
    try {
      const d = new Date(dataStr)
      return (
        d.toLocaleDateString('pt-BR') +
        ' às ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      )
    } catch {
      return dataStr
    }
  }

  const audienciasFiltradas = audiencias.filter((a) => {
    if (!busca.trim()) return true
    const termo = busca.toLowerCase()
    return (
      (a.numero_processo || '').toLowerCase().includes(termo) ||
      (a.numero_cnj || '').toLowerCase().includes(termo) ||
      (a.pasta || '').toLowerCase().includes(termo) ||
      (a.parte_contraria || '').toLowerCase().includes(termo) ||
      (a.audiencia_tipo || '').toLowerCase().includes(termo) ||
      (a.advogado_responsavel || '').toLowerCase().includes(termo) ||
      (a.vara || '').toLowerCase().includes(termo)
    )
  })

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-4xl max-h-[85vh] overflow-y-auto p-6 rounded-2xl shadow-xl border border-gray-200">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-100">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900">
              <CalendarDays className="h-5 w-5 text-[#1B5E20]" />
              Controle de Audiências Jurídicas
            </DialogTitle>
            <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl">
              <Button
                type="button"
                size="sm"
                variant={abaAtiva === 'lista' ? 'default' : 'ghost'}
                onClick={() => setAbaAtiva('lista')}
                className={`h-7 px-3 text-xs ${
                  abaAtiva === 'lista'
                    ? 'bg-white text-gray-900 shadow-2xs font-semibold'
                    : 'text-gray-600'
                }`}
              >
                Pauta de Audiências ({audiencias.length})
              </Button>
              <Button
                type="button"
                size="sm"
                variant={abaAtiva === 'importar' ? 'default' : 'ghost'}
                onClick={() => setAbaAtiva('importar')}
                className={`h-7 px-3 text-xs ${
                  abaAtiva === 'importar'
                    ? 'bg-white text-gray-900 shadow-2xs font-semibold'
                    : 'text-gray-600'
                }`}
              >
                <Upload className="h-3 w-3 mr-1" />
                Importar Pauta (XLSX)
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* ABA: LISTA DE AUDIÊNCIAS */}
        {abaAtiva === 'lista' && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por processo, CNJ, parte contrária, vara ou advogado..."
                  className="pl-8 h-8 text-xs border-gray-200 rounded-lg"
                />
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setAbaAtiva('importar')}
                className="h-8 text-xs bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
              >
                <Upload className="h-3.5 w-3.5 mr-1" />
                Importar Nova Pauta
              </Button>
            </div>

            {carregando ? (
              <div className="py-12 text-center text-xs text-gray-500">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-emerald-800 mb-2" />
                Carregando pauta de audiências...
              </div>
            ) : audienciasFiltradas.length === 0 ? (
              <div className="py-12 text-center space-y-3 bg-gray-50 rounded-xl border border-gray-100">
                <CalendarDays className="h-10 w-10 text-gray-300 mx-auto" />
                <div className="text-xs font-semibold text-gray-800">
                  {audiencias.length === 0
                    ? 'Nenhuma audiência cadastrada na pauta'
                    : 'Nenhuma audiência encontrada para o filtro'}
                </div>
                <p className="text-[11px] text-gray-500 max-w-sm mx-auto">
                  Utilize o botão "Importar Pauta (XLSX)" para carregar o arquivo com os horários,
                  varas e processos da pauta.
                </p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-2xs divide-y divide-gray-100 max-h-[55vh] overflow-y-auto">
                {audienciasFiltradas.map((aud) => (
                  <div
                    key={aud.id}
                    className="p-3.5 text-xs hover:bg-gray-50/70 transition-colors space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="bg-emerald-50 text-emerald-900 border-emerald-300 font-mono text-[10px]"
                        >
                          Pasta {aud.pasta || '—'}
                        </Badge>
                        <span className="font-semibold text-gray-900 font-mono">
                          {aud.numero_cnj || aud.numero_processo}
                        </span>
                        {aud.processo_id && (
                          <Badge className="bg-blue-100 text-blue-800 text-[10px] font-normal border-0">
                            Processo Vinculado
                          </Badge>
                        )}
                      </div>
                      <Badge
                        className={`text-[10px] font-medium border-0 ${
                          aud.tipo_audiencia?.toLowerCase().includes('presenc')
                            ? 'bg-purple-100 text-purple-800'
                            : aud.tipo_audiencia?.toLowerCase().includes('virt')
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {aud.tipo_audiencia || 'Presencial'}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-gray-600 bg-gray-50/80 p-2.5 rounded-lg">
                      <div className="space-y-1">
                        <div className="text-gray-400 text-[10px]">Data e Hora:</div>
                        <div className="font-bold text-emerald-900 flex items-center gap-1">
                          <Clock className="h-3 w-3 text-emerald-700" />
                          {fmtDataHora(aud.data_hora_inicio)}
                        </div>
                        <div className="text-gray-700 font-medium">{aud.audiencia_tipo}</div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-gray-400 text-[10px]">Partes & Comarca:</div>
                        <div className="font-medium text-gray-800">
                          {aud.parte_contraria || 'Não informada'}
                        </div>
                        <div className="text-gray-500 text-[10px] flex items-center gap-1">
                          <MapPin className="h-2.5 w-2.5 text-gray-400" />
                          {aud.vara ? `${aud.vara} — ` : ''}
                          {aud.cidade_uf || '—'}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-gray-400 text-[10px]">Advogado Responsável:</div>
                        <div className="font-medium text-gray-800 flex items-center gap-1">
                          <User className="h-3 w-3 text-gray-400" />
                          {aud.advogado_responsavel || 'Não informado'}
                        </div>
                        <div className="text-gray-500 text-[10px]">
                          {aud.cliente_principal || 'Extrafruti'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ABA: IMPORTAR PAUTA DE AUDIÊNCIAS */}
        {abaAtiva === 'importar' && (
          <div className="space-y-4 pt-2">
            {erroImportacao && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {erroImportacao}
              </div>
            )}

            {resultadoImportacao ? (
              <div className="py-8 text-center space-y-4 bg-emerald-50/40 rounded-xl border border-emerald-100 p-6">
                <div className="h-12 w-12 rounded-full bg-emerald-100 text-[#1B5E20] flex items-center justify-center mx-auto">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    Pauta de audiências importada com sucesso!
                  </h3>
                  <p className="text-xs text-gray-600 mt-1">
                    Total de <strong>{resultadoImportacao.total}</strong> audiências processadas:{' '}
                    <strong className="text-emerald-700">{resultadoImportacao.novas} novas</strong>{' '}
                    e{' '}
                    <strong className="text-blue-700">
                      {resultadoImportacao.atualizadas} atualizadas
                    </strong>{' '}
                    sem duplicidades.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setResultadoImportacao(null)
                    setLinhasExtraidas([])
                    setArquivo(null)
                    setAbaAtiva('lista')
                  }}
                  className="bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-xs h-8 px-5"
                >
                  Ver Pauta de Audiências
                </Button>
              </div>
            ) : linhasExtraidas.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-600">
                  Carregue a planilha <strong>Pauta de audiências (.xlsx)</strong>. O sistema
                  reconhece as colunas: Pasta, Número do processo, Vara, Cidade - UF, Natureza -
                  Posição, Cliente, Parte contrária, Tipo de audiência, Data/hora de início,
                  Advogado e Formato (Presencial/Virtual/Híbrida).
                </p>

                <div
                  onClick={() => !processandoArquivo && fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all space-y-3 ${
                    processandoArquivo
                      ? 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'
                      : 'border-gray-300 hover:border-emerald-600 bg-gray-50/50 hover:bg-emerald-50/20'
                  }`}
                >
                  <div className="h-10 w-10 rounded-full bg-emerald-100 text-[#1B5E20] flex items-center justify-center mx-auto">
                    {processandoArquivo ? (
                      <Loader2 className="h-5 w-5 animate-spin text-emerald-800" />
                    ) : (
                      <FileSpreadsheet className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-800">
                      {processandoArquivo
                        ? 'Lendo planilha de audiências...'
                        : 'Clique para selecionar a Pauta (.xlsx, .xls, .csv)'}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      Processo de importação com detecção de CNJ e vinculação automática com o
                      acervo jurídico
                    </div>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleArquivoXlsx}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-xs">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-800" />
                    <span className="font-semibold text-emerald-950 truncate max-w-sm">
                      {arquivo?.name}
                    </span>
                  </div>
                  <Badge className="bg-emerald-200 text-emerald-900 border-0">
                    {linhasExtraidas.length} audiências encontradas
                  </Badge>
                </div>

                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  <div className="bg-gray-50 px-3 py-2 text-[11px] font-bold text-gray-700">
                    Amostra das audiências a serem importadas:
                  </div>
                  {linhasExtraidas.slice(0, 5).map((linha, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 text-xs flex justify-between items-center gap-2"
                    >
                      <div>
                        <div className="font-semibold text-gray-900">
                          {linha.numero_cnj || linha.pasta}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {linha.audiencia_tipo} — {fmtDataHora(linha.data_hora_inicio)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-gray-800 text-[11px]">
                          {linha.parte_contraria || '—'}
                        </div>
                        <div className="text-[10px] text-gray-400">{linha.cidade_uf}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-between items-center pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setLinhasExtraidas([])
                      setArquivo(null)
                    }}
                    className="h-8 text-xs"
                  >
                    Trocar Arquivo
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleConfirmarImportacao}
                    disabled={salvandoImportacao}
                    className="h-8 text-xs bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                  >
                    {salvandoImportacao ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Database className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Gravar {linhasExtraidas.length} audiências (com Upsert)
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
