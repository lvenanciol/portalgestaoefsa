import { useEffect, useMemo, useState } from 'react'
import { Loader2, X, Check, Plus } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/hooks/use-auth'
import { useApp } from '@/context/AppContext'
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

export const TIPOS_PARCEIRO = ['Parceiro', 'Contato', 'Fornecedor', 'Cliente']
const EMPRESAS_PADRAO = ['Extrafruti', 'Casafruti', 'FoldBox']

export const soDigitos = (v: string) => String(v || '').replace(/\D/g, '')

export const mascaraDocumento = (v: string): string => {
  const d = soDigitos(v).slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export const mascaraTelefone = (v: string): string => {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 10) {
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  }
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

export interface ParceiroCadastroDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editando?: any | null
  onSalvo?: (parceiroCriadoOuAtualizado: any) => void
  /** Se fornecido, pré-seleciona empresa padrão */
  empresaPadrao?: string
}

export function ParceiroCadastroDialog({
  open,
  onOpenChange,
  editando,
  onSalvo,
  empresaPadrao,
}: ParceiroCadastroDialogProps) {
  const { user } = useAuth()
  const { empresas: empresasApp } = useApp()
  const [form, setForm] = useState<any>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [logos, setLogos] = useState<any[]>([])

  // centros de resultado (Sankhya)
  const [centros, setCentros] = useState<any[]>([])
  const [centrosErro, setCentrosErro] = useState('')
  const [centrosCarregados, setCentrosCarregados] = useState(false)
  const [dropAberto, setDropAberto] = useState(false)

  // Carrega logomarcas para ícones de empresas
  useEffect(() => {
    pb.collection('logomarcas')
      .getFullList()
      .then((l) => setLogos(l as any[]))
      .catch(() => setLogos([]))
  }, [])

  // Inicializa form ao abrir
  useEffect(() => {
    if (!open) return
    setErro('')
    if (editando) {
      let listaEmpresasP: string[] = []
      if (editando.empresas) {
        if (Array.isArray(editando.empresas)) {
          listaEmpresasP = editando.empresas
        } else {
          try {
            const parsed = JSON.parse(editando.empresas)
            if (Array.isArray(parsed)) listaEmpresasP = parsed
          } catch {
            /* noop */
          }
        }
      }
      if (listaEmpresasP.length === 0 && editando.empresa) {
        listaEmpresasP = [editando.empresa]
      }
      const primEmp = listaEmpresasP[0] || editando.empresa || 'Extrafruti'
      setForm({
        ...editando,
        empresas: listaEmpresasP.length > 0 ? listaEmpresasP : [primEmp],
        empresa: primEmp,
      })
    } else {
      const empIni = empresaPadrao && empresaPadrao !== 'todas' ? empresaPadrao : 'Extrafruti'
      setForm({
        nome: '',
        tipo: 'Parceiro',
        empresa: empIni,
        empresas: [empIni],
        documento: '',
        email: '',
        whatsapp: '',
        telefone: '',
        cargo: '',
        centro_resultado: '',
        centro_resultado_codigo: '',
        observacao: '',
        ativo: true,
      })
    }
  }, [open, editando, empresaPadrao])

  const listaEmpresas = useMemo(() => {
    if (empresasApp && empresasApp.length > 0) {
      return empresasApp.map((e) => e.nome)
    }
    return EMPRESAS_PADRAO
  }, [empresasApp])

  const obterIconeEmpresa = (nomeEmpresa: string) => {
    if (!nomeEmpresa) return null
    const norm = (s: any) =>
      String(s || '')
        .trim()
        .toLowerCase()
    const logoRec = logos.find((l) => norm(l.empresa) === norm(nomeEmpresa))
    const empRec = empresasApp.find((e) => norm(e.nome) === norm(nomeEmpresa))
    const cor = logoRec?.cor || empRec?.cor || '#1B5E20'
    const sigla =
      logoRec?.sigla ||
      (empRec ? empRec.nome.slice(0, 2).toUpperCase() : nomeEmpresa.slice(0, 2).toUpperCase())

    const urlImagem = (rec: any, campo: string) => {
      if (!rec || !rec[campo]) return ''
      return pb.files.getURL(rec, rec[campo])
    }
    const urlEmb = urlImagem(logoRec, 'emblema')
    const urlLogo = urlImagem(logoRec, 'logo')

    if (urlEmb) {
      return (
        <img
          src={urlEmb}
          alt={nomeEmpresa}
          className="h-4 w-4 object-contain rounded-xs shrink-0"
        />
      )
    }
    if (urlLogo) {
      return (
        <img
          src={urlLogo}
          alt={nomeEmpresa}
          className="h-4 w-4 object-contain rounded-xs shrink-0"
        />
      )
    }
    return (
      <span
        className="h-4 w-4 rounded-xs text-[8px] font-bold text-white flex items-center justify-center shrink-0"
        style={{ backgroundColor: cor }}
      >
        {sigla}
      </span>
    )
  }

  const buscarCentros = async (q: string) => {
    setCentrosErro('')
    try {
      const r = (await pb.send(
        '/backend/v1/sankhya/centros-resultado?busca=' + encodeURIComponent(q),
        { method: 'GET' },
      )) as any
      setCentros(r.itens || [])
      setCentrosCarregados(true)
      if (!(r.itens || []).length) {
        setCentrosErro(
          r.erro || (r.fonte === 'cache' ? 'Cache vazio — tente novamente em instantes.' : ''),
        )
      }
    } catch (e: any) {
      setCentros([])
      setCentrosCarregados(true)
      setCentrosErro(
        String(e?.response?.message || e?.message || e).slice(0, 200) ||
          'Falha ao consultar o Sankhya.',
      )
    }
  }

  const centrosFiltrados = useMemo(() => {
    const q = (form.centro_resultado || '').trim().toLowerCase()
    if (!q) return centros
    return centros.filter(
      (c) =>
        (c.descricao || '').toLowerCase().includes(q) ||
        String(c.codigo || '')
          .toLowerCase()
          .includes(q),
    )
  }, [centros, form.centro_resultado])

  const salvar = async () => {
    if (!form.nome || !form.nome.trim()) {
      setErro('Por favor, informe o nome do parceiro/contato.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      const empresasSalvas =
        Array.isArray(form.empresas) && form.empresas.length > 0
          ? form.empresas
          : [form.empresa || 'Extrafruti']

      const dados: any = {
        nome: form.nome.trim(),
        tipo: form.tipo || 'Parceiro',
        empresa: empresasSalvas[0] || 'Extrafruti',
        empresas: JSON.stringify(empresasSalvas),
        documento: form.documento || '',
        email: form.email || '',
        whatsapp: form.whatsapp || '',
        telefone: form.telefone || '',
        cargo: form.cargo || '',
        centro_resultado: form.centro_resultado || '',
        centro_resultado_codigo: form.centro_resultado_codigo || '',
        observacao: form.observacao || '',
        ativo: form.ativo !== false,
      }

      let res: any
      if (editando) {
        res = await pb.collection('parceiros').update(editando.id, dados)
      } else {
        dados.criado_por = user?.email || ''
        res = await pb.collection('parceiros').create(dados)
      }

      onOpenChange(false)
      if (onSalvo) {
        onSalvo(res)
      }
    } catch (e: any) {
      console.error('Erro ao salvar parceiro:', e)
      setErro(String(e?.message || e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editando ? 'Editar' : 'Novo'} parceiro/contato</DialogTitle>
        </DialogHeader>

        {erro && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-700">
            {erro}
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Nome *
              </Label>
              <Input
                value={form.nome || ''}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                className="h-10 bg-gray-50"
                placeholder="Ex.: João da Silva"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Tipo
              </Label>
              <Select
                value={form.tipo || 'Parceiro'}
                onValueChange={(v) => setForm({ ...form, tipo: v })}
              >
                <SelectTrigger className="h-10 bg-gray-50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_PARCEIRO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Seleção de MAIS DE UMA empresa com ícone ao lado do nome */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Empresas do Parceiro * (múltipla escolha)
                </Label>
                <span className="text-[11px] text-[#1B5E20] font-semibold">
                  {(form.empresas || []).length} selecionada(s)
                </span>
              </div>
              <Select
                value="placeholder"
                onValueChange={(val) => {
                  if (val === 'placeholder') return
                  setForm((f: any) => {
                    const cur = Array.isArray(f.empresas) ? f.empresas : [f.empresa || 'Extrafruti']
                    const exists = cur.includes(val)
                    if (exists && cur.length === 1) return f
                    const novas = exists ? cur.filter((x: string) => x !== val) : [...cur, val]
                    return {
                      ...f,
                      empresas: novas,
                      empresa: novas[0] || val,
                    }
                  })
                }}
              >
                <SelectTrigger className="h-10 bg-gray-50">
                  <SelectValue placeholder="Adicionar/remover empresa..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="placeholder" disabled>
                    Selecione uma empresa para alternar vínculo
                  </SelectItem>
                  {listaEmpresas.map((e) => {
                    const sel = (form.empresas || []).includes(e)
                    return (
                      <SelectItem key={e} value={e}>
                        <div className="flex items-center justify-between gap-3 w-full">
                          <div className="flex items-center gap-2">
                            {obterIconeEmpresa(e)}
                            <span
                              className={cn(
                                'text-xs',
                                sel ? 'font-bold text-[#1B5E20]' : 'text-gray-800',
                              )}
                            >
                              {e}
                            </span>
                          </div>
                          {sel && <Check className="h-3.5 w-3.5 text-[#1B5E20]" />}
                        </div>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>

              {/* Badges/Tags clicáveis com os ícones das empresas */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {listaEmpresas.map((e) => {
                  const sel = (form.empresas || []).includes(e)
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => {
                        setForm((f: any) => {
                          const cur = Array.isArray(f.empresas)
                            ? f.empresas
                            : [f.empresa || 'Extrafruti']
                          const exists = cur.includes(e)
                          if (exists && cur.length === 1) return f
                          const novas = exists ? cur.filter((x: string) => x !== e) : [...cur, e]
                          return {
                            ...f,
                            empresas: novas,
                            empresa: novas[0] || e,
                          }
                        })
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-all cursor-pointer',
                        sel
                          ? 'bg-emerald-50 text-[#1B5E20] border-emerald-300 shadow-2xs'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-800',
                      )}
                    >
                      {obterIconeEmpresa(e)}
                      <span>{e}</span>
                      {sel ? (
                        <Check className="h-3 w-3 ml-0.5 text-[#1B5E20]" />
                      ) : (
                        <Plus className="h-3 w-3 ml-0.5 text-gray-400" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                CPF/CNPJ
              </Label>
              <Input
                value={form.documento || ''}
                onChange={(e) => setForm({ ...form, documento: mascaraDocumento(e.target.value) })}
                className="h-10 bg-gray-50"
                placeholder="000.000.000-00 ou 00.000.000/0000-00"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                E-mail
              </Label>
              <Input
                value={form.email || ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-10 bg-gray-50"
                placeholder="email@empresa.com.br"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                WhatsApp / Telefone
              </Label>
              <Input
                value={form.whatsapp || form.telefone || ''}
                onChange={(e) => {
                  const m = mascaraTelefone(e.target.value)
                  setForm({ ...form, whatsapp: m, telefone: m })
                }}
                className="h-10 bg-gray-50"
                placeholder="(27) 99999-9999"
                inputMode="tel"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Cargo
              </Label>
              <Input
                value={form.cargo || ''}
                onChange={(e) => setForm({ ...form, cargo: e.target.value })}
                className="h-10 bg-gray-50"
              />
            </div>
          </div>

          <div
            className="grid gap-1.5 relative"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAberto(false)
            }}
          >
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Centro de resultado (Sankhya)
            </Label>
            <div className="flex items-center gap-2">
              <Input
                value={form.centro_resultado || ''}
                onChange={(e) => {
                  setForm({
                    ...form,
                    centro_resultado: e.target.value,
                    centro_resultado_codigo: '',
                  })
                  setDropAberto(true)
                  if (!centrosCarregados) buscarCentros('')
                }}
                onFocus={() => {
                  setDropAberto(true)
                  if (!centrosCarregados) buscarCentros('')
                }}
                placeholder="digite para filtrar os centros..."
                className="h-10 bg-gray-50 flex-1"
              />
              {form.centro_resultado && (
                <button
                  type="button"
                  onClick={() =>
                    setForm({ ...form, centro_resultado: '', centro_resultado_codigo: '' })
                  }
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {centrosCarregados && dropAberto && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {centrosFiltrados.length > 0 ? (
                  centrosFiltrados.map((c) => (
                    <button
                      key={c.codigo}
                      type="button"
                      onClick={() => {
                        setForm({
                          ...form,
                          centro_resultado: c.descricao,
                          centro_resultado_codigo: c.codigo,
                        })
                        setDropAberto(false)
                      }}
                      className="block w-full text-left px-3 py-2 rounded-lg hover:bg-emerald-50 text-[12px]"
                    >
                      <span className="font-semibold text-gray-800">{c.descricao}</span>
                      <span className="ml-2 text-gray-400 tabular-nums">{c.codigo}</span>
                    </button>
                  ))
                ) : (
                  <p className="text-center text-[12px] text-gray-400 py-4">
                    {centrosErro || 'Nenhum centro encontrado.'}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Observação
            </Label>
            <Textarea
              value={form.observacao || ''}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
              rows={2}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
            <span className="text-[12px] text-gray-700">Ativo</span>
            <Switch
              checked={!!form.ativo}
              onCheckedChange={(v) => setForm({ ...form, ativo: v })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9">
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={salvando || !form.nome}
            className="h-9 bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
          >
            {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
