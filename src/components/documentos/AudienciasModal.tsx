import { useState, useRef, useEffect } from 'react'
import {
  CalendarDays,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
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
  Pencil,
  Trash2,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
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

  // ===== CRUD manual de audiências (11/11/2026) =====
  // Antes só existia importação de planilha: não havia como incluir uma
  // audiência avulsa, corrigir um horário ou remover uma linha errada.
  const [dialogAud, setDialogAud] = useState<null | 'nova' | string>(null)
  const [audForm, setAudForm] = useState<Record<string, string>>({})
  const [salvandoAud, setSalvandoAud] = useState(false)
  const [erroAud, setErroAud] = useState<string | null>(null)

  // Estados da importação
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [processandoArquivo, setProcessandoArquivo] = useState(false)
  const [linhasExtraidas, setLinhasExtraidas] = useState<AudienciaRegistro[]>([])
  const [salvandoImportacao, setSalvandoImportacao] = useState(false)
  const [resultadoImportacao, setResultadoImportacao] = useState<{
    total: number
    novas: number
    atualizadas: number
    falhas?: { processo: string; motivo: string }[]
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
      if (!wb || !Array.isArray(wb.SheetNames) || wb.SheetNames.length === 0) {
        throw new Error('A planilha selecionada não possui abas legíveis.')
      }
      const wsName = wb.SheetNames[0]
      const ws = wb.Sheets[wsName]
      if (!ws) {
        throw new Error('Não foi possível ler a primeira aba da planilha.')
      }

      const rawRows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: false }) || []

      if (!Array.isArray(rawRows) || rawRows.length < 2) {
        throw new Error('A planilha selecionada está vazia ou não possui cabeçalho válido.')
      }

      // Localizar a linha de cabeçalho pelo MAIOR NÚMERO DE COLUNAS PREENCHIDAS.
      // (11/11/2026) Antes o laço parava no PRIMEIRO hit, e o título da planilha
      // "Pauta de Audiências" contém "audiência" — então headerIdx virava 0 e
      // toda a planilha era lida por posição. Resultado medido com a pauta real
      // da Extrafruti: 4 registros gravados em vez de 2, sendo dois deles o
      // próprio cabeçalho ("Pasta", "Data da emissão:").
      let headerIdx = -1
      let melhorScore = 0
      for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
        const rowArr = Array.isArray(rawRows[r]) ? rawRows[r] : []
        const preenchidas = rowArr.filter(
          (c) => c !== null && c !== undefined && String(c).trim() !== '',
        ).length
        const rowText = rowArr
          .map((c) => (c !== null && c !== undefined ? String(c).toLowerCase() : ''))
          .join(' ')
        const palavrasChave = [
          'pasta',
          'processo',
          'vara',
          'audiência',
          'audiencia',
          'advogado',
          'data',
        ]
        const hits = palavrasChave.filter((k) => rowText.includes(k)).length
        if (preenchidas >= 4 && hits >= 2 && preenchidas > melhorScore) {
          headerIdx = r
          melhorScore = preenchidas
        }
      }
      if (headerIdx < 0) headerIdx = 0

      const headerRow = Array.isArray(rawRows[headerIdx]) ? rawRows[headerIdx] : []
      const headers = headerRow.map((h) =>
        (h !== null && h !== undefined ? String(h) : '').trim().toLowerCase(),
      )

      // Mapeamento das colunas conforme a Pauta de Audiências anexada:
      // Pasta | Número do processo | Nº da vara | Cidade - UF | Natureza - Posição | Cliente principal | Parte contrária | Audiência | Data/hora de início | Advogado Responsável | Tipo de audiência
      const colPasta = headers.findIndex((h) => typeof h === 'string' && h.includes('pasta'))
      const colProcesso = headers.findIndex(
        (h) =>
          typeof h === 'string' &&
          (h.includes('número') || h.includes('numero') || h.includes('processo')),
      )
      const colVara = headers.findIndex((h) => typeof h === 'string' && h.includes('vara'))
      const colCidade = headers.findIndex(
        (h) => typeof h === 'string' && (h.includes('cidade') || h.includes('uf')),
      )
      const colNatureza = headers.findIndex(
        (h) =>
          typeof h === 'string' &&
          (h.includes('natureza') || h.includes('posição') || h.includes('posicao')),
      )
      const colCliente = headers.findIndex((h) => typeof h === 'string' && h.includes('cliente'))
      const colContrario = headers.findIndex(
        (h) =>
          typeof h === 'string' &&
          (h.includes('contrária') || h.includes('contraria') || h.includes('parte')),
      )
      const colAudiencia = headers.findIndex(
        (h) =>
          typeof h === 'string' &&
          (h.includes('audiência') || h.includes('audiencia') || h.includes('tipo de ato')),
      )
      const colData = headers.findIndex(
        (h) =>
          typeof h === 'string' &&
          (h.includes('data') || h.includes('início') || h.includes('inicio')),
      )
      const colAdvogado = headers.findIndex(
        (h) =>
          typeof h === 'string' &&
          (h.includes('advogado') || h.includes('responsável') || h.includes('responsavel')),
      )
      const colTipo = headers.findIndex(
        (h) =>
          typeof h === 'string' &&
          (h.includes('tipo de audiência') ||
            h.includes('tipo de audiencia') ||
            h.includes('formato')),
      )

      const dataRows = rawRows.slice(headerIdx + 1).filter((r) => {
        if (!r || !Array.isArray(r) || r.length === 0) return false
        return r.some((c: any) => c !== null && c !== undefined && String(c).trim() !== '')
      })

      const parsed: AudienciaRegistro[] = []

      for (const row of dataRows) {
        if (!Array.isArray(row)) continue

        const getCol = (idx: number) => {
          if (idx < 0 || idx >= row.length) return ''
          const val = row[idx]
          if (val === null || val === undefined) return ''
          return String(val).trim()
        }

        const pasta = getCol(colPasta >= 0 ? colPasta : 0)
        let numProc = getCol(colProcesso >= 0 ? colProcesso : 1)
        // Limpar hífen no final se vier com " - "
        numProc = numProc.replace(/[\s-]+$/, '').trim()

        if (!pasta && !numProc) continue

        // (11/11/2026) DESCARTE DE LINHAS QUE NÃO SÃO AUDIÊNCIA.
        // Sem número de processo com cara de CNJ nem pasta numérica, a linha é
        // cabeçalho, título ou totalizador — e não pode virar registro.
        const pareceProcesso = /\d{5,}/.test(numProc) || /\d{4,}/.test(pasta)
        if (!pareceProcesso) continue

        const vara = getCol(colVara >= 0 ? colVara : 2)
        const cidadeUf = getCol(colCidade >= 0 ? colCidade : 3)
        const natureza = getCol(colNatureza >= 0 ? colNatureza : 4)
        const cliente = getCol(colCliente >= 0 ? colCliente : 5)
        const contrario = getCol(colContrario >= 0 ? colContrario : 6)
        const audTipo = getCol(colAudiencia >= 0 ? colAudiencia : 7)
        const dataStr = getCol(colData >= 0 ? colData : 8)
        const advogado = getCol(colAdvogado >= 0 ? colAdvogado : 9)
        const tipoAud = getCol(colTipo >= 0 ? colTipo : 10)

        // (11/11/2026) DATA: formato brasileiro PRIMEIRO, nunca new Date() direto.
        // `new Date("10/11/2026 08:40:00")` é interpretado como MM/DD pelo JS e
        // devolvia 11 de OUTUBRO — toda audiência com dia <= 12 caía no mês
        // errado, e o fallback brasileiro nunca rodava porque a data "era válida"
        // na leitura americana. Medido com a pauta real: 10/11/2026 -> 11/10/2026.
        let isoData = ''
        if (dataStr) {
          const matchBR = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[\sT]+(\d{1,2}):(\d{2}))?/.exec(
            dataStr,
          )
          if (matchBR) {
            const dia = Number(matchBR[1])
            const mes = Number(matchBR[2])
            let ano = Number(matchBR[3])
            if (ano < 100) ano += 2000
            const h = Number(matchBR[4] || 0)
            const mi = Number(matchBR[5] || 0)
            if (dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12) {
              // Monta no fuso LOCAL e devolve o mesmo instante em ISO.
              const d = new Date(ano, mes - 1, dia, h, mi, 0)
              if (!isNaN(d.getTime())) isoData = d.toISOString()
            }
          }
          // Fallback: já vem em ISO/carimbo do Excel
          if (!isoData) {
            const parsedDate = new Date(dataStr)
            if (!isNaN(parsedDate.getTime())) isoData = parsedDate.toISOString()
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
          'Nenhuma linha de audiência com número de pasta ou processo foi identificada na planilha.',
        )
      }

      setLinhasExtraidas(parsed)
    } catch (err: any) {
      console.error('Erro ao processar arquivo XLSX:', err)
      setErroImportacao(err?.message || 'Falha ao processar a pauta de audiências.')
    } finally {
      setProcessandoArquivo(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Grava as audiências no PocketBase com Upsert defensivo (evita duplicar por processo + data_hora_inicio)
  const handleConfirmarImportacao = async () => {
    setSalvandoImportacao(true)
    setErroImportacao(null)

    let novas = 0
    let atualizadas = 0
    const falhas: { processo: string; motivo: string }[] = []

    try {
      // Carregar mapa de processos para vincular CNJ/código com processo_id
      const processosMap: Record<string, string> = {}
      try {
        const procs = await pb.collection('processos_juridicos').getFullList({
          fields: 'id,numero_processo,numero_cnj,processo_codigo',
        })
        if (Array.isArray(procs)) {
          procs.forEach((p) => {
            if (p.numero_processo) processosMap[String(p.numero_processo).trim()] = p.id
            if (p.numero_cnj) processosMap[String(p.numero_cnj).trim()] = p.id
            if (p.processo_codigo) processosMap[String(p.processo_codigo).trim()] = p.id
          })
        }
      } catch (err) {
        console.warn('Aviso ao carregar mapa de processos:', err)
      }

      for (const item of linhasExtraidas) {
        const numProc = String(item.numero_processo || '').trim()
        const cnj = String(item.numero_cnj || '').trim()
        const pasta = String(item.pasta || '').trim()
        const dataInicio = item.data_hora_inicio || new Date().toISOString()

        try {
          // Tentar vincular processo_id
          const procIdVinculado =
            processosMap[cnj] || processosMap[numProc] || processosMap[pasta] || null

          // Verificar se já existe audiência para este processo nesta mesma data/hora (upsert)
          let existente: any = null
          try {
            const condicoes: string[] = []
            if (cnj) condicoes.push(`numero_cnj = "${cnj}"`)
            if (numProc) condicoes.push(`numero_processo = "${numProc}"`)
            if (pasta) condicoes.push(`pasta = "${pasta}"`)

            if (condicoes.length > 0) {
              const filtro = `(${condicoes.join(' || ')}) && data_hora_inicio = "${dataInicio}"`
              existente = await pb.collection('audiencias').getFirstListItem(filtro)
            }
          } catch (_) {
            existente = null
          }

          const dadosPayload: Record<string, any> = {
            pasta: pasta || '',
            numero_processo: numProc || pasta,
            numero_cnj: cnj || numProc || pasta,
            vara: item.vara || '',
            cidade_uf: item.cidade_uf || '',
            natureza_posicao: item.natureza_posicao || '',
            cliente_principal: item.cliente_principal || 'Extrafruti',
            parte_contraria: item.parte_contraria || '',
            audiencia_tipo: item.audiencia_tipo || 'Audiência',
            data_hora_inicio: dataInicio,
            advogado_responsavel: item.advogado_responsavel || '',
            tipo_audiencia: item.tipo_audiencia || 'Presencial',
            processo_id: procIdVinculado || existente?.processo_id || '',
          }

          if (existente) {
            await pb.collection('audiencias').update(existente.id, dadosPayload)
            atualizadas++
          } else {
            await pb.collection('audiencias').create(dadosPayload)
            novas++
          }
        } catch (itemErr: any) {
          console.warn(`Erro ao salvar audiência (${numProc || pasta}):`, itemErr)
          falhas.push({
            processo: numProc || pasta || 'Audiência',
            motivo: itemErr?.message || 'Erro ao gravar no banco de dados',
          })
        }
      }

      setResultadoImportacao({
        total: linhasExtraidas.length,
        novas,
        atualizadas,
        falhas,
      })
      await carregarAudiencias()
      if (onAudienciasAlteradas) onAudienciasAlteradas()
    } catch (err: any) {
      console.error('Erro geral na importação de audiências:', err)
      setErroImportacao(err?.message || 'Falha ao salvar audiências no banco de dados.')
    } finally {
      setSalvandoImportacao(false)
    }
  }

  const audCamposVazios = () => ({
    pasta: '',
    numero_processo: '',
    numero_cnj: '',
    vara: '',
    cidade_uf: '',
    natureza_posicao: '',
    cliente_principal: 'Extrafruti',
    parte_contraria: '',
    audiencia_tipo: 'Audiência',
    data_hora_local: '',
    advogado_responsavel: '',
    tipo_audiencia: 'Presencial',
    observacoes: '',
  })

  const abrirNovaAudiencia = () => {
    setErroAud(null)
    setAudForm(audCamposVazios())
    setDialogAud('nova')
  }

  // ISO -> valor de <input type="datetime-local"> no fuso local
  const isoParaLocalInput = (iso: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  }

  const abrirEditarAudiencia = (a: any) => {
    setErroAud(null)
    setAudForm({
      pasta: a.pasta || '',
      numero_processo: a.numero_processo || '',
      numero_cnj: a.numero_cnj || '',
      vara: a.vara || '',
      cidade_uf: a.cidade_uf || '',
      natureza_posicao: a.natureza_posicao || '',
      cliente_principal: a.cliente_principal || 'Extrafruti',
      parte_contraria: a.parte_contraria || '',
      audiencia_tipo: a.audiencia_tipo || 'Audiência',
      data_hora_local: isoParaLocalInput(a.data_hora_inicio),
      advogado_responsavel: a.advogado_responsavel || '',
      tipo_audiencia: a.tipo_audiencia || 'Presencial',
      observacoes: a.observacoes || '',
    })
    setDialogAud(a.id)
  }

  const salvarAudiencia = async () => {
    setSalvandoAud(true)
    setErroAud(null)
    try {
      if (!audForm.numero_processo && !audForm.pasta) {
        throw new Error('Informe a pasta ou o número do processo.')
      }
      if (!audForm.data_hora_local) {
        throw new Error('Informe a data e a hora da audiência.')
      }
      // datetime-local não traz fuso; new Date(y,m,d,h,mi) usa o fuso local
      const [dataP, horaP = '00:00'] = audForm.data_hora_local.split('T')
      const [ano, mes, dia] = dataP.split('-').map(Number)
      const [h, mi] = horaP.split(':').map(Number)
      const inicio = new Date(ano, mes - 1, dia, h, mi, 0)
      if (isNaN(inicio.getTime())) throw new Error('Data/hora inválida.')

      const payload: Record<string, any> = {
        pasta: audForm.pasta.trim(),
        numero_processo: (audForm.numero_processo || audForm.pasta).trim(),
        numero_cnj: (audForm.numero_cnj || audForm.numero_processo || audForm.pasta).trim(),
        vara: audForm.vara.trim(),
        cidade_uf: audForm.cidade_uf.trim(),
        natureza_posicao: audForm.natureza_posicao.trim(),
        cliente_principal: audForm.cliente_principal.trim() || 'Extrafruti',
        parte_contraria: audForm.parte_contraria.trim(),
        audiencia_tipo: audForm.audiencia_tipo.trim() || 'Audiência',
        data_hora_inicio: inicio.toISOString(),
        advogado_responsavel: audForm.advogado_responsavel.trim(),
        tipo_audiencia: audForm.tipo_audiencia.trim() || 'Presencial',
        observacoes: audForm.observacoes.trim(),
      }

      if (dialogAud === 'nova') {
        await pb.collection('audiencias').create(payload)
      } else if (dialogAud) {
        await pb.collection('audiencias').update(dialogAud, payload)
      }
      setDialogAud(null)
      await carregarAudiencias()
      if (onAudienciasAlteradas) onAudienciasAlteradas()
    } catch (err: any) {
      setErroAud(err?.message || 'Erro ao salvar a audiência.')
    } finally {
      setSalvandoAud(false)
    }
  }

  const excluirAudiencia = async (a: any) => {
    const rotulo = a.numero_cnj || a.numero_processo || a.pasta || 'esta audiência'
    if (!window.confirm(`Excluir a audiência de ${rotulo}? Esta ação não pode ser desfeita.`)) {
      return
    }
    try {
      await pb.collection('audiencias').delete(a.id)
      await carregarAudiencias()
      if (onAudienciasAlteradas) onAudienciasAlteradas()
    } catch (err: any) {
      setErroImportacao(err?.message || 'Erro ao excluir a audiência.')
    }
  }

  const fmtDataHora = (dataStr: string) => {
    if (!dataStr) return '—'
    try {
      const d = new Date(dataStr)
      if (isNaN(d.getTime())) return dataStr
      return (
        d.toLocaleDateString('pt-BR') +
        ' às ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      )
    } catch {
      return dataStr
    }
  }

  const audienciasFiltradas = (Array.isArray(audiencias) ? audiencias : []).filter((a) => {
    if (!a) return false
    if (!busca.trim()) return true
    const termo = busca.toLowerCase()
    return (
      String(a.numero_processo || '')
        .toLowerCase()
        .includes(termo) ||
      String(a.numero_cnj || '')
        .toLowerCase()
        .includes(termo) ||
      String(a.pasta || '')
        .toLowerCase()
        .includes(termo) ||
      String(a.parte_contraria || '')
        .toLowerCase()
        .includes(termo) ||
      String(a.audiencia_tipo || '')
        .toLowerCase()
        .includes(termo) ||
      String(a.advogado_responsavel || '')
        .toLowerCase()
        .includes(termo) ||
      String(a.vara || '')
        .toLowerCase()
        .includes(termo)
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
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  onClick={abrirNovaAudiencia}
                  className="h-8 text-xs bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Nova Audiência
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setAbaAtiva('importar')}
                  className="h-8 text-xs"
                >
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  Importar Pauta
                </Button>
              </div>
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
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-gray-600"
                          title="Editar audiência"
                          onClick={() => abrirEditarAudiencia(aud)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-[11px] text-red-600 hover:text-red-700"
                          title="Excluir audiência"
                          onClick={() => setAudParaExcluir(aud)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
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
              <div
                className={`py-8 text-center space-y-4 rounded-xl border p-6 ${
                  resultadoImportacao.falhas && resultadoImportacao.falhas.length > 0
                    ? 'bg-amber-50/40 border-amber-200'
                    : 'bg-emerald-50/40 border-emerald-100'
                }`}
              >
                <div
                  className={`h-12 w-12 rounded-full flex items-center justify-center mx-auto ${
                    resultadoImportacao.falhas && resultadoImportacao.falhas.length > 0
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-[#1B5E20]'
                  }`}
                >
                  {resultadoImportacao.falhas && resultadoImportacao.falhas.length > 0 ? (
                    <AlertCircle className="h-6 w-6" />
                  ) : (
                    <CheckCircle2 className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">
                    {resultadoImportacao.falhas && resultadoImportacao.falhas.length > 0
                      ? 'Pauta de audiências processada com avisos'
                      : 'Pauta de audiências importada com sucesso!'}
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

                {resultadoImportacao.falhas && resultadoImportacao.falhas.length > 0 && (
                  <div className="text-left bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs max-h-36 overflow-y-auto space-y-1">
                    <div className="font-semibold text-amber-900">
                      {resultadoImportacao.falhas.length} audiência(s) com erro ao gravar:
                    </div>
                    {resultadoImportacao.falhas.map((f, i) => (
                      <div key={i} className="text-amber-800 text-[11px]">
                        • <strong>{f.processo}:</strong> {f.motivo}
                      </div>
                    ))}
                  </div>
                )}

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

      {/* Dialog: incluir / editar audiência manualmente */}
      <Dialog open={dialogAud !== null} onOpenChange={(o) => !o && setDialogAud(null)}>
        <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900">
              {dialogAud === 'nova' ? 'Nova Audiência' : 'Editar Audiência'}
            </DialogTitle>
          </DialogHeader>

          {erroAud && (
            <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700">
              {erroAud}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 py-1">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700">Pasta</label>
              <Input
                value={audForm.pasta || ''}
                onChange={(e) => setAudForm((p) => ({ ...p, pasta: e.target.value }))}
                className="h-8 text-xs"
                placeholder="1.0019632"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700">Nº do processo (CNJ)</label>
              <Input
                value={audForm.numero_processo || ''}
                onChange={(e) => setAudForm((p) => ({ ...p, numero_processo: e.target.value }))}
                className="h-8 text-xs"
                placeholder="0001015-86.2026.5.05.0532"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[11px] font-bold text-gray-700">Data e hora *</label>
              <Input
                type="datetime-local"
                value={audForm.data_hora_local || ''}
                onChange={(e) => setAudForm((p) => ({ ...p, data_hora_local: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700">Vara</label>
              <Input
                value={audForm.vara || ''}
                onChange={(e) => setAudForm((p) => ({ ...p, vara: e.target.value }))}
                className="h-8 text-xs"
                placeholder="2 - Vara do Trabalho"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700">Cidade - UF</label>
              <Input
                value={audForm.cidade_uf || ''}
                onChange={(e) => setAudForm((p) => ({ ...p, cidade_uf: e.target.value }))}
                className="h-8 text-xs"
                placeholder="VITÓRIA - ESPÍRITO SANTO"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700">Tipo de ato</label>
              <Input
                value={audForm.audiencia_tipo || ''}
                onChange={(e) => setAudForm((p) => ({ ...p, audiencia_tipo: e.target.value }))}
                className="h-8 text-xs"
                placeholder="Audiência - Instrução e Julgamento"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700">Formato</label>
              <Input
                value={audForm.tipo_audiencia || ''}
                onChange={(e) => setAudForm((p) => ({ ...p, tipo_audiencia: e.target.value }))}
                className="h-8 text-xs"
                placeholder="Virtual / Presencial / Híbrida"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700">Parte contrária</label>
              <Input
                value={audForm.parte_contraria || ''}
                onChange={(e) => setAudForm((p) => ({ ...p, parte_contraria: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700">Advogado responsável</label>
              <Input
                value={audForm.advogado_responsavel || ''}
                onChange={(e) =>
                  setAudForm((p) => ({ ...p, advogado_responsavel: e.target.value }))
                }
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-700">Cliente principal</label>
              <Input
                value={audForm.cliente_principal || ''}
                onChange={(e) => setAudForm((p) => ({ ...p, cliente_principal: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <label className="text-[11px] font-bold text-gray-700">Observações</label>
              <Input
                value={audForm.observacoes || ''}
                onChange={(e) => setAudForm((p) => ({ ...p, observacoes: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setDialogAud(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
              onClick={salvarAudiencia}
              disabled={salvandoAud}
            >
              {salvandoAud ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Salvar Audiência
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação amigável de exclusão da audiência */}
      <AlertDialog
        open={audParaExcluir !== null}
        onOpenChange={(o) => !o && setAudParaExcluir(null)}
      >
        <AlertDialogContent className="bg-white max-w-md rounded-2xl border border-gray-200">
          <AlertDialogHeader>
            <div className="h-11 w-11 rounded-full bg-rose-50 flex items-center justify-center text-rose-700 mb-1">
              <Trash2 className="h-5 w-5" />
            </div>
            <AlertDialogTitle className="text-base font-bold text-gray-900">
              Excluir esta audiência?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-gray-600 leading-relaxed">
              A audiência de{' '}
              <strong className="text-gray-900">
                {audParaExcluir?.numero_cnj ||
                  audParaExcluir?.numero_processo ||
                  audParaExcluir?.pasta}
              </strong>
              {audParaExcluir?.data_hora_inicio ? (
                <>
                  {' '}
                  marcada para{' '}
                  <strong className="text-gray-900">
                    {fmtDataHora(audParaExcluir.data_hora_inicio)}
                  </strong>
                </>
              ) : null}{' '}
              será removida da pauta.
              <br />
              <br />
              <span className="text-rose-700">Esta ação não pode ser desfeita.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-9 text-xs">Manter</AlertDialogCancel>
            <AlertDialogAction
              className="h-9 text-xs bg-rose-600 hover:bg-rose-700 text-white"
              onClick={(ev) => {
                ev.preventDefault()
                if (audParaExcluir) void excluirAudiencia(audParaExcluir)
              }}
            >
              Excluir Audiência
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
