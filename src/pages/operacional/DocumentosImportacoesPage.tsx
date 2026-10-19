import { useEffect, useMemo, useState } from 'react'
import {
  FileSpreadsheet,
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Search,
  Download,
  Trash2,
  X,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Eye,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Fase 6 (prompt-mestre) — Documentos & Importações:
// upload xlsx/csv/pdf/docx → extração no cliente → classificação sugerida →
// mapeamento de colunas → validações (quadratura + duplicidade) → gravação
// em importacoes/financeiro_linhas vinculadas ao arquivo. Biblioteca com
// busca/filtros/versões/download + auditoria. IA desabilitada (Fase 9).

const TIPOS = [
  { key: 'balancete', label: 'Balancete' },
  { key: 'fluxo_caixa', label: 'Fluxo de Caixa' },
  { key: 'planilha_gerencial', label: 'Planilha Gerencial' },
  { key: 'contrato', label: 'Contrato' },
  { key: 'ata', label: 'Ata' },
  { key: 'outro', label: 'Outro' },
]

const EMPRESAS = ['Extrafruti', 'Casafruti', 'FoldBox', 'Grupo consolidado']

const fmtBRL = (v: number) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtData = (s?: string) => {
  if (!s) return '—'
  const d = String(s).slice(0, 10).split('-')
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : s
}

interface LinhaExtraida {
  conta: string
  descricao: string
  debito: number
  credito: number
  data: string
  centro_custo: string
}

// ---------- Extração no cliente ----------
async function extrairLinhas(file: File): Promise<{ linhas: LinhaExtraida[]; texto?: string }> {
  const nome = file.name.toLowerCase()
  if (nome.endsWith('.xlsx') || nome.endsWith('.xls') || nome.endsWith('.csv')) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false })
    const num = (v: any) => {
      if (v === null || v === undefined || v === '') return 0
      const t = String(v)
        .replace(/[R$\s]/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
      const n = parseFloat(t)
      return isNaN(n) ? 0 : n
    }
    const linhas: LinhaExtraida[] = []
    // COR-3 F6: texto bruto (cabeçalho + primeiras linhas) p/ classificação por conteúdo
    const texto = rows
      .slice(0, 30)
      .map((r) => (r || []).join(' '))
      .join('\n')
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      if (!r || !r[1]) continue
      linhas.push({
        conta: String(r[0] ?? ''),
        descricao: String(r[1] ?? ''),
        debito: num(r[2]),
        credito: num(r[3]),
        data: String(r[4] ?? ''),
        centro_custo: String(r[5] ?? ''),
      })
    }
    return { linhas, texto }
  }
  if (nome.endsWith('.pdf')) {
    // PDF: conversão server-side no botão "Analisar com IA" ($documents.toMarkdown
    // preserva tabelas; PDF escaneado sem OCR não é suportado pela plataforma)
    return {
      linhas: [],
      texto: '[PDF — use "Analisar com IA" para extração e análise server-side]',
    }
  }
  if (nome.endsWith('.docx')) {
    return {
      linhas: [],
      texto: '[DOCX — use "Analisar com IA" para extração e análise server-side]',
    }
  }
  return { linhas: [] }
}

// COR-3 F6 — classificação sugerida: conteúdo extraído primeiro (palavras-chave),
// depois nome do arquivo, depois extensão. Sempre editável no wizard (passo 1).
function classificar(nome: string, texto?: string): string {
  const t = (texto || '').toLowerCase()
  if (t) {
    // palavras-chave por tipo — primeira ocorrência decide (ordem de especificidade)
    const tn = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sem acentos p/ casar DEBITOS/DÉBITOS
    if (
      t.includes('balancete') ||
      (tn.includes('saldo anterior') && (tn.includes('debitos') || tn.includes('creditos')))
    )
      return 'balancete'
    if (t.includes('fluxo de caixa') || (tn.includes('entradas') && tn.includes('saidas')))
      return 'fluxo_caixa'
    if (/\bdre\b/.test(t) || t.includes('resultado do exerc') || t.includes('lucro líquido'))
      return 'planilha_gerencial'
    if (t.includes('contratante') || t.includes('cláusula') || t.includes('contratada'))
      return 'contrato'
    if (t.includes('pauta') || t.includes('participantes') || t.includes('action items'))
      return 'ata'
  }
  const n = nome.toLowerCase()
  if (n.includes('balancete')) return 'balancete'
  if (n.includes('fluxo')) return 'fluxo_caixa'
  if (n.includes('dre') || n.includes('gerencial')) return 'planilha_gerencial'
  if (n.includes('contrato')) return 'contrato'
  if (n.includes('ata')) return 'ata'
  // fallback por extensão/conteúdo genérico
  if (nome.toLowerCase().match(/\.(xlsx|xls|csv)$/)) return 'planilha_gerencial'
  if (nome.toLowerCase().match(/\.(pdf|docx)$/)) return 'contrato'
  return 'outro'
}

export default function DocumentosImportacoesPage() {
  const { user } = useAuth()
  // biblioteca
  const [regs, setRegs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [fTipo, setFTipo] = useState('todos')
  const [fEmpresa, setFEmpresa] = useState('todas')
  const [fPeriodo, setFPeriodo] = useState('')
  const [fStatus, setFStatus] = useState('todos')
  const [detalhe, setDetalhe] = useState<any | null>(null)
  const [linhasDetalhe, setLinhasDetalhe] = useState<any[]>([])
  // wizard
  const [wizard, setWizard] = useState(false)
  const [passo, setPasso] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [tipo, setTipo] = useState('balancete')
  const [empresa, setEmpresa] = useState('Extrafruti')
  const [periodo, setPeriodo] = useState('2026-10')
  const [linhas, setLinhas] = useState<LinhaExtraida[]>([])
  const [extraido, setExtraido] = useState(false)
  const [mapeamento, setMapeamento] = useState({
    conta: 0,
    descricao: 1,
    debito: 2,
    credito: 3,
    data: 4,
    centro_custo: 5,
  })
  const [usarMapeamento, setUsarMapeamento] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [concluido, setConcluido] = useState<any | null>(null)
  const [analisando, setAnalisando] = useState(false)
  const [parecerIA, setParecerIA] = useState<any | null>(null)

  const analisarComIA = async (imp: any) => {
    if (!imp?.arquivo_id) {
      setErro('Importação sem arquivo origem para analisar.')
      return
    }
    setAnalisando(true)
    try {
      const r = (await pb.send('/backend/v1/ia/analisar-arquivo', {
        method: 'POST',
        body: JSON.stringify({
          arquivo_id: imp.arquivo_id,
          modulo: 'documentos',
          ref: imp.tipo + ' ' + imp.periodo,
          prompt:
            'Analise este documento financeiro (' +
            imp.tipo +
            ' — ' +
            imp.empresa +
            ', período ' +
            imp.periodo +
            '): pontos principais, números relevantes, inconsistências e riscos.',
        }),
      })) as any
      setParecerIA(r.estrutura)
    } catch (e: any) {
      const msg = e?.response?.data?.erro || e?.message || String(e)
      setErro(msg)
    } finally {
      setAnalisando(false)
    }
  }

  const carregar = async () => {
    setLoading(true)
    try {
      const r = await pb
        .collection('importacoes')
        .getFullList({ sort: '-created', expand: 'arquivo_id' })
      setRegs(r as any[])
      setErro('')
    } catch (e) {
      setErro(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const filtrados = regs.filter((r) => {
    const nomeArq = r?.expand?.arquivo_id?.nome || ''
    if (
      busca &&
      !(nomeArq + r.tipo + (r.empresa || '')).toLowerCase().includes(busca.toLowerCase())
    )
      return false
    if (fTipo !== 'todos' && r.tipo !== fTipo) return false
    if (fEmpresa !== 'todas' && r.empresa !== fEmpresa) return false
    if (fPeriodo && r.periodo !== fPeriodo) return false
    if (fStatus !== 'todos') {
      const ok = r.quadrado ? 'quadrado' : 'divergente'
      if (fStatus !== ok) return false
    }
    return true
  })

  // validações
  const totDeb = useMemo(() => linhas.reduce((a, l) => a + l.debito, 0), [linhas])
  const totCre = useMemo(() => linhas.reduce((a, l) => a + l.credito, 0), [linhas])
  const quadrado = Math.abs(totDeb - totCre) < 0.01
  const duplicidade = regs.some(
    (r) => r.tipo === tipo && r.periodo === periodo && r.empresa === empresa,
  )

  const iniciarWizard = () => {
    setPasso(1)
    setFile(null)
    setLinhas([])
    setExtraido(false)
    setErro('')
    setConcluido(null)
    setUsarMapeamento(false)
    setWizard(true)
  }

  const handleFile = async (f: File) => {
    setFile(f)
    setExtraido(false)
    setLinhas([])
    setErro('')
    try {
      const { linhas: ls, texto } = await extrairLinhas(f)
      // COR-3 F6: classificação sugerida usa CONTEÚDO extraído (palavras-chave)
      // + nome do arquivo como fallback — sempre editável no wizard
      setTipo(
        classificar(
          f.name,
          texto ||
            ls
              .map((l) => l.descricao)
              .join(' ')
              .slice(0, 4000),
        ),
      )
      if (ls.length) {
        setLinhas(ls)
        setExtraido(true)
      } else {
        setErro(
          'Arquivo recebido, mas sem linhas extraídas no cliente (PDF/DOCX: extração serverless na Fase 9). Você pode registrar o arquivo e importar as linhas depois.',
        )
      }
    } catch (e) {
      setErro('Falha ao extrair: ' + String(e))
    }
  }

  const aplicarMapeamento = () => {
    if (!file) return // re-extrai com colunas trocadas (xlsx: re-leitura com índices custom)
    ;(async () => {
      const nome = file.name.toLowerCase()
      if (nome.endsWith('.xlsx') || nome.endsWith('.xls') || nome.endsWith('.csv')) {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false })
        const num = (v: any) => {
          if (v === null || v === undefined || v === '') return 0
          const t = String(v)
            .replace(/[R$\s]/g, '')
            .replace(/\./g, '')
            .replace(',', '.')
          const n = parseFloat(t)
          return isNaN(n) ? 0 : n
        }
        const m = mapeamento
        const ls: LinhaExtraida[] = []
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i]
          if (!r || !r[m.descricao]) continue
          ls.push({
            conta: String(r[m.conta] ?? ''),
            descricao: String(r[m.descricao] ?? ''),
            debito: num(r[m.debito]),
            credito: num(r[m.credito]),
            data: String(r[m.data] ?? ''),
            centro_custo: String(r[m.centro_custo] ?? ''),
          })
        }
        setLinhas(ls)
        setExtraido(true)
        setUsarMapeamento(false)
      }
    })()
  }

  const gravar = async () => {
    if (!file) return
    setProcessando(true)
    setErro('')
    try {
      // versão automática: N-ésima importação do mesmo tipo/empresa/período
      let versao = 1
      try {
        const mesmas = await pb.collection('importacoes').getFullList({
          filter: `tipo="${tipo}" && empresa="${empresa}" && periodo="${periodo}"`,
        })
        versao = (mesmas.items?.length || 0) + 1
      } catch (_e) {
        versao = 1
      }
      // 1. upload do arquivo
      const fd = new FormData()
      fd.append('nome', file.name)
      fd.append('tipo', tipo)
      fd.append('tamanho', String(file.size))
      fd.append('status', 'processado')
      fd.append('criado_por', user?.email || '')
      fd.append('versao', String(versao))
      fd.append('arquivo', file)
      const arq = await pb.collection('arquivos_importados').create(fd)

      // 2. cabeçalho da importação
      const imp = await pb.collection('importacoes').create({
        arquivo_id: arq.id,
        tipo,
        empresa,
        periodo,
        total_linhas: linhas.length,
        total_debito: totDeb,
        total_credito: totCre,
        quadrado,
        mapeamento: JSON.stringify(mapeamento),
        criado_por: user?.email || '',
      })

      // 3. linhas (batch)
      for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i]
        await pb.collection('financeiro_linhas').create({
          importacao_id: imp.id,
          conta: l.conta,
          descricao: l.descricao,
          debito: l.debito,
          credito: l.credito,
          data: l.data,
          centro_custo: l.centro_custo,
          ordem: i + 1,
        })
      }

      // 4. auditoria
      try {
        await pb.send('/backend/v1/auditoria', {
          method: 'POST',
          body: JSON.stringify({ acao: 'importar_documento' }),
        })
      } catch (_) {
        /* best-effort */
      }

      setConcluido({ imp, arq })
      setPasso(4)
      await carregar()
    } catch (e) {
      setErro(String(e))
    } finally {
      setProcessando(false)
    }
  }

  const abrirDetalhe = async (imp: any) => {
    setDetalhe(imp)
    try {
      const ls = await pb.collection('financeiro_linhas').getFullList({
        filter: `importacao_id="${imp.id}"`,
        sort: 'ordem',
      })
      setLinhasDetalhe(ls as any[])
    } catch (_) {
      setLinhasDetalhe([])
    }
  }

  const exportarDetalhe = () => {
    const header = ['Conta', 'Descrição', 'Débito', 'Crédito', 'Data', 'Centro de custo']
    const rows = linhasDetalhe.map((l) => [
      l.conta,
      l.descricao,
      l.debito,
      l.credito,
      l.data,
      l.centro_custo,
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((x) => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(';'))
      .join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'importacao-' + detalhe?.tipo + '-' + detalhe?.periodo + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const baixarArquivo = (imp: any) => {
    const f = imp?.expand?.arquivo_id?.arquivo
    if (f) {
      const url = pb.files.getURL(imp.expand.arquivo_id, f)
      window.open(url, '_blank')
    }
  }

  const excluir = async (imp: any) => {
    try {
      await pb.collection('importacoes').delete(imp.id)
      if (imp.arquivo_id && typeof imp.arquivo_id === 'string') {
        try {
          await pb.collection('arquivos_importados').delete(imp.arquivo_id)
        } catch (_) {
          /* segue */
        }
      }
      await carregar()
    } catch (e) {
      setErro(String(e))
    }
  }

  const iconeTipo = (t: string) => (t === 'contrato' || t === 'ata' ? FileText : FileSpreadsheet)

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight">
            Documentos & Importações
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Upload, extração, mapeamento e gravação no Financeiro — com quadratura e auditoria
          </p>
        </div>
        <Button onClick={iniciarWizard} className="h-10 bg-[#1B5E20] hover:bg-[#0F3D13] text-white">
          <Upload className="h-4 w-4 mr-1.5" /> Nova importação
        </Button>
      </div>

      {erro && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
          {erro}
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar..."
            className="h-9 pl-9 text-xs bg-gray-50"
          />
        </div>
        <Select value={fTipo} onValueChange={setFTipo}>
          <SelectTrigger className="h-9 w-44 text-xs bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            {TIPOS.map((t) => (
              <SelectItem key={t.key} value={t.key}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fEmpresa} onValueChange={setFEmpresa}>
          <SelectTrigger className="h-9 w-44 text-xs bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as empresas</SelectItem>
            {EMPRESAS.map((e) => (
              <SelectItem key={e} value={e}>
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={fPeriodo}
          onChange={(e) => setFPeriodo(e.target.value)}
          placeholder="2026-10"
          className="h-9 w-28 text-xs bg-gray-50"
        />
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger className="h-9 w-36 text-xs bg-gray-50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="quadrado">Quadrado</SelectItem>
            <SelectItem value="divergente">Divergente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Biblioteca */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-[#1B5E20]" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-50/80 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Arquivo
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Tipo
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Empresa
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Período
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Linhas
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Σ Débito
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Σ Crédito
                  </th>
                  <th className="px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-gray-500">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((r) => {
                  const Icon = iconeTipo(r.tipo)
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[13px] font-semibold text-gray-900 truncate max-w-[220px]">
                              {r?.expand?.arquivo_id?.nome || '—'}
                            </div>
                            <div className="text-[10px] text-gray-400">
                              {fmtData(r.created)} · {r.criado_por || '—'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700">
                        {TIPOS.find((t) => t.key === r.tipo)?.label || r.tipo}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700">{r.empresa || '—'}</td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700 tabular-nums">
                        {r.periodo || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] text-gray-700 tabular-nums">
                        {r.total_linhas}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] tabular-nums text-gray-700">
                        {fmtBRL(r.total_debito)}
                      </td>
                      <td className="px-3 py-2.5 text-[12px] tabular-nums text-gray-700">
                        {fmtBRL(r.total_credito)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={cn(
                            'text-[10px] font-bold px-2 py-0.5 rounded-full border',
                            r.quadrado
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200',
                          )}
                        >
                          {r.quadrado ? 'Quadrado' : 'Divergente'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => abrirDetalhe(r)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                            title="Ver linhas"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => baixarArquivo(r)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                            title="Baixar arquivo origem"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirDetalhe(r)}
                            title="Ver detalhes e linhas importadas"
                            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>{' '}
                          <button
                            type="button"
                            onClick={() => excluir(r)}
                            className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50"
                            title="Excluir importação"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-400">
                      Nenhuma importação. Use "Nova importação".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Wizard */}
      <Dialog open={wizard} onOpenChange={setWizard}>
        <DialogContent className="bg-white max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Nova importação — passo {passo}/4</span>
              <button
                onClick={() => setWizard(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>

          {/* Passo 1: arquivo */}
          {passo === 1 && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center bg-gray-50/50 hover:bg-gray-50 cursor-pointer transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const f = e.dataTransfer.files?.[0]
                  if (f) handleFile(f)
                }}
                onClick={() => document.getElementById('file-imp')?.click()}
              >
                <Upload className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-[13px] font-semibold text-gray-700">
                  {file ? file.name : 'Arraste o arquivo ou clique para selecionar'}
                </p>
                <p className="text-[11px] text-gray-400 mt-1">
                  XLSX · CSV · PDF · DOCX (até 25 MB)
                </p>
                <input
                  id="file-imp"
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf,.docx"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                  }}
                />
              </div>
              {file && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Tipo (sugerido)
                    </Label>
                    <Select value={tipo} onValueChange={setTipo}>
                      <SelectTrigger className="h-10 bg-gray-50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIPOS.map((t) => (
                          <SelectItem key={t.key} value={t.key}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Empresa
                    </Label>
                    <Select value={empresa} onValueChange={setEmpresa}>
                      <SelectTrigger className="h-10 bg-gray-50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EMPRESAS.map((e) => (
                          <SelectItem key={e} value={e}>
                            {e}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Período (YYYY-MM)
                    </Label>
                    <Input
                      value={periodo}
                      onChange={(e) => setPeriodo(e.target.value)}
                      className="h-10 bg-gray-50"
                    />
                  </div>
                </div>
              )}
              {extraido && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-[12px] text-emerald-700 font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" /> {linhas.length} linhas extraídas no cliente.
                </div>
              )}
              {erro && !extraido && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
                  {erro}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setWizard(false)} className="h-9">
                  Cancelar
                </Button>
                <Button
                  onClick={() => setPasso(2)}
                  disabled={!file}
                  className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                >
                  Continuar <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* Passo 2: mapeamento */}
          {passo === 2 && (
            <div className="space-y-4">
              <p className="text-[13px] text-gray-600">
                Colunas detectadas na ordem:{' '}
                <strong>
                  1=conta, 2=descrição, 3=débito, 4=crédito, 5=data, 6=centro de custo
                </strong>
                . Ajuste se seu arquivo usa outra ordem.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(['conta', 'descricao', 'debito', 'credito', 'data', 'centro_custo'] as const).map(
                  (campo, idx) => (
                    <div key={campo} className="grid gap-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        {campo.replace('_', ' ')}
                      </Label>
                      <Select
                        value={String(mapeamento[campo])}
                        onValueChange={(v) =>
                          setMapeamento({ ...mapeamento, [campo]: parseInt(v, 10) })
                        }
                      >
                        <SelectTrigger className="h-10 bg-gray-50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                            <SelectItem key={i} value={String(i)}>
                              Coluna {i + 1}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ),
                )}
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <Switch checked={usarMapeamento} onCheckedChange={setUsarMapeamento} />
                <span className="text-[12px] text-gray-700">
                  Reaplicar mapeamento e re-extrair as linhas
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setPasso(1)} className="h-9">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <div className="flex gap-2">
                  {usarMapeamento && (
                    <Button
                      onClick={aplicarMapeamento}
                      className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                    >
                      Re-extrair
                    </Button>
                  )}
                  <Button
                    onClick={() => setPasso(3)}
                    className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                  >
                    Validar <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Passo 3: validação */}
          {passo === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={cn(
                    'p-4 rounded-xl border',
                    quadrado ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200',
                  )}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Quadratura (Σ D = Σ C)
                  </div>
                  <div className="text-sm font-bold mt-1 flex items-center gap-1.5">
                    {quadrado ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-red-600" />
                    )}
                    <span className={quadrado ? 'text-emerald-700' : 'text-red-700'}>
                      {quadrado ? 'Quadrado' : 'Divergente'}
                    </span>
                  </div>
                  <div className="text-[12px] text-gray-600 tabular-nums mt-1">
                    Σ D {fmtBRL(totDeb)} · Σ C {fmtBRL(totCre)}
                  </div>
                </div>
                <div
                  className={cn(
                    'p-4 rounded-xl border',
                    duplicidade
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-emerald-50 border-emerald-200',
                  )}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                    Duplicidade (tipo+período+empresa)
                  </div>
                  <div className="text-sm font-bold mt-1 flex items-center gap-1.5">
                    {duplicidade ? (
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    )}
                    <span className={duplicidade ? 'text-amber-700' : 'text-emerald-700'}>
                      {duplicidade ? 'Já existe importação' : 'Sem duplicidade'}
                    </span>
                  </div>
                  <div className="text-[12px] text-gray-600 mt-1">
                    {tipo} · {periodo} · {empresa}
                  </div>
                </div>
              </div>
              <div className="border border-gray-100 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <table className="w-full text-right text-[11px]">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-gray-500">
                        Conta
                      </th>
                      <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-gray-500">
                        Descrição
                      </th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-gray-500">
                        Débito
                      </th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-gray-500">
                        Crédito
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.slice(0, 50).map((l, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="px-3 py-1.5 text-left text-gray-600">{l.conta}</td>
                        <td className="px-3 py-1.5 text-left text-gray-800">{l.descricao}</td>
                        <td className="px-3 py-1.5 tabular-nums text-gray-700">
                          {fmtBRL(l.debito)}
                        </td>
                        <td className="px-3 py-1.5 tabular-nums text-gray-700">
                          {fmtBRL(l.credito)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between gap-2">
                <Button variant="outline" onClick={() => setPasso(2)} className="h-9">
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button
                  onClick={gravar}
                  disabled={processando || linhas.length === 0}
                  className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
                >
                  {processando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Gravar {linhas.length} linhas no Financeiro
                </Button>
              </div>
            </div>
          )}

          {/* Passo 4: concluído */}
          {passo === 4 && concluido && (
            <div className="space-y-4 text-center py-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
              <div>
                <div className="text-lg font-bold text-gray-900">Importação concluída</div>
                <p className="text-[13px] text-gray-600 mt-1">
                  {concluido.imp.total_linhas} linhas gravadas e vinculadas ao arquivo origem — já
                  visíveis no Financeiro.
                </p>
                <p className="text-[12px] text-gray-500 mt-1">
                  {concluido.imp.quadrado ? '✓ Quadratura fechada' : '⚠ Divergência registrada'} ·{' '}
                  {concluido.imp.empresa} · {concluido.imp.periodo}
                </p>
              </div>
              <Button
                onClick={() => setWizard(false)}
                className="h-10 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
              >
                Concluir
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Detalhe da importação */}
      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="bg-white max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>
                Importação — {TIPOS.find((t) => t.key === detalhe?.tipo)?.label} ·{' '}
                {detalhe?.periodo}
              </span>
              <button
                onClick={() => setDetalhe(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 mb-2">
            <Button variant="outline" size="sm" onClick={exportarDetalhe} className="h-8">
              <Download className="h-3.5 w-3.5 mr-1" /> CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => baixarArquivo(detalhe)}
              className="h-8"
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Arquivo origem
            </Button>
            <Button
              size="sm"
              onClick={() => analisarComIA(detalhe)}
              disabled={analisando}
              className="h-8"
            >
              {analisando ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1" />
              )}
              Analisar com IA
            </Button>
          </div>
          <div className="border border-gray-100 rounded-lg overflow-hidden max-h-[420px] overflow-y-auto">
            <table className="w-full text-right text-[12px]">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-gray-500">
                    Conta
                  </th>
                  <th className="px-3 py-2 text-left font-bold uppercase tracking-wider text-gray-500">
                    Descrição
                  </th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-gray-500">
                    Débito
                  </th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-gray-500">
                    Crédito
                  </th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-gray-500">
                    Data
                  </th>
                  <th className="px-3 py-2 font-bold uppercase tracking-wider text-gray-500">CC</th>
                </tr>
              </thead>
              <tbody>
                {linhasDetalhe.map((l) => (
                  <tr key={l.id} className="border-b border-gray-50">
                    <td className="px-3 py-1.5 text-left text-gray-600">{l.conta}</td>
                    <td className="px-3 py-1.5 text-left text-gray-800">{l.descricao}</td>
                    <td className="px-3 py-1.5 tabular-nums text-gray-700">{fmtBRL(l.debito)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-gray-700">{fmtBRL(l.credito)}</td>
                    <td className="px-3 py-1.5 tabular-nums text-gray-600">{fmtData(l.data)}</td>
                    <td className="px-3 py-1.5 text-gray-600">{l.centro_custo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Parecer IA (análise do arquivo) */}
      <Dialog open={!!parecerIA} onOpenChange={(o) => !o && setParecerIA(null)}>
        <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#1B5E20]" /> Análise IA do documento
              </span>
              <button
                onClick={() => setParecerIA(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          {parecerIA && (
            <div className="space-y-3">
              {typeof parecerIA.score_saude === 'number' && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div
                    className={cn(
                      'h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg',
                      parecerIA.score_saude >= 7
                        ? 'bg-emerald-600'
                        : parecerIA.score_saude >= 5
                          ? 'bg-amber-500'
                          : 'bg-red-600',
                    )}
                  >
                    {parecerIA.score_saude}
                  </div>
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                      Score de saúde
                    </div>
                    <div className="text-[13px] text-gray-700">0-10</div>
                  </div>
                </div>
              )}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                  Sumário executivo
                </div>
                <p className="text-[13px] text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {parecerIA.sumario_executivo}
                </p>
              </div>
              {parecerIA.principais_achados?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Principais achados
                  </div>
                  <ul className="space-y-1">
                    {parecerIA.principais_achados.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-gray-700">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parecerIA.riscos_alertas?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Riscos e alertas
                  </div>
                  <ul className="space-y-1">
                    {parecerIA.riscos_alertas.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-red-700">
                        • {a}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parecerIA.recomendacoes?.length > 0 && (
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">
                    Recomendações priorizadas
                  </div>
                  <ol className="space-y-1">
                    {parecerIA.recomendacoes.map((a: string, i: number) => (
                      <li key={i} className="text-[12px] text-gray-700">
                        {i + 1}. {a}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <p className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
                {parecerIA.disclaimer || 'Análise assistida — não substitui contador/auditor.'}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
