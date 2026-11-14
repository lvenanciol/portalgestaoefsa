import { useEffect, useMemo, useState } from 'react'
import {
  Upload,
  FileImage,
  AlertTriangle,
  Check,
  Circle,
  CircleSlash,
  Loader2,
  Info,
  ChevronRight,
  Lock,
  Eye,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { useLl5 } from '@/ll5/Ll5Context'
import { listar, criar } from '@/ll5/repo'
import {
  validar,
  calcIMC,
  calcRCQ,
  calcTMB,
  campoVisivel,
  conciliarOcr,
  chaveDedupe,
  prescricaoCaloricaPermitida,
  type Metodo,
  type LinhaConciliacao,
} from '@/ll5/composicao-regras'
import ParecerIaCard from '@/ll5/ParecerIaCard'

// ============================================================================
// ABA COMPOSIÇÃO CORPORAL (mockup 5)
//
// Não é hard-coded: é renderizada pelo template_type='composicao' de qualquer
// aba. Uma aba duplicada abre este mesmo formulário com série independente.
//
// Regra central: a seleção do MÉTODO é o primeiro evento. Sem ela, nenhum
// campo aparece — impossível digitar dado antes de identificar o exame.
// ============================================================================

const METODOS: Array<{ v: Metodo; l: string }> = [
  { v: 'dexa', l: 'DEXA (absorciometria)' },
  { v: 'bia', l: 'Bioimpedância (BIA)' },
  { v: 'antropometria', l: 'Antropometria' },
  { v: 'balanca', l: 'Balança' },
]

const SEGMENTOS = [
  { k: 'braco_direito', l: 'Braço direito' },
  { k: 'braco_esquerdo', l: 'Braço esquerdo' },
  { k: 'tronco', l: 'Tronco' },
  { k: 'perna_direita', l: 'Perna direita' },
  { k: 'perna_esquerda', l: 'Perna esquerda' },
  { k: 'pernas_total', l: 'Pernas (total)' },
  { k: 'apendicular', l: 'Apendicular' },
]

/** Rótulos simulados do print — o OCR real está fora do escopo deste ciclo. */
const PRINT_SIMULADO = [
  { rotulo: 'Weight(Kg)', valor: '82,15' },
  { rotulo: 'BMI', valor: '27,1' },
  { rotulo: 'Fat(%)', valor: '25,6' },
  { rotulo: 'Body fat weight(Kg)', valor: '21,0' },
  { rotulo: 'Skeletal muscle mass percentage(%)', valor: '39,0' },
  { rotulo: 'Skeletal muscle weight(Kg)', valor: '32,1' },
  { rotulo: 'Muscle Percent(%)', valor: '45,2' },
  { rotulo: 'Muscle weight(Kg)', valor: '58,0' },
  { rotulo: 'V-fat', valor: '14,5' },
  { rotulo: 'Water(%)', valor: '53,2' },
  { rotulo: 'Weight of water(Kg)', valor: '43,7' },
  { rotulo: 'Metabolism(kcal/day)', valor: '1.696' },
  { rotulo: 'Protein(%)', valor: '17,4' },
  { rotulo: 'Body age', valor: '45' },
  { rotulo: 'Data/hora do print', valor: '11/10/2026 05:27' },
  { rotulo: 'Compared to Last Time', valor: '+1,05' },
]

const vazio = {
  metodo: '' as Metodo | '',
  data_exame: '',
  hora_exame: '',
  peso_kg: '',
  altura_cm: '',
  perimetro_cintura_cm: '',
  perimetro_quadril_cm: '',
  massa_gorda_kg: '',
  gordura_pct: '',
  massa_magra_kg: '',
  massa_muscular_esqueletica_kg: '',
  mme_pct: '',
  massa_ossea_kg: '',
  agua_corporal_l: '',
  agua_corporal_pct: '',
  gordura_visceral_kg: '',
  gordura_visceral_area_cm2: '',
  gordura_visceral_indice: '',
  tmb_informada_kcal: '',
  proteina_pct: '',
  idade_corporal: '',
  t_score: '',
  z_score: '',
  razao_android_gynoid: '',
  gordura_visceral_android_pct: '',
  equipamento: '',
  clinica_laboratorio: '',
  profissional_responsavel: '',
  jejum_horas: '',
  treinou_24h: false,
  hidratacao_autorrelato: 'normal',
}

export default function ComposicaoTab({ aba }: { aba: any }) {
  const { ator, isAdmin, ownerAtual } = useLl5()
  const [registros, setRegistros] = useState<any[]>([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState<any>({ ...vazio })
  const [salvando, setSalvando] = useState(false)
  const [verPrint, setVerPrint] = useState(false)
  const [linhas, setLinhas] = useState<LinhaConciliacao[]>([])
  const [resumo, setResumo] = useState({ confirmados: 0, revisar: 0, ignorados: 0 })
  const [metodoSugerido, setMetodoSugerido] = useState<Metodo | null>(null)
  const [ocrAberto, setOcrAberto] = useState(false)

  const carregar = async () => {
    setCarregando(true)
    try {
      const r = await listar('ll5_body_composition', ator, {
        ownerEscolhido: ownerAtual,
        sort: '-data_exame',
      })
      setRegistros(r)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerAtual])

  const ultimo = registros[0] || null

  // cálculos derivados
  const imc = calcIMC(Number(form.peso_kg) || null, Number(form.altura_cm) || null)
  const rcq = calcRCQ(
    Number(form.perimetro_cintura_cm) || null,
    Number(form.perimetro_quadril_cm) || null,
  )
  const tmbCalc = calcTMB({
    massaMagraKg: Number(form.massa_magra_kg) || null,
    pesoKg: Number(form.peso_kg) || null,
    alturaCm: Number(form.altura_cm) || null,
    idade: Number(form.idade_corporal) || 40,
    sexo: 'M',
  })

  const validacao = useMemo(
    () =>
      validar(
        {
          metodo: form.metodo,
          data_exame: form.data_exame,
          peso_kg: Number(form.peso_kg) || null,
          altura_cm: Number(form.altura_cm) || null,
          massa_gorda_kg: Number(form.massa_gorda_kg) || null,
          massa_magra_kg: Number(form.massa_magra_kg) || null,
          gordura_visceral_area_cm2: Number(form.gordura_visceral_area_cm2) || null,
          razao_android_gynoid: Number(form.razao_android_gynoid) || null,
          tmb_informada_kcal: Number(form.tmb_informada_kcal) || null,
          tmb_calculada_kcal: tmbCalc,
          jejum_horas: Number(form.jejum_horas) || null,
          treinou_24h: form.treinou_24h,
          clinica_laboratorio: form.clinica_laboratorio,
        },
        ultimo
          ? {
              metodo: ultimo.metodo,
              altura_cm: Number(ultimo.altura_cm) || null,
            }
          : null,
      ),
    [form, tmbCalc, ultimo],
  )

  const podeSalvar =
    form.metodo && validacao.bloqueios.length === 0 && form.peso_kg && form.data_exame

  // ---------------------------------------------------------------- OCR
  const processarPrint = () => {
    const { linhas: ls, resumo: rs, metodoSugerido: ms } = conciliarOcr(PRINT_SIMULADO)
    setLinhas(ls)
    setResumo(rs)
    setMetodoSugerido(ms)
    setOcrAberto(true)
  }

  const confirmarMapeamento = () => {
    // aplica apenas os confirmados; 'revisar' exige ação humana explícita
    const novos: any = { ...form }
    const mapaCampo: Record<string, string> = {
      peso_kg: 'peso_kg',
      gordura_pct: 'gordura_pct',
      massa_gorda_kg: 'massa_gorda_kg',
      mme_pct: 'mme_pct',
      massa_muscular_esqueletica_kg: 'massa_muscular_esqueletica_kg',
      massa_magra_kg: 'massa_magra_kg',
      gordura_visceral_indice: 'gordura_visceral_indice',
      agua_corporal_pct: 'agua_corporal_pct',
      agua_corporal_l: 'agua_corporal_l',
      tmb_informada_kcal: 'tmb_informada_kcal',
      proteina_pct: 'proteina_pct',
      idade_corporal: 'idade_corporal',
    }
    for (const l of linhas) {
      if (l.status !== 'confirmado' || !l.campo) continue
      const campo = mapaCampo[l.campo] || l.campo
      // converte "82,15" → 82.15
      novos[campo] = l.valor.replace(/\./g, '').replace(',', '.')
    }
    // data/hora do print
    const dataLinha = linhas.find((l) => l.rotulo === 'Data/hora do print')
    if (dataLinha?.status === 'confirmado') {
      const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/.exec(dataLinha.valor)
      if (m) {
        novos.data_exame = `${m[3]}-${m[2]}-${m[1]}`
        novos.hora_exame = `${m[4]}:${m[5]}`
      }
    }
    // método é SUGERIDO, nunca aplicado automaticamente
    setForm(novos)
    setOcrAberto(false)
    toast({
      title: 'Mapeamento aplicado',
      description: `${resumo.confirmados} campo(s) preenchido(s). ${
        metodoSugerido
          ? 'Método sugerido: ' + metodoSugerido.toUpperCase() + ' — confirme abaixo.'
          : 'Método não detectado — selecione manualmente.'
      }`,
    })
  }

  // ---------------------------------------------------------------- salvar
  const salvar = async () => {
    if (!podeSalvar) {
      toast({
        title: 'Não é possível salvar',
        description: validacao.bloqueios[0] || 'Preencha método, data e peso.',
        variant: 'destructive',
      })
      return
    }
    setSalvando(true)
    try {
      const chave = chaveDedupe({
        hashArquivo: 'print-simulado',
        ownerId: ownerAtual,
        dataExame: form.data_exame,
        horaExame: form.hora_exame,
        metodo: form.metodo,
      })
      await criar(
        'll5_body_composition',
        ator,
        {
          ...form,
          peso_kg: Number(form.peso_kg) || null,
          altura_cm: Number(form.altura_cm) || null,
          imc,
          rcq,
          tmb_calculada_kcal: tmbCalc,
          validacao_status:
            validacao.bloqueios.length > 0
              ? 'divergente'
              : validacao.advertencias.length > 0
                ? 'advertencia'
                : 'ok',
          validacao_detalhe: {
            bloqueios: validacao.bloqueios,
            advertencias: validacao.advertencias,
          },
          confiabilidade: validacao.confiabilidade,
          chave_dedupe: chave,
          demo: false,
        },
        ownerAtual,
      )
      toast({ title: 'Avaliação salva' })
      setForm({ ...vazio })
      await carregar()
    } catch (e: any) {
      toast({
        title: 'Falha ao salvar',
        description: e?.message || String(e),
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  const set = (k: string, v: any) => setForm({ ...form, [k]: v })

  const campo = (
    k: string,
    label: string,
    opts: { tipo?: string; obrig?: boolean; readonly?: boolean; badge?: string } = {},
  ) => {
    if (!campoVisivel(k, form.metodo)) return null
    return (
      <div className="space-y-1" key={k}>
        <Label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
          {label}
          {opts.obrig && <span className="text-red-500">*</span>}
          {opts.badge && (
            <span className="text-[9px] font-bold text-gray-400 bg-gray-100 rounded px-1">
              {opts.badge}
            </span>
          )}
        </Label>
        <Input
          type={opts.tipo || 'text'}
          value={form[k] ?? ''}
          onChange={(e) => set(k, e.target.value)}
          readOnly={opts.readonly}
          className={cn('h-8 text-[12px]', opts.readonly && 'bg-gray-50 text-gray-500')}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* ================= BLOCO 0 — IMPORTAÇÃO POR PRINT ================= */}
      <Card className="rounded-xl border-emerald-200 bg-emerald-50/40 shadow-sm p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-white border border-emerald-200 flex items-center justify-center shrink-0">
            <FileImage className="h-4 w-4 text-[#1b5e20]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-bold text-gray-900">Importar do print do aplicativo</p>
            <p className="text-[10.5px] text-gray-500">
              Arraste o print aqui ou cole com Ctrl+V — JPG, PNG ou PDF até 50 MB
            </p>
          </div>
          <Badge
            variant="outline"
            className="text-[9px] font-bold uppercase border-emerald-300 text-emerald-700 bg-white shrink-0"
          >
            OCR com revisão obrigatória
          </Badge>
          <Button
            size="sm"
            onClick={processarPrint}
            className="h-8 text-[11.5px] bg-[#1b5e20] hover:bg-[#0F3D13] text-white shrink-0"
          >
            Selecionar arquivo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast({
                title: 'Preencher manualmente',
                description: 'Selecione o método abaixo e digite os valores.',
              })
            }
            className="h-8 text-[11.5px] shrink-0"
          >
            Preencher manualmente
          </Button>
        </div>
        <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2 flex items-start gap-1">
          <Info className="h-3 w-3 shrink-0 mt-0.5" />
          O OCR real está fora do escopo deste ciclo. A conciliação usa uma amostra de rótulos do
          mesmo aplicativo de bioimpedância — o fluxo de revisão é o definitivo.
        </p>
      </Card>

      {/* ================= BLOCO 1 — IDENTIFICAÇÃO ================= */}
      <Card className="rounded-xl border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="h-5 w-5 rounded-full bg-[#1b5e20] text-white text-[10px] font-bold flex items-center justify-center">
            1
          </span>
          <h3 className="text-[13px] font-bold text-gray-900">Identificação do exame</h3>
          <span className="text-[10.5px] text-gray-500">
            Obrigatório — deve ser preenchido antes dos demais blocos
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-gray-600">
              Método do exame <span className="text-red-500">*</span>
            </Label>
            <Select value={form.metodo} onValueChange={(v) => set('metodo', v)}>
              <SelectTrigger className="h-8 text-[12px]">
                <SelectValue placeholder="Selecione o método..." />
              </SelectTrigger>
              <SelectContent className="bg-white z-[120]">
                {METODOS.map((m) => (
                  <SelectItem key={m.v} value={m.v} className="text-[12px]">
                    {m.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {metodoSugerido && (
              <p className="text-[10px] text-amber-800 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                OCR sugeriu {metodoSugerido.toUpperCase()} — confirme antes de salvar
              </p>
            )}
          </div>

          {form.metodo && (
            <>
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600">
                  Data do exame <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="date"
                  value={form.data_exame}
                  onChange={(e) => set('data_exame', e.target.value)}
                  className="h-8 text-[12px]"
                />
              </div>
              {form.metodo === 'bia' && (
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-gray-600">
                    Hora do exame <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    type="time"
                    value={form.hora_exame}
                    onChange={(e) => set('hora_exame', e.target.value)}
                    className="h-8 text-[12px]"
                  />
                </div>
              )}
            </>
          )}
        </div>

        {form.metodo && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-gray-600">Proprietário</Label>
              <Input
                value={isAdmin ? 'Administrador' : 'Você'}
                readOnly
                className="h-8 text-[12px] bg-gray-50"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-gray-600">Equipamento</Label>
              <Input
                value={form.equipamento}
                onChange={(e) => set('equipamento', e.target.value)}
                placeholder="Ex.: Xiaomi / Hologic Discovery"
                className="h-8 text-[12px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-gray-600">
                Clínica / laboratório{' '}
                {form.metodo === 'dexa' && <span className="text-red-500">*</span>}
              </Label>
              <Input
                value={form.clinica_laboratorio}
                onChange={(e) => set('clinica_laboratorio', e.target.value)}
                disabled={form.metodo !== 'dexa'}
                placeholder={
                  form.metodo === 'dexa' ? 'Obrigatório para DEXA' : 'Disponível apenas para DEXA'
                }
                className={cn('h-8 text-[12px]', form.metodo !== 'dexa' && 'bg-gray-50')}
              />
            </div>
          </div>
        )}

        {form.metodo === 'bia' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-gray-600">
                Jejum (horas) <span className="text-red-500">*</span>
              </Label>
              <Input
                type="number"
                value={form.jejum_horas}
                onChange={(e) => set('jejum_horas', e.target.value)}
                className="h-8 text-[12px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-semibold text-gray-600">
                Hidratação autorreferida
              </Label>
              <Select
                value={form.hidratacao_autorrelato}
                onValueChange={(v) => set('hidratacao_autorrelato', v)}
              >
                <SelectTrigger className="h-8 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white z-[120]">
                  <SelectItem value="baixa" className="text-[12px]">
                    Baixa
                  </SelectItem>
                  <SelectItem value="normal" className="text-[12px]">
                    Normal
                  </SelectItem>
                  <SelectItem value="alta" className="text-[12px]">
                    Alta
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-4">
              <Switch checked={form.treinou_24h} onCheckedChange={(v) => set('treinou_24h', v)} />
              <Label className="text-[11px] font-semibold text-gray-600">
                Treinou nas últimas 24 h
              </Label>
            </div>
          </div>
        )}

        {!form.metodo && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/60 p-4 text-center">
            <Lock className="h-4 w-4 text-gray-400 mx-auto mb-1" />
            <p className="text-[11.5px] text-gray-600 font-semibold">
              Selecione o método do exame para liberar os campos
            </p>
            <p className="text-[10.5px] text-gray-500">
              É impossível digitar dados antes de identificar o método.
            </p>
          </div>
        )}
      </Card>

      {/* ================= BLOCO 2 — COMPOSIÇÃO GLOBAL ================= */}
      {form.metodo && (
        <Card className="rounded-xl border-gray-200 shadow-sm p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 rounded-full bg-[#1b5e20] text-white text-[10px] font-bold flex items-center justify-center">
              2
            </span>
            <h3 className="text-[13px] font-bold text-gray-900">Composição global</h3>
            <span className="text-[10.5px] text-gray-500">Antropometria e massa</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {campo('peso_kg', 'Peso (kg)', { obrig: true })}
            {campo('altura_cm', 'Altura (cm)', { obrig: true })}
            {campoVisivel('imc', form.metodo) && (
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600 flex items-center gap-1">
                  IMC
                  <span className="text-[9px] font-bold text-gray-400 bg-gray-100 rounded px-1">
                    secundário
                  </span>
                </Label>
                <Input value={imc ?? '—'} readOnly className="h-8 text-[12px] bg-gray-50" />
              </div>
            )}
            {campo('perimetro_cintura_cm', 'Cintura (cm)')}
            {campo('perimetro_quadril_cm', 'Quadril (cm)')}
            {campoVisivel('rcq', form.metodo) && (
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600">RCQ</Label>
                <Input value={rcq ?? '—'} readOnly className="h-8 text-[12px] bg-gray-50" />
              </div>
            )}
            {campo('massa_gorda_kg', 'Massa gorda (kg)', { obrig: true })}
            {campo('gordura_pct', 'Gordura (%)', { obrig: true })}
            {campo('massa_magra_kg', 'Massa magra (kg)')}
            {campo('massa_muscular_esqueletica_kg', 'Massa muscular esquelética (kg)')}
            {campo('mme_pct', 'MME (%)')}
            {campo('massa_ossea_kg', 'Massa óssea (kg)')}
            {campo('agua_corporal_l', 'Água corporal (L)')}
            {campo('agua_corporal_pct', 'Água (%)')}
            {campo('gordura_visceral_kg', 'Gordura visceral (kg)')}
            {campo('gordura_visceral_area_cm2', 'Gordura visceral (área cm²)')}
            {campo('gordura_visceral_indice', 'Gordura visceral (índice)', {
              badge: 'estimativa BIA',
            })}
            {campo('proteina_pct', 'Proteína (%)')}
            {campo('idade_corporal', 'Idade corporal', { badge: 'sem validade clínica' })}
            {campoVisivel('tmb_calculada_kcal', form.metodo) && (
              <div className="space-y-1">
                <Label className="text-[11px] font-semibold text-gray-600">
                  TMB calculada (kcal)
                </Label>
                <Input value={tmbCalc ?? '—'} readOnly className="h-8 text-[12px] bg-gray-50" />
              </div>
            )}
            {campo('tmb_informada_kcal', 'TMB informada (app)', {
              readonly: true,
              badge: 'não usada em prescrição',
            })}
          </div>
        </Card>
      )}

      {/* ================= BLOCO 3 — SEGMENTAÇÃO REGIONAL ================= */}
      {form.metodo && (
        <Card className="rounded-xl border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="h-5 w-5 rounded-full bg-[#1b5e20] text-white text-[10px] font-bold flex items-center justify-center">
              3
            </span>
            <h3 className="text-[13px] font-bold text-gray-900">Segmentação regional</h3>
            <span className="text-[10.5px] text-gray-500">Disponível apenas em exame DEXA</span>
          </div>

          {form.metodo !== 'dexa' ? (
            <div
              className="rounded-lg border border-gray-200 p-6 text-center"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, #f9fafb, #f9fafb 8px, #f3f4f6 8px, #f3f4f6 16px)',
              }}
            >
              <Lock className="h-4 w-4 text-gray-400 mx-auto mb-1.5" />
              <p className="text-[12px] font-bold text-gray-700">
                Oculto para o método {METODOS.find((m) => m.v === form.metodo)?.l}
              </p>
              <p className="text-[10.5px] text-gray-500 max-w-md mx-auto mt-0.5">
                Este método não produz segmentação regional, T-score ou Z-score. Para acessar esta
                análise é necessário um exame DEXA.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-gray-50/70">
                    <tr className="text-[9.5px] font-bold uppercase tracking-wider text-gray-500">
                      <th className="text-left px-2 py-1.5">Região</th>
                      <th className="text-right px-2 py-1.5">Massa gorda (g)</th>
                      <th className="text-right px-2 py-1.5">Massa magra (g)</th>
                      <th className="text-right px-2 py-1.5">Gordura (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {SEGMENTOS.map((s) => (
                      <tr key={s.k}>
                        <td className="px-2 py-1 text-gray-700">{s.l}</td>
                        <td className="px-2 py-1">
                          <Input className="h-7 text-[11px] text-right" />
                        </td>
                        <td className="px-2 py-1">
                          <Input className="h-7 text-[11px] text-right" />
                        </td>
                        <td className="px-2 py-1 text-right text-gray-500">—</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {campo('t_score', 'T-score')}
                {campo('z_score', 'Z-score')}
                {campo('razao_android_gynoid', 'Razão androide/ginoide')}
                {campo('gordura_visceral_android_pct', 'Gordura visceral androide (%)')}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ================= BANNER DE VALIDAÇÃO ================= */}
      {form.metodo && validacao.bloqueios.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold text-amber-900">
                Identidade aritmética — a conta explícita
              </p>
              {validacao.bloqueios.map((b, i) => (
                <p key={i} className="text-[11.5px] text-amber-800 leading-snug mt-0.5">
                  {b}
                </p>
              ))}
            </div>
            <Button variant="outline" size="sm" className="h-7 text-[11px] shrink-0">
              Recalcular
            </Button>
          </div>
        </div>
      )}

      {form.metodo && validacao.advertencias.length > 0 && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5">
          {validacao.advertencias.map((a, i) => (
            <p key={i} className="text-[11px] text-sky-900 leading-snug flex items-start gap-1">
              <Info className="h-3 w-3 shrink-0 mt-0.5" />
              {a}
            </p>
          ))}
        </div>
      )}

      {/* ação */}
      {form.metodo && (
        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[10.5px] text-gray-500">
            {validacao.bloqueios.length > 0
              ? `${validacao.bloqueios.length} bloqueio(s) — corrija para salvar`
              : 'Pronto para salvar'}
          </p>
          <Button
            onClick={salvar}
            disabled={!podeSalvar || salvando}
            className="h-9 bg-[#1b5e20] hover:bg-[#0F3D13] text-white text-xs"
          >
            {salvando ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            Salvar avaliação
          </Button>
        </div>
      )}

      {/* ================= REGISTROS E SÉRIE ================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2 rounded-xl border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <h3 className="text-[13px] font-bold text-gray-900">Avaliações registradas</h3>
            <Badge variant="outline" className="text-[9px] border-gray-200 text-gray-500">
              {registros.length}
            </Badge>
          </div>

          {carregando ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[#1b5e20]" />
            </div>
          ) : registros.length === 0 ? (
            <div className="py-10 text-center px-6">
              <p className="text-[12px] font-semibold text-gray-700">
                Nenhuma avaliação registrada
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Importe um print ou preencha manualmente acima.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {registros.map((r) => (
                <div key={r.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[9px] font-bold uppercase shrink-0',
                        r.metodo === 'dexa'
                          ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                          : 'border-gray-300 text-gray-600 bg-gray-50',
                      )}
                    >
                      {r.metodo}
                    </Badge>
                    <span className="text-[12px] font-semibold text-gray-800 tabular-nums">
                      {r.data_exame?.slice(0, 10).split('-').reverse().join('/')}
                      {r.hora_exame ? ' · ' + r.hora_exame : ''}
                    </span>
                    <span className="text-[11.5px] text-gray-600 tabular-nums">
                      {Number(r.peso_kg || 0)
                        .toFixed(2)
                        .replace('.', ',')}{' '}
                      kg
                    </span>
                    {r.gordura_pct && (
                      <span className="text-[11px] text-gray-500 tabular-nums">
                        {Number(r.gordura_pct).toFixed(1).replace('.', ',')}% gordura
                      </span>
                    )}
                    {r.validacao_status === 'divergente' && (
                      <Badge
                        variant="outline"
                        className="text-[9px] font-bold border-amber-300 text-amber-700 bg-amber-50 shrink-0 ml-auto"
                      >
                        divergente
                      </Badge>
                    )}
                  </div>
                  {r.validacao_status === 'divergente' &&
                    r.validacao_detalhe?.divergencia_identidade && (
                      <p className="text-[10.5px] text-amber-800 mt-1 leading-snug">
                        <AlertTriangle className="h-3 w-3 inline mr-1" />
                        {String(r.validacao_detalhe.divergencia_identidade.gordura).replace(
                          '.',
                          ',',
                        )}{' '}
                        +{' '}
                        {String(r.validacao_detalhe.divergencia_identidade.magra).replace('.', ',')}{' '}
                        ={' '}
                        {String(r.validacao_detalhe.divergencia_identidade.soma).replace('.', ',')}{' '}
                        kg vs peso{' '}
                        {String(r.validacao_detalhe.divergencia_identidade.peso).replace('.', ',')}{' '}
                        kg → divergência de{' '}
                        {(
                          (Math.abs(
                            r.validacao_detalhe.divergencia_identidade.soma -
                              r.validacao_detalhe.divergencia_identidade.peso,
                          ) /
                            r.validacao_detalhe.divergencia_identidade.peso) *
                          100
                        )
                          .toFixed(1)
                          .replace('.', ',')}
                        % (limite ±2%)
                      </p>
                    )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <Card className="rounded-xl border-gray-200 shadow-sm p-4">
            <h3 className="text-[13px] font-bold text-gray-900 mb-2">Série temporal</h3>
            <SerieTemporal registros={registros} />
            <p className="text-[10px] text-gray-400 mt-2 leading-snug">
              Séries separadas por método: DEXA em linha sólida, BIA em tracejado. Nunca há
              interpolação entre métodos.
            </p>
          </Card>

          <ParecerIaCard
            scope="composicao"
            titulo="Parecer IA — Composição"
            resumo="Composição corporal analisada. Sem exame DEXA no histórico, a prescrição calórica quantificada permanece bloqueada."
            dados={{
              registros: registros.length,
              ultimo_peso: Number(registros[0]?.peso_kg || 0),
              metodo: registros[0]?.metodo || '',
            }}
            metodoComposicao={registros[0]?.metodo}
            pontosSerie={registros.filter((r) => r.metodo === registros[0]?.metodo).length}
          />
        </div>
      </div>

      {/* ================= DIALOG CONCILIAÇÃO OCR ================= */}
      <Dialog open={ocrAberto} onOpenChange={setOcrAberto}>
        <DialogContent className="bg-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Conciliação da importação</DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              Cada rótulo do print ao lado do campo de destino. Confirme o mapeamento para aplicar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1 max-h-[45vh] overflow-y-auto">
            {linhas.map((l, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 px-2 py-1 rounded text-[11px]',
                  l.status === 'confirmado' && 'bg-emerald-50/60',
                  l.status === 'revisar' && 'bg-amber-50/60',
                  l.status === 'ignorado' && 'bg-gray-50',
                )}
              >
                {l.status === 'confirmado' && (
                  <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                )}
                {l.status === 'revisar' && (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                )}
                {l.status === 'ignorado' && (
                  <CircleSlash className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                )}
                <span className="font-mono text-[10.5px] text-gray-700 w-[190px] shrink-0 truncate">
                  {l.rotulo}
                </span>
                <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" />
                <span className="text-[10.5px] text-gray-600 flex-1 truncate">
                  {l.campo || (l.acao === 'ignorar' ? 'ignorado' : '—')}
                  {l.motivo ? ' · ' + l.motivo : ''}
                </span>
                <span className="font-mono text-[10.5px] text-gray-800 shrink-0">{l.valor}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <p className="text-[11px] text-gray-600">
              <strong className="text-emerald-700">{resumo.confirmados} confirmados</strong> ·{' '}
              <strong className="text-amber-700">{resumo.revisar} a revisar</strong> ·{' '}
              <strong className="text-gray-500">{resumo.ignorados} ignorados</strong>
            </p>
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setVerPrint(true)}
                className="h-8 text-[11.5px]"
              >
                <Eye className="h-3.5 w-3.5 mr-1.5" /> Ver print
              </Button>
              <Button
                size="sm"
                onClick={confirmarMapeamento}
                className="h-8 text-[11.5px] bg-[#1b5e20] hover:bg-[#0F3D13] text-white"
              >
                Confirmar mapeamento
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={verPrint} onOpenChange={setVerPrint}>
        <DialogContent className="bg-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">Print do aplicativo</DialogTitle>
            <DialogDescription className="text-xs text-gray-600">
              O OCR real está fora do escopo deste ciclo.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border border-gray-200 p-3 bg-gray-50 font-mono text-[10.5px] space-y-0.5">
            {PRINT_SIMULADO.map((p) => (
              <div key={p.rotulo} className="flex justify-between gap-2">
                <span className="text-gray-600 truncate">{p.rotulo}</span>
                <span className="text-gray-900 font-semibold">{p.valor}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SerieTemporal({ registros }: { registros: any[] }) {
  const porMetodo = useMemo(() => {
    const mapa: Record<string, any[]> = {}
    for (const r of registros) {
      const m = r.metodo || 'outro'
      if (!mapa[m]) mapa[m] = []
      mapa[m].push(r)
    }
    for (const k of Object.keys(mapa)) {
      mapa[k].sort((a, b) => String(a.data_exame).localeCompare(String(b.data_exame)))
    }
    return mapa
  }, [registros])

  const metodos = Object.keys(porMetodo)

  if (metodos.length === 0) {
    return <p className="text-[11.5px] text-gray-500 py-3">Sem dados para série.</p>
  }

  return (
    <div className="space-y-2">
      {metodos.map((m) => {
        const pts = porMetodo[m]
        const n = pts.length
        return (
          <div key={m}>
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="font-semibold text-gray-700 uppercase">{m}</span>
              <span className="text-gray-500">{n} ponto(s)</span>
            </div>
            {n < 3 ? (
              <p className="text-[10.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5 mt-1">
                Série insuficiente para tendência (n={n})
              </p>
            ) : (
              <svg viewBox="0 0 200 50" className="w-full h-[50px] mt-1">
                <polyline
                  fill="none"
                  stroke={m === 'dexa' ? '#1b5e20' : '#6b7280'}
                  strokeWidth="2"
                  strokeDasharray={m === 'dexa' ? '0' : '5 4'}
                  points={pts
                    .map((p, i) => {
                      const max = Math.max(...pts.map((x) => Number(x.peso_kg || 0)))
                      const min = Math.min(...pts.map((x) => Number(x.peso_kg || 0)))
                      const span = max - min || 1
                      const x = (i / (n - 1)) * 190 + 5
                      const y = 45 - ((Number(p.peso_kg || 0) - min) / span) * 35
                      return `${x},${y}`
                    })
                    .join(' ')}
                />
                {pts.map((p, i) => {
                  const max = Math.max(...pts.map((x) => Number(x.peso_kg || 0)))
                  const min = Math.min(...pts.map((x) => Number(x.peso_kg || 0)))
                  const span = max - min || 1
                  const x = (i / (n - 1)) * 190 + 5
                  const y = 45 - ((Number(p.peso_kg || 0) - min) / span) * 35
                  return (
                    <circle
                      key={p.id}
                      cx={x}
                      cy={y}
                      r="2.5"
                      fill={m === 'dexa' ? '#1b5e20' : '#6b7280'}
                    >
                      <title>
                        {m.toUpperCase()} ·{' '}
                        {p.data_exame?.slice(0, 10).split('-').reverse().join('/')}
                      </title>
                    </circle>
                  )
                })}
              </svg>
            )}
          </div>
        )
      })}
    </div>
  )
}
