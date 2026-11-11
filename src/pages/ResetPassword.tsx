import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Leaf, Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'

// REDEFINIÇÃO DE SENHA (11/11/2026)
//
// CAUSA DO DEFEITO QUE ESTA TELA CORRIGE:
// o e-mail de redefinição sempre apontou para `{SITE_URL}/reset-password?token=...`
// (placeholder {RESET_URL} do PocketBase), mas o router do app NUNCA teve essa
// rota. Como o host responde 200 em qualquer caminho (fallback da SPA), o link
// "abria" e caía no `path="*"` → NotFound. Era isso que o usuário via como
// "não abre / não funciona".
//
// Esta tela é PÚBLICA (fora do ProtectedRoute): quem chega aqui ainda não tem
// sessão — está justamente tentando recuperar o acesso.
export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''

  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [showSenha, setShowSenha] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [loading, setLoading] = useState(false)

  // Sem token o formulário não tem o que fazer: avisa e oferece o caminho.
  const semToken = !token

  useEffect(() => {
    // Limpa a mensagem de erro assim que o usuário volta a digitar.
    if (erro && (senha || confirma)) setErro('')
  }, [senha, confirma])

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')

    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.')
      return
    }
    if (senha !== confirma) {
      setErro('As duas senhas não conferem.')
      return
    }

    setLoading(true)
    try {
      await pb.collection('users').confirmPasswordReset(token, senha, confirma)
      setOk(true)
      // Redireciona para o login depois de dar tempo de ler a confirmação.
      setTimeout(() => navigate('/login', { replace: true }), 2600)
    } catch (err) {
      setErro(
        getErrorMessage(err) ||
          'Não foi possível redefinir a senha. O link pode ter expirado — solicite um novo.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4 bg-[#1B5E20] overflow-hidden">
              <Leaf className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">extrafruti</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">Portal de Gestão Executivo</p>
          </div>

          {/* 1. Link sem token (ou já usado/copiado pela metade) */}
          {semToken && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-[13px] text-amber-800 leading-relaxed">
                  <strong>Link incompleto.</strong> O endereço não trouxe o código de redefinição —
                  normalmente porque foi copiado pela metade ou já foi usado.
                </div>
              </div>
              <p className="text-[13px] text-gray-600 leading-relaxed">
                Volte à tela de login e clique em <strong>Recuperar senha</strong> para receber um
                e-mail novo.
              </p>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full h-11 rounded-lg bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-sm font-bold transition-colors"
              >
                Ir para o login
              </button>
            </div>
          )}

          {/* 2. Senha redefinida */}
          {!semToken && ok && (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-[#1B5E20] mx-auto" />
              <h2 className="text-base font-bold text-gray-900">Senha alterada</h2>
              <p className="text-[13px] text-gray-600 leading-relaxed">
                Sua nova senha já está valendo. Você será levado ao login.
              </p>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="w-full h-11 rounded-lg bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-sm font-bold transition-colors"
              >
                Entrar agora
              </button>
            </div>
          )}

          {/* 3. Formulário */}
          {!semToken && !ok && (
            <form onSubmit={handleSalvar} className="space-y-4">
              <p className="text-[13px] text-gray-600 leading-relaxed text-center mb-2">
                Defina sua nova senha de acesso ao Portal.
              </p>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                  Nova senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type={showSenha ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Mínimo de 8 caracteres"
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

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                  Repita a nova senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type={showSenha ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={confirma}
                    onChange={(e) => setConfirma(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-11 pl-10 pr-3 text-sm bg-gray-50 border border-gray-200 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/20 focus:border-[#1B5E20]/40 transition-all"
                  />
                </div>
              </div>

              {erro && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700 font-medium">
                  {erro}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-lg bg-[#1B5E20] hover:bg-[#0F3D13] text-white text-sm font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-[#1B5E20]/40 disabled:opacity-60 inline-flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? 'Salvando...' : 'Salvar nova senha'}
              </button>

              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="w-full text-[13px] font-semibold text-[#1B5E20] hover:underline"
              >
                Voltar ao login
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-6">
          Portal de Gestão Executiva — Extrafruti · Casafruti · FoldBox · LL5
        </p>
      </div>
    </div>
  )
}
