import { useState } from 'react'
import { Settings, CheckCircle2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// Fase 11 — Configurações: timeout de inatividade (persistido, vale para
// toda a sessão) + informações do ambiente.

export default function ConfiguracoesPage() {
  const { timeoutMin, setTimeoutMin, user } = useAuth()
  const [salvo, setSalvo] = useState(false)

  const mudar = (v: string) => {
    setTimeoutMin(parseInt(v, 10))
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2500)
  }

  return (
    <div className="space-y-5 pb-8 w-full max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-gray-200/80">
        <div>
          <h1 className="text-2xl lg:text-[26px] font-bold text-gray-900 tracking-tight flex items-center gap-2.5">
            <Settings className="h-6 w-6 text-[#1B5E20]" />
            Configurações
          </h1>
          <p className="text-xs sm:text-[13px] text-gray-500 mt-0.5">
            Preferências da sua conta e informações do portal
          </p>
        </div>
      </div>

      {/* Timeout de inatividade */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-gray-900">Logout por inatividade</div>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Encerra a sessão automaticamente após o período sem uso (segurança).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={String(timeoutMin)} onValueChange={mudar}>
              <SelectTrigger className="h-10 w-32 bg-gray-50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[5, 10, 15, 30, 60, 120, 240].map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m} min
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {salvo && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          </div>
        </div>
      </div>

      {/* Ambiente */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 shadow-xs">
        <div className="text-sm font-bold text-gray-900 mb-3">Portal</div>
        <div className="space-y-2 text-[12px]">
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">Usuário</span>
            <span className="font-semibold text-gray-900">{user?.email || '—'}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">Grupo</span>
            <span className="font-semibold text-gray-900">
              {user?.grupoNome || user?.cargo || '—'}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">ERP integrado</span>
            <span className="font-semibold text-gray-900">Sankhya (via edge proxy)</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">IA</span>
            <span className="font-semibold text-gray-900">Gemini Flash (gateway $ai)</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-gray-500">E-mails</span>
            <span className="font-semibold text-gray-900">Relay Skip · marca Extrafruti</span>
          </div>
        </div>
      </div>
    </div>
  )
}
