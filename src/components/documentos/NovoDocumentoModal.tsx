import React, { useState } from 'react'
import {
  FileText,
  Upload,
  Calendar,
  Building2,
  DollarSign,
  ShieldCheck,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import pb from '@/lib/pocketbase/client'

interface NovoDocumentoModalProps {
  aberto: boolean
  onOpenChange: (aberto: boolean) => void
  tipoAba: 'alvaras' | 'contratos' | 'locacoes' | 'atas' | 'juridicos'
  empresas: Array<{ id: string; nome: string }>
  empresaPreSelecionada?: string
  onCriadoSucesso: () => void
}

export function NovoDocumentoModal({
  aberto,
  onOpenChange,
  tipoAba,
  empresas,
  empresaPreSelecionada,
  onCriadoSucesso,
}: NovoDocumentoModalProps) {
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Estado unificado dos campos dos documentos
  const [form, setForm] = useState<Record<string, any>>({
    empresa: empresaPreSelecionada || (empresas[0]?.nome ?? 'Extrafruti'),
    status: 'ativo',
  })

  // Atualiza empresa caso mude fora
  React.useEffect(() => {
    if (empresaPreSelecionada) {
      setForm((prev) => ({ ...prev, empresa: empresaPreSelecionada }))
    }
  }, [empresaPreSelecionada])

  const setCampo = (campo: string, valor: any) => {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    setErro(null)

    try {
      if (tipoAba === 'alvaras') {
        if (!form.numero) throw new Error('Número do alvará é obrigatório.')
        await pb.collection('alvaras').create({
          numero: form.numero,
          tipo: form.tipo || 'Alvará de Funcionamento',
          orgao_emissor: form.orgao_emissor || 'Prefeitura Municipal',
          municipio: form.municipio || 'Vitória - ES',
          empresa: form.empresa,
          validade: form.validade ? `${form.validade} 00:00:00.000Z` : null,
          status: form.status || 'regular',
          observacoes: form.observacoes || '',
        })
      } else if (tipoAba === 'contratos' || tipoAba === 'locacoes') {
        if (!form.titulo) throw new Error('Título do contrato é obrigatório.')
        const valorNum = form.valor_mensal
          ? parseFloat(
              String(form.valor_mensal)
                .replace(/[R$\s.]/g, '')
                .replace(',', '.'),
            )
          : 0

        await pb.collection('contratos').create({
          titulo: form.titulo,
          parte: form.parte || '',
          tipo: tipoAba === 'locacoes' ? 'locacao' : form.tipo || 'servico',
          empresa: form.empresa,
          valor_mensal: isNaN(valorNum) ? 0 : valorNum,
          inicio: form.inicio ? `${form.inicio} 00:00:00.000Z` : null,
          fim: form.fim ? `${form.fim} 00:00:00.000Z` : null,
          status: form.status || 'ativo',
          objeto: form.objeto || '',
          indexador: form.indexador || 'IGP-M',
          forma_pagamento: form.forma_pagamento || 'Boleto bancário mensal',
          garantia: form.garantia || '',
          vistoria: form.vistoria || '',
          observacao: form.observacao || '',
        })
      } else if (tipoAba === 'atas') {
        if (!form.titulo) throw new Error('Título da ata é obrigatório.')
        await pb.collection('atas').create({
          titulo: form.titulo,
          tipo_ata: form.tipo_ata || 'AGE',
          data: form.data ? `${form.data} 10:00:00.000Z` : new Date().toISOString(),
          empresa: form.empresa,
          participantes: form.participantes || '',
          mesa_diretora: form.mesa_diretora || '',
          pauta: form.pauta || '',
          deliberacoes: form.deliberacoes || '',
          assinatura_eletronica: form.assinatura_eletronica || 'Assinatura digital coletada',
          resumo: form.resumo || '',
        })
      } else if (tipoAba === 'juridicos') {
        if (!form.numero_processo) throw new Error('Número do processo é obrigatório.')
        const valCausa = form.valor_causa
          ? parseFloat(
              String(form.valor_causa)
                .replace(/[R$\s.]/g, '')
                .replace(',', '.'),
            )
          : 0

        await pb.collection('processos_juridicos').create({
          numero_processo: form.numero_processo,
          vara_comarca: form.vara_comarca || 'Vara Cível',
          autor: form.autor || 'Polo Ativo',
          reu: form.reu || form.empresa,
          empresa: form.empresa,
          fase_instancia: form.fase_instancia || '1ª Instância',
          assunto_tipo: form.assunto_tipo || 'Cível',
          valor_causa: isNaN(valCausa) ? 0 : valCausa,
          data_distribuicao: form.data_distribuicao
            ? `${form.data_distribuicao} 00:00:00.000Z`
            : null,
          advogado: form.advogado || '',
          status: form.status || 'ativo',
          risco: form.risco || 'possivel',
          proxima_audiencia: form.proxima_audiencia
            ? `${form.proxima_audiencia} 00:00:00.000Z`
            : null,
          observacoes: form.observacoes || '',
        })
      }

      onCriadoSucesso()
      onOpenChange(false)
      setForm({
        empresa: empresaPreSelecionada || (empresas[0]?.nome ?? 'Extrafruti'),
        status: 'ativo',
      })
    } catch (err: any) {
      setErro(err?.message || 'Erro ao criar documento.')
    } finally {
      setSalvando(false)
    }
  }

  const TITULOS_ABA: Record<string, string> = {
    alvaras: 'Novo Alvará / Licença',
    contratos: 'Novo Contrato Comercial',
    locacoes: 'Novo Contrato de Locação',
    atas: 'Nova Ata de Assembleia / Reunião',
    juridicos: 'Novo Processo Jurídico',
  }

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white max-w-xl max-h-[88vh] overflow-y-auto p-6 rounded-2xl shadow-xl border border-gray-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-gray-900 pb-2 border-b border-gray-100">
            <FileText className="h-4 w-4 text-[#1B5E20]" />
            {TITULOS_ABA[tipoAba] || 'Novo Documento'}
          </DialogTitle>
        </DialogHeader>

        {erro && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {erro}
          </div>
        )}

        <form onSubmit={handleSalvar} className="space-y-4 pt-1">
          {/* Linha Empresa */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-gray-700">Empresa *</Label>
              <Select value={form.empresa || ''} onValueChange={(val) => setCampo('empresa', val)}>
                <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-200">
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((e) => (
                    <SelectItem key={e.id || e.nome} value={e.nome}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status específico por aba */}
            <div className="space-y-1">
              <Label className="text-[11px] font-bold text-gray-700">Status</Label>
              <Select value={form.status || ''} onValueChange={(val) => setCampo('status', val)}>
                <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tipoAba === 'alvaras' ? (
                    <>
                      <SelectItem value="regular">Regular</SelectItem>
                      <SelectItem value="vencendo">Vencendo</SelectItem>
                      <SelectItem value="vencido">Vencido</SelectItem>
                      <SelectItem value="em_renovacao">Em Renovação</SelectItem>
                    </>
                  ) : tipoAba === 'juridicos' ? (
                    <>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="suspenso">Suspenso</SelectItem>
                      <SelectItem value="acordo">Acordo</SelectItem>
                      <SelectItem value="encerrado">Encerrado</SelectItem>
                      <SelectItem value="em_recurso">Em Recurso</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="vencendo">Vencendo</SelectItem>
                      <SelectItem value="encerrado">Encerrado</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* CAMPOS ESPECÍFICOS: ALVARÁS */}
          {tipoAba === 'alvaras' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Número do Alvará *</Label>
                  <Input
                    required
                    value={form.numero || ''}
                    onChange={(e) => setCampo('numero', e.target.value)}
                    placeholder="ALV-2026/0123"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Data de Validade</Label>
                  <Input
                    type="date"
                    value={form.validade || ''}
                    onChange={(e) => setCampo('validade', e.target.value)}
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Tipo de Alvará</Label>
                  <Input
                    value={form.tipo || ''}
                    onChange={(e) => setCampo('tipo', e.target.value)}
                    placeholder="Funcionamento / Sanitário / Bombeiros"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Órgão Emissor</Label>
                  <Input
                    value={form.orgao_emissor || ''}
                    onChange={(e) => setCampo('orgao_emissor', e.target.value)}
                    placeholder="Prefeitura / Vigilância Sanitária"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Município / UF</Label>
                <Input
                  value={form.municipio || ''}
                  onChange={(e) => setCampo('municipio', e.target.value)}
                  placeholder="Viana - ES"
                  className="h-9 text-xs bg-gray-50"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Observações</Label>
                <Textarea
                  value={form.observacoes || ''}
                  onChange={(e) => setCampo('observacoes', e.target.value)}
                  rows={2}
                  className="text-xs bg-gray-50 resize-none"
                  placeholder="Condicionantes ou notas adicionais..."
                />
              </div>
            </>
          )}

          {/* CAMPOS ESPECÍFICOS: CONTRATOS & LOCAÇÕES */}
          {(tipoAba === 'contratos' || tipoAba === 'locacoes') && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">
                  Título / Objeto Resumido *
                </Label>
                <Input
                  required
                  value={form.titulo || ''}
                  onChange={(e) => setCampo('titulo', e.target.value)}
                  placeholder={
                    tipoAba === 'locacoes'
                      ? 'Locação Galpão Petrolina'
                      : 'Contrato de Prestação de Serviços'
                  }
                  className="h-9 text-xs bg-gray-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    Contraparte / Locador *
                  </Label>
                  <Input
                    value={form.parte || ''}
                    onChange={(e) => setCampo('parte', e.target.value)}
                    placeholder="Razão Social / Nome"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Valor Mensal (R$)</Label>
                  <Input
                    value={form.valor_mensal || ''}
                    onChange={(e) => setCampo('valor_mensal', e.target.value)}
                    placeholder="0,00"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Início da Vigência</Label>
                  <Input
                    type="date"
                    value={form.inicio || ''}
                    onChange={(e) => setCampo('inicio', e.target.value)}
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Término da Vigência</Label>
                  <Input
                    type="date"
                    value={form.fim || ''}
                    onChange={(e) => setCampo('fim', e.target.value)}
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Índice de Reajuste</Label>
                  <Input
                    value={form.indexador || ''}
                    onChange={(e) => setCampo('indexador', e.target.value)}
                    placeholder="IGP-M / IPCA (anual)"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Garantia / Fiança</Label>
                  <Input
                    value={form.garantia || ''}
                    onChange={(e) => setCampo('garantia', e.target.value)}
                    placeholder="Fiança bancária / Seguro / Caução"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Vistoria e Condições</Label>
                <Input
                  value={form.vistoria || ''}
                  onChange={(e) => setCampo('vistoria', e.target.value)}
                  placeholder="Laudo de vistoria inicial assinado"
                  className="h-9 text-xs bg-gray-50"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Objeto Detalhado</Label>
                <Textarea
                  value={form.objeto || ''}
                  onChange={(e) => setCampo('objeto', e.target.value)}
                  rows={2}
                  className="text-xs bg-gray-50 resize-none"
                  placeholder="Descrição completa do objeto do contrato..."
                />
              </div>
            </>
          )}

          {/* CAMPOS ESPECÍFICOS: ATAS */}
          {tipoAba === 'atas' && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Título da Ata *</Label>
                <Input
                  required
                  value={form.titulo || ''}
                  onChange={(e) => setCampo('titulo', e.target.value)}
                  placeholder="Ata de AGE - Abertura de Filial"
                  className="h-9 text-xs bg-gray-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Tipo de Ata</Label>
                  <Select
                    value={form.tipo_ata || 'AGE'}
                    onValueChange={(val) => setCampo('tipo_ata', val)}
                  >
                    <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AGE">AGE (Extraordinária)</SelectItem>
                      <SelectItem value="AGO">AGO (Ordinária)</SelectItem>
                      <SelectItem value="Reunião Diretoria">Reunião de Diretoria</SelectItem>
                      <SelectItem value="Comitê">Comitê Executivo</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Data da Reunião</Label>
                  <Input
                    type="date"
                    value={form.data || ''}
                    onChange={(e) => setCampo('data', e.target.value)}
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Mesa Diretora</Label>
                  <Input
                    value={form.mesa_diretora || ''}
                    onChange={(e) => setCampo('mesa_diretora', e.target.value)}
                    placeholder="Presidente e Secretário"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    Assinatura Eletrônica
                  </Label>
                  <Input
                    value={form.assinatura_eletronica || ''}
                    onChange={(e) => setCampo('assinatura_eletronica', e.target.value)}
                    placeholder="DocuSign / ICP-Brasil / Assinado"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Ordem do Dia / Pauta</Label>
                <Textarea
                  value={form.pauta || ''}
                  onChange={(e) => setCampo('pauta', e.target.value)}
                  rows={2}
                  className="text-xs bg-gray-50 resize-none"
                  placeholder="Itens pautados para deliberação..."
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Deliberações</Label>
                <Textarea
                  value={form.deliberacoes || ''}
                  onChange={(e) => setCampo('deliberacoes', e.target.value)}
                  rows={2}
                  className="text-xs bg-gray-50 resize-none"
                  placeholder="Decisões tomadas pelos membros..."
                />
              </div>
            </>
          )}

          {/* CAMPOS ESPECÍFICOS: JURÍDICOS */}
          {tipoAba === 'juridicos' && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-gray-700">Número do Processo *</Label>
                <Input
                  required
                  value={form.numero_processo || ''}
                  onChange={(e) => setCampo('numero_processo', e.target.value)}
                  placeholder="0012345-67.2026.8.08.0001"
                  className="h-9 text-xs bg-gray-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Vara / Comarca</Label>
                  <Input
                    value={form.vara_comarca || ''}
                    onChange={(e) => setCampo('vara_comarca', e.target.value)}
                    placeholder="3ª Vara Cível de Vitória"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Valor da Causa (R$)</Label>
                  <Input
                    value={form.valor_causa || ''}
                    onChange={(e) => setCampo('valor_causa', e.target.value)}
                    placeholder="0,00"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Autor / Requerente</Label>
                  <Input
                    value={form.autor || ''}
                    onChange={(e) => setCampo('autor', e.target.value)}
                    placeholder="Polo ativo"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Réu / Requerido</Label>
                  <Input
                    value={form.reu || ''}
                    onChange={(e) => setCampo('reu', e.target.value)}
                    placeholder="Polo passivo"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Fase / Instância</Label>
                  <Input
                    value={form.fase_instancia || ''}
                    onChange={(e) => setCampo('fase_instancia', e.target.value)}
                    placeholder="Fase Instrutória / 1ª Instância"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Risco</Label>
                  <Select
                    value={form.risco || 'possivel'}
                    onValueChange={(val) => setCampo('risco', val)}
                  >
                    <SelectTrigger className="h-9 text-xs bg-gray-50 border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="provavel">Provável</SelectItem>
                      <SelectItem value="possivel">Possível</SelectItem>
                      <SelectItem value="remoto">Remoto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">
                    Advogado Responsável
                  </Label>
                  <Input
                    value={form.advogado || ''}
                    onChange={(e) => setCampo('advogado', e.target.value)}
                    placeholder="Nome do patrono"
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold text-gray-700">Próxima Audiência</Label>
                  <Input
                    type="date"
                    value={form.proxima_audiencia || ''}
                    onChange={(e) => setCampo('proxima_audiencia', e.target.value)}
                    className="h-9 text-xs bg-gray-50"
                  />
                </div>
              </div>
            </>
          )}

          <DialogFooter className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={salvando}
              className="h-9 text-xs bg-[#1B5E20] hover:bg-[#0F3D13] text-white"
            >
              {salvando ? 'Salvando...' : 'Salvar Documento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
