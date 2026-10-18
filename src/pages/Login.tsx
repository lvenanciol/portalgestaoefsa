import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Leaf, Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/use-auth'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import pb from '@/lib/pocketbase/client'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [lembrar, setLembrar] = useState(true)
  const [showSenha, setShowSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(false)
  const [recuperar, setRecuperar] = useState(false)
  const [msgRecuperar, setMsgRecuperar] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setLoading(true)
    const { error } = await signIn(email, senha)
    setLoading(false)
    if (error) {
      setErro(getErrorMessage(error) || 'Credenciais inválidas.')
      return
    }
    navigate('/', { replace: true })
  }

  const handleRecuperar = async () => {
    setMsgRecuperar('')
    if (!email) {
      setMsgRecuperar('Informe seu e-mail acima para recuperar a senha.')
      return
    }
    try {
      await pb.collection('users').requestPasswordReset(email)
      setMsgRecuperar('Instruções enviadas para o seu e-mail.')
    } catch (_) {
      setMsgRecuperar('Não foi possível enviar. Verifique o e-mail informado.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] p-4">
      <div className="w-full max-w-md">
        {/* Card de login */}
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="h-14 w-14 rounded-2xl bg-[#1B5E20] flex items-center justify-center mb-4">
              <Leaf className="h-7 w-7 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">extrafruti</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">Portal de Gestão Executivo</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                E-mail
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com.br"
                  className="w-full h-11 pl-10 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20 focus:border-[#1B5E20]/40 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Senha
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type={showSenha ? 'text' : 'password'}
                  required
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="••••••••"
                  className="w-full h-11 pl-10 pr-10 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20 focus:border-[#1B5E20]/40 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowSenha((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
                  aria-label={showSenha ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={lembrar}
                  onChange={(e) => setLembrar(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#1B5E20] focus:ring-[#1B5E20]/30"
                />
                <span className="text-[13px] text-gray-600 font-medium">Lembrar-me</span>
              </label>
              <button
                type="button"
                onClick={handleRecuperar}
                className="text-[13px] font-semibold text-[#1B5E20] hover:underline focus:outline-none"
              >
                Recuperar senha
              </button>
            </div>

            {erro && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700 font-medium">
                {erro}
              </div>
            )}
            {msgRecuperar && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-[13px] text-[#1B5E20] font-medium">
                {msgRecuperar}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-11 rounded-lg bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/40 disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6">
          Portal de Gestão Executiva — Extrafruti · Casafruti · FoldBox
        </p>
      </div>
    </div>
  )
}
