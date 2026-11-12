import React, { useState, useEffect } from 'react'
import {
  FileText,
  Calendar,
  Building2,
  DollarSign,
  ShieldCheck,
  AlertCircle,
  FileEdit,
  Save,
  Loader2,
  User,
  Scale,
  Briefcase,
  Layers,
  ChevronDown,
  Check,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { EmpresaIcon } from '@/components/common/EmpresaIcon'
import pb from '@/lib/pocketbase/client'
import { formatarBRL } from './documentos-moeda-utils'

interface DocumentoDetalheCamposProps {
  documento: any
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'convencoes' | 'seguros' | 'juridicos'
  colecaoNome: string
  empresas: { id: string; nome: string }[]
  onAtualizado?: () => void
}

export function DocumentoDetalheCampos({
  documento,
  tipoAba,
  colecaoNome,
  empresas,
  onAtualizado,
}: DocumentoDetalheCamposProps) {
  const [editando, setEditando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [empresaPopoverAberto, setEmpresaPopoverAberto] = useState(false)
  const [form, setForm] = useState<Record<string, any>>({})

  useEffect(() => {
    setForm({ ...(documento || {}) })
    setEditando(false)
  }, [documento])

  const setCampo = (campo: string, valor: any) => {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  const handleSalvar = async () => {
    if (!documento?.id) return
    setSalvando(true)
    try {
      // Prepara payload de atualização com apenas campos editáveis da respectiva aba
      const payload: Record<string, any> = {}
      if (tipoAba === 'alvaras') {
        payload.numero = form.numero || ''
        payload.tipo = form.tipo || ''
        payload.orgao_emissor = form.orgao_emissor || ''
        payload.municipio = form.municipio || ''
        payload.empresa = form.empresa || ''
        payload.validade = form.validade || null
        payload.status = form.status || 'regular'
        payload.observacoes = form.observacoes || ''
      } else if (tipoAba === 'atas') {
        payload.titulo = form.titulo || ''
        payload.tipo_ata = form.tipo_ata || 'AGE'
        payload.empresa = form.empresa || ''
        payload.data = form.data || null
        payload.pauta = form.pauta || ''
        payload.deliberacoes = form.deliberacoes || ''
        payload.mesa_diretora = form.mesa_diretora || ''
        payload.participantes = form.participantes || ''
        payload.resumo = form.resumo || ''
        payload.decisoes = form.decisoes || ''
      } else if (tipoAba === 'juridicos') {
        payload.titulo = form.titulo || ''
        payload.numero_processo = form.numero_processo || ''
        payload.numero_cnj = form.numero_cnj || ''
        payload.empresa = form.empresa || form.cliente_principal || ''
        payload.cliente_principal = form.cliente_principal || form.empresa || ''
        payload.vara_comarca = form.vara_comarca || ''
        payload.orgao = form.orgao || form.orgao_tribunal || ''
        payload.orgao_tribunal = form.orgao_tribunal || form.orgao || ''
        payload.natureza = form.natureza || ''
        payload.assunto_tipo = form.assunto_tipo || ''
        payload.autor = form.autor || ''
        payload.reu = form.reu || ''
        payload.contrario_principal = form.contrario_principal || ''
        payload.advogado = form.advogado || form.responsavel_principal || ''
        payload.responsavel_principal = form.responsavel_principal || form.advogado || ''
        payload.status = form.status || 'ativo'
        payload.probabilidade = form.probabilidade || form.risco || ''
        payload.risco = form.risco || ''
        payload.valor_base = form.valor_base !== undefined ? Number(form.valor_base) : null
        payload.valor_corrigido =
          form.valor_corrigido !== undefined ? Number(form.valor_corrigido) : null
        payload.juros = form.juros !== undefined ? Number(form.juros) : null
        payload.multa = form.multa !== undefined ? Number(form.multa) : null
        payload.valor_atualizado =
          form.valor_atualizado !== undefined ? Number(form.valor_atualizado) : null
        payload.valor_causa = form.valor_causa !== undefined ? Number(form.valor_causa) : null
      } else if (tipoAba === 'convencoes') {
        // Convenções: só os campos da própria coleção. Antes caía no ramo de
        // contratos e gravava título/parte/valor_mensal em convencoes (erro 400).
        payload.titulo = form.titulo || ''
        payload.empresa = form.empresa || ''
        payload.entidade_sindical = form.entidade_sindical || ''
        payload.parte_patronal = form.parte_patronal || ''
        payload.vigencia_inicio = form.vigencia_inicio || null
        payload.vigencia_fim = form.vigencia_fim || null
        payload.data_base = form.data_base || ''
        payload.reajuste_percentual =
          form.reajuste_percentual !== undefined && form.reajuste_percentual !== ''
            ? Number(form.reajuste_percentual)
            : null
        payload.piso_salarial =
          form.piso_salarial !== undefined && form.piso_salarial !== ''
            ? Number(form.piso_salarial)
            : null
        payload.status = form.status || 'ativo'
        payload.responsaveis = form.responsaveis || ''
        payload.observacoes = form.observacoes || ''
      } else if (tipoAba === 'seguros') {
        payload.titulo = form.titulo || ''
        payload.empresa = form.empresa || ''
        payload.seguradora = form.seguradora || ''
        payload.corretora = form.corretora || ''
        payload.numero_apolice = form.numero_apolice || ''
        payload.ramo = form.ramo || ''
        payload.objeto = form.objeto || ''
        payload.cobertura = form.cobertura || ''
        payload.importancia_segurada =
          form.importancia_segurada !== undefined && form.importancia_segurada !== ''
            ? Number(form.importancia_segurada)
            : null
        payload.premio_total =
          form.premio_total !== undefined && form.premio_total !== ''
            ? Number(form.premio_total)
            : null
        payload.franquia =
          form.franquia !== undefined && form.franquia !== '' ? Number(form.franquia) : null
        payload.vigencia_inicio = form.vigencia_inicio || null
        payload.vigencia_fim = form.vigencia_fim || null
        payload.status = form.status || 'ativo'
        payload.responsaveis = form.responsaveis || ''
        payload.observacoes = form.observacoes || ''
      } else {
        // contratos / locacoes
        payload.titulo = form.titulo || ''
        payload.parte = form.parte || ''
        payload.tipo = form.tipo || (tipoAba === 'locacoes' ? 'locacao' : 'servico')
        payload.empresa = form.empresa || ''
        payload.valor_mensal = form.valor_mensal !== undefined ? Number(form.valor_mensal) : null
        payload.inicio = form.inicio || null
        payload.fim = form.fim || null
        payload.status = form.status || 'ativo'
        payload.objeto = form.objeto || ''
        payload.indexador = form.indexador || ''
        payload.garantia = form.garantia || ''
        payload.unidade = form.unidade || ''
        payload.forma_pagamento = form.forma_pagamento || ''
        payload.observacao = form.observacao || ''
      }

      await pb.collection(colecaoNome).update(documento.id, payload)
      setEditando(false)
      onAtualizado?.()
    } catch (err: any) {
      console.error('Erro ao salvar documento:', err)
      alert('Não foi possível salvar as alterações: ' + (err?.message || ''))
    } finally {
      setSalvando(false)
    }
  }

  const renderEmpresaSeletor = () => {
    const nomeAtual = form.empresa || form.cliente_principal || ''
    if (!editando) {
      return (
        <div className="flex items-center gap-2 mt-1">
          <EmpresaIcon nome={nomeAtual} mostrarNome className="h-4 w-4 shrink-0 rounded-xs" />
        </div>
      )
    }
    return (
      <Popover open={empresaPopoverAberto} onOpenChange={setEmpresaPopoverAberto}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-between h-8 mt-1 text-xs font-normal"
          >
            <div className="flex items-center gap-1.5 truncate">
              <EmpresaIcon nome={nomeAtual} mostrarNome className="h-3.5 w-3.5 shrink-0" />
            </div>
            <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1 max-h-60 overflow-y-auto" align="start">
          <div className="space-y-0.5">
            {empresas.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setCampo('empresa', e.nome)
                  setCampo('cliente_principal', e.nome)
                  setEmpresaPopoverAberto(false)
                }}
                className="w-full flex items-center justify-between px-2 py-1.5 text-xs rounded-md hover:bg-gray-100 text-left"
              >
                <div className="flex items-center gap-2">
                  <EmpresaIcon nome={e.nome} className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{e.nome}</span>
                </div>
                {nomeAtual === e.nome && <Check className="h-3 w-3 text-blue-600 shrink-0" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <div className="space-y-4">
      {/* Barra de Ação Edição / Salvar */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Metadados do Documento
        </span>
        <div className="flex items-center gap-2">
          {editando ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setForm({ ...(documento || {}) })
                  setEditando(false)
                }}
                disabled={salvando}
                className="h-7 text-xs text-gray-600"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={handleSalvar}
                disabled={salvando}
                className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1"
              >
                {salvando ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Save className="h-3 w-3" />
                )}
                <span>Salvar</span>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditando(true)}
              className="h-7 text-xs text-gray-700 border-gray-300 hover:bg-gray-50 gap-1"
            >
              <FileEdit className="h-3 w-3" />
              <span>Editar Dados</span>
            </Button>
          )}
        </div>
      </div>

      {/* Grid de Campos Específicos por Tipo */}
      {tipoAba === 'alvaras' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="text-gray-500 font-medium">Nº Alvará</label>
            {editando ? (
              <Input
                value={form.numero || ''}
                onChange={(e) => setCampo('numero', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="font-semibold text-gray-900 mt-1">
                {form.numero || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Tipo</label>
            {editando ? (
              <Input
                value={form.tipo || ''}
                onChange={(e) => setCampo('tipo', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="font-medium text-gray-800 mt-1">
                {form.tipo || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Empresa</label>
            {renderEmpresaSeletor()}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Órgão Emissor</label>
            {editando ? (
              <Input
                value={form.orgao_emissor || ''}
                onChange={(e) => setCampo('orgao_emissor', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="text-gray-800 mt-1">
                {form.orgao_emissor || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Município</label>
            {editando ? (
              <Input
                value={form.municipio || ''}
                onChange={(e) => setCampo('municipio', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="text-gray-800 mt-1">
                {form.municipio || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Validade</label>
            {editando ? (
              <Input
                type="date"
                value={form.validade ? String(form.validade).substring(0, 10) : ''}
                onChange={(e) => setCampo('validade', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="font-medium text-gray-800 mt-1">
                {form.validade ? (
                  new Date(form.validade).toLocaleDateString('pt-BR')
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                    Pendente
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="text-gray-500 font-medium">Observações</label>
            {editando ? (
              <Textarea
                rows={2}
                value={form.observacoes || ''}
                onChange={(e) => setCampo('observacoes', e.target.value)}
                className="text-xs mt-1"
              />
            ) : (
              <p className="text-gray-700 mt-1 whitespace-pre-wrap">
                {form.observacoes || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {tipoAba === 'atas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <div className="sm:col-span-2">
            <label className="text-gray-500 font-medium">Título da Ata</label>
            {editando ? (
              <Input
                value={form.titulo || ''}
                onChange={(e) => setCampo('titulo', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="font-semibold text-gray-900 mt-1">
                {form.titulo || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Tipo</label>
            {editando ? (
              <Input
                value={form.tipo_ata || 'AGE'}
                onChange={(e) => setCampo('tipo_ata', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="font-medium text-gray-800 mt-1">{form.tipo_ata || 'AGE'}</p>
            )}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Empresa</label>
            {renderEmpresaSeletor()}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Data</label>
            {editando ? (
              <Input
                type="date"
                value={form.data ? String(form.data).substring(0, 10) : ''}
                onChange={(e) => setCampo('data', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="font-medium text-gray-800 mt-1">
                {form.data ? (
                  new Date(form.data).toLocaleDateString('pt-BR')
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Mesa Diretora</label>
            {editando ? (
              <Input
                value={form.mesa_diretora || ''}
                onChange={(e) => setCampo('mesa_diretora', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="text-gray-800 mt-1">
                {form.mesa_diretora || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="text-gray-500 font-medium">Pauta</label>
            {editando ? (
              <Textarea
                rows={2}
                value={form.pauta || ''}
                onChange={(e) => setCampo('pauta', e.target.value)}
                className="text-xs mt-1"
              />
            ) : (
              <p className="text-gray-700 mt-1 whitespace-pre-wrap">
                {form.pauta || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="text-gray-500 font-medium">Deliberações</label>
            {editando ? (
              <Textarea
                rows={3}
                value={form.deliberacoes || ''}
                onChange={(e) => setCampo('deliberacoes', e.target.value)}
                className="text-xs mt-1"
              />
            ) : (
              <p className="text-gray-700 mt-1 whitespace-pre-wrap">
                {form.deliberacoes || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>{' '}
        </div>
      )}

      {(tipoAba === 'contratos' || tipoAba === 'locacoes') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {tipoAba === 'contratos' && (
            <div className="sm:col-span-2 lg:col-span-3 p-3 bg-blue-50/60 rounded-xl border border-blue-200">
              <label className="text-blue-900 font-semibold text-xs block mb-1.5">
                Modelo do Contrato
              </label>
              {editando ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-800">
                    <input
                      type="radio"
                      name="modelo_contrato"
                      value="reajuste_periodico"
                      checked={
                        (form.modelo_contrato || 'reajuste_periodico') === 'reajuste_periodico'
                      }
                      onChange={() => setCampo('modelo_contrato', 'reajuste_periodico')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span>Reajuste periódico (mensalidade + índice)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-800">
                    <input
                      type="radio"
                      name="modelo_contrato"
                      value="unico_aquisicao"
                      checked={form.modelo_contrato === 'unico_aquisicao'}
                      onChange={() => setCampo('modelo_contrato', 'unico_aquisicao')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span>Contrato único / Aquisição (sem recorrência)</span>
                  </label>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      form.modelo_contrato === 'unico_aquisicao'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {form.modelo_contrato === 'unico_aquisicao'
                      ? 'Contrato único / Aquisição'
                      : 'Reajuste periódico'}
                  </span>
                  <span className="text-[11px] text-gray-500">
                    {form.modelo_contrato === 'unico_aquisicao'
                      ? 'Pagamento único/aquisição pontual, sem parcelas mensais ou índice de reajuste.'
                      : 'Pagamento recorrente mensal com régua e índice de reajuste periódico.'}
                  </span>
                </div>
              )}
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="text-gray-500 font-medium">Título do Contrato</label>
            {editando ? (
              <Input
                value={form.titulo || ''}
                onChange={(e) => setCampo('titulo', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="font-semibold text-gray-900 mt-1">
                {form.titulo || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Contraparte</label>
            {editando ? (
              <Input
                value={form.parte || ''}
                onChange={(e) => setCampo('parte', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="font-semibold text-gray-800 mt-1">
                {form.parte || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>{' '}
          <div>
            <label className="text-gray-500 font-medium">Empresa</label>
            {renderEmpresaSeletor()}
          </div>
          {tipoAba === 'contratos' && form.modelo_contrato === 'unico_aquisicao' ? (
            <div>
              <label className="text-gray-500 font-medium">Valor Total Único</label>
              {editando ? (
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor_total ?? form.valor_assinatura ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setCampo('valor_total', v ? Number(v) : null)
                    setCampo('valor_assinatura', v ? Number(v) : null)
                  }}
                  placeholder="0,00"
                  className="h-8 text-xs mt-1"
                />
              ) : (
                <p className="font-semibold text-blue-900 mt-1">
                  {(form.valor_total ?? form.valor_assinatura) !== undefined &&
                  (form.valor_total ?? form.valor_assinatura) !== null &&
                  Number(form.valor_total ?? form.valor_assinatura) > 0 ? (
                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      Number(form.valor_total ?? form.valor_assinatura),
                    )
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                      Pendente de preenchimento
                    </span>
                  )}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="text-gray-500 font-medium">Valor Mensal</label>
              {editando ? (
                <Input
                  type="number"
                  step="0.01"
                  value={form.valor_mensal ?? ''}
                  onChange={(e) => setCampo('valor_mensal', e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              ) : (
                <p className="font-semibold text-emerald-800 mt-1">
                  {form.valor_mensal !== undefined && form.valor_mensal !== null ? (
                    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
                      form.valor_mensal,
                    )
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                      Não aplicável
                    </span>
                  )}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="text-gray-500 font-medium">Vigência (Início - Fim)</label>
            {editando ? (
              <div className="flex items-center gap-1.5 mt-1">
                <Input
                  type="date"
                  value={form.inicio ? String(form.inicio).substring(0, 10) : ''}
                  onChange={(e) => setCampo('inicio', e.target.value)}
                  className="h-8 text-xs"
                />
                <span>-</span>
                <Input
                  type="date"
                  value={form.fim ? String(form.fim).substring(0, 10) : ''}
                  onChange={(e) => setCampo('fim', e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            ) : (
              <p className="text-gray-800 mt-1">
                {form.inicio ? (
                  new Date(form.inicio).toLocaleDateString('pt-BR')
                ) : (
                  <span className="text-gray-400">Não inf.</span>
                )}{' '}
                →{' '}
                {form.fim ? (
                  new Date(form.fim).toLocaleDateString('pt-BR')
                ) : (
                  <span className="text-gray-400">Indeterminado</span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Índice Reajuste</label>
            {tipoAba === 'contratos' && form.modelo_contrato === 'unico_aquisicao' ? (
              <p className="mt-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                  Não aplicável
                </span>
              </p>
            ) : editando ? (
              <Input
                value={form.indexador || ''}
                onChange={(e) => setCampo('indexador', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="text-gray-800 mt-1">{form.indexador || 'IGP-M'}</p>
            )}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Garantia</label>
            {editando ? (
              <Input
                value={form.garantia || ''}
                onChange={(e) => setCampo('garantia', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <p className="text-gray-800 mt-1">
                {form.garantia || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>
          <div>
            <label className="text-gray-500 font-medium">Status</label>
            {editando ? (
              <Input
                value={form.status || 'ativo'}
                onChange={(e) => setCampo('status', e.target.value)}
                className="h-8 text-xs mt-1"
              />
            ) : (
              <div className="mt-1">
                <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700">
                  {form.status || 'ativo'}
                </Badge>
              </div>
            )}
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className="text-gray-500 font-medium">Objeto</label>
            {editando ? (
              <Textarea
                rows={2}
                value={form.objeto || ''}
                onChange={(e) => setCampo('objeto', e.target.value)}
                className="text-xs mt-1"
              />
            ) : (
              <p className="text-gray-700 mt-1 whitespace-pre-wrap">
                {form.objeto || (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                    Não aplicável
                  </span>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {tipoAba === 'juridicos' && (
        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="text-gray-500 font-medium">Título do Processo</label>
              {editando ? (
                <Input
                  value={form.titulo || ''}
                  onChange={(e) => setCampo('titulo', e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              ) : (
                <p className="font-semibold text-gray-900 mt-1">
                  {form.titulo || (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                      Não aplicável
                    </span>
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="text-gray-500 font-medium">Nº Processo</label>
              {editando ? (
                <Input
                  value={form.numero_processo || ''}
                  onChange={(e) => setCampo('numero_processo', e.target.value)}
                  className="h-8 text-xs mt-1 font-mono"
                />
              ) : (
                <p className="font-mono text-gray-800 mt-1">
                  {form.numero_processo || (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                      Não aplicável
                    </span>
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="text-gray-500 font-medium">Nº CNJ</label>
              {editando ? (
                <Input
                  value={form.numero_cnj || ''}
                  onChange={(e) => setCampo('numero_cnj', e.target.value)}
                  className="h-8 text-xs mt-1 font-mono"
                />
              ) : (
                <p className="font-mono text-gray-800 mt-1">
                  {form.numero_cnj || (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                      Não aplicável
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-gray-500 font-medium">Empresa (Cliente)</label>
              {renderEmpresaSeletor()}
            </div>
            <div>
              <label className="text-gray-500 font-medium">Polo Contrário</label>
              {editando ? (
                <Input
                  value={form.contrario_principal || form.reu || form.autor || ''}
                  onChange={(e) => {
                    setCampo('contrario_principal', e.target.value)
                  }}
                  className="h-8 text-xs mt-1"
                />
              ) : (
                <p className="font-medium text-gray-800 mt-1">
                  {form.contrario_principal || form.reu || form.autor || (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                      Não aplicável
                    </span>
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="text-gray-500 font-medium">Órgão / Tribunal</label>
              {editando ? (
                <Input
                  value={form.orgao || form.orgao_tribunal || form.vara_comarca || ''}
                  onChange={(e) => {
                    setCampo('orgao', e.target.value)
                    setCampo('orgao_tribunal', e.target.value)
                  }}
                  className="h-8 text-xs mt-1"
                />
              ) : (
                <p className="text-gray-800 mt-1">
                  {form.orgao || form.orgao_tribunal || form.vara_comarca || (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                      Não aplicável
                    </span>
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="text-gray-500 font-medium">Responsável / Advogado</label>
              {editando ? (
                <Input
                  value={form.responsavel_principal || form.advogado || ''}
                  onChange={(e) => {
                    setCampo('responsavel_principal', e.target.value)
                    setCampo('advogado', e.target.value)
                  }}
                  className="h-8 text-xs mt-1"
                />
              ) : (
                <p className="text-gray-800 mt-1">
                  {form.responsavel_principal || form.advogado || (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                      Não aplicável
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-gray-500 font-medium">Natureza</label>
              {editando ? (
                <Input
                  value={form.natureza || ''}
                  onChange={(e) => setCampo('natureza', e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              ) : (
                <p className="text-gray-800 mt-1">
                  {form.natureza || (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                      Não aplicável
                    </span>
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="text-gray-500 font-medium">Status</label>
              {editando ? (
                <Input
                  value={form.status || 'Ativo'}
                  onChange={(e) => setCampo('status', e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              ) : (
                <div className="mt-1">
                  <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700">
                    {form.status || 'Ativo'}
                  </Badge>
                </div>
              )}
            </div>
            <div>
              <label className="text-gray-500 font-medium">Probabilidade / Risco</label>
              {editando ? (
                <Input
                  value={form.probabilidade || form.risco || ''}
                  onChange={(e) => {
                    setCampo('probabilidade', e.target.value)
                    setCampo('risco', e.target.value)
                  }}
                  className="h-8 text-xs mt-1"
                />
              ) : (
                <div className="mt-1">
                  <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700">
                    {form.probabilidade || form.risco || 'Perda Possível'}
                  </Badge>
                </div>
              )}
            </div>
            <div>
              <label className="text-gray-500 font-medium">Fase / Instância</label>
              {editando ? (
                <Input
                  value={form.fase_instancia || ''}
                  onChange={(e) => setCampo('fase_instancia', e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              ) : (
                <p className="text-gray-800 mt-1">
                  {form.fase_instancia || (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                      Não aplicável
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Bloco de Valores */}
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 space-y-2 mt-2">
            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wider block">
              Composição de Valores (R$)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
              <div>
                <label className="text-gray-500 text-[11px]">Valor Base</label>
                {editando ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={form.valor_base ?? form.valor_causa ?? ''}
                    onChange={(e) => setCampo('valor_base', e.target.value)}
                    className="h-7 text-xs mt-0.5"
                  />
                ) : (
                  <p className="font-semibold text-gray-800 mt-0.5">
                    {formatarBRL(form.valor_base ?? form.valor_causa) || (
                      <span className="text-[11px] font-normal text-gray-400">—</span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <label className="text-gray-500 text-[11px]">Valor Corrigido</label>
                {editando ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={form.valor_corrigido ?? ''}
                    onChange={(e) => setCampo('valor_corrigido', e.target.value)}
                    className="h-7 text-xs mt-0.5"
                  />
                ) : (
                  <p className="font-semibold text-gray-800 mt-0.5">
                    {formatarBRL(form.valor_corrigido) || (
                      <span className="text-[11px] font-normal text-gray-400">—</span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <label className="text-gray-500 text-[11px]">Juros</label>
                {editando ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={form.juros ?? ''}
                    onChange={(e) => setCampo('juros', e.target.value)}
                    className="h-7 text-xs mt-0.5"
                  />
                ) : (
                  <p className="font-semibold text-gray-800 mt-0.5">
                    {formatarBRL(form.juros) || (
                      <span className="text-[11px] font-normal text-gray-400">—</span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <label className="text-gray-500 text-[11px]">Honorários</label>
                {editando ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={form.honorarios ?? ''}
                    onChange={(e) => setCampo('honorarios', e.target.value)}
                    className="h-7 text-xs mt-0.5"
                  />
                ) : (
                  <p className="font-semibold text-gray-800 mt-0.5">
                    {formatarBRL(form.honorarios) || (
                      <span className="text-[11px] font-normal text-gray-400">—</span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <label className="text-gray-500 text-[11px]">Depósito Recursal</label>
                {editando ? (
                  <Input
                    type="number"
                    step="0.01"
                    value={form.deposito_recursal ?? ''}
                    onChange={(e) => setCampo('deposito_recursal', e.target.value)}
                    className="h-7 text-xs mt-0.5"
                  />
                ) : (
                  <p className="font-semibold text-gray-800 mt-0.5">
                    {formatarBRL(form.deposito_recursal) || (
                      <span className="text-[11px] font-normal text-gray-400">—</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
