import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Leaf,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Building2,
} from 'lucide-react'
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
//
// v2 (11/11/2026) — CARROSSEL DE EMPRESAS: com o token em mãos o backend
// identifica o dono (POST /backend/v1/public/reset-empresas) e devolve as
// empresas do vínculo (users.empresas, fallback empresa_id — a mesma fonte do
// Controle de Acessos e do seletor da sidebar). Mais de uma empresa → o quadrado
// da marca ALTERNA entre as logos a cada 2s (mesmo visual/comportamento do
// login, que troca a cada 2s com fade); uma só → exibida fixa; nenhuma → Leaf.
// A troca de senha em si (confirmPasswordReset + e-mail de confirmação do hook
// usuarios_troca_senha_confirmacao.js) segue EXATAMENTE como estava.

interface EmpresaReset {
  id: string
  nome: string
  cor: string
}

interface LogoItem {
  url: string
  cor: string
  empresa: string
}

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

  // Empresas do dono do token + logos para o carrossel da marca
  const [empresas, setEmpresas] = useState<EmpresaReset[]>([])
  const [logos, setLogos] = useState<LogoItem[]>([])
  const [logoIdx, setLogoIdx] = useState(0)

  // Sem token o formulário não tem o que fazer: avisa e oferece o caminho.
  const semToken = !token

  useEffect(() => {
    // Limpa a mensagem de erro assim que o usuário volta a digitar.
    if (erro && (senha || confirma)) setErro('')
  }, [senha, confirma])

  // 1. Empresas do dono do token (endpoint público do hook reset_empresas_public.js)
  useEffect(() => {
    if (!token) return
    let vivo = true
    ;(async () => {
      try {
        const r = (await pb.send('/backend/v1/public/reset-empresas', {
          method: 'POST',
          body: JSON.stringify({ token }),
        })) as { ok?: boolean; nome?: string; empresas?: EmpresaReset[] }
        if (vivo && r && Array.isArray(r.empresas)) {
          setEmpresas(r.empresas.filter((e) => e && e.id))
        }
      } catch (_) {
        // best-effort: sem resposta a tela segue no Leaf, sem quebrar o fluxo
      }
    })()
    return () => {
      vivo = false
    }
  }, [token])

  // 2. Logos REAIS (coleção logomarcas, mesmo padrão do Login) para casar
  //    empresa ↔ imagem no carrossel.
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const registros = await pb.collection('logomarcas').getFullList({
          filter: 'ativo = true',
          sort: 'empresa',
        })
        if (!vivo || !registros) return
        const urls = (registros as any[])
          .map((l) => {
            const campo = l.emblema || l.logo
            if (!campo) return null
            const ext = String(campo).split('?')[0].split('.').pop()?.toLowerCase() || ''
            const ehImagem = ['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)
            if (!ehImagem) return null
            return {
              url: pb.files.getURL(l, campo),
              cor: String(l.cor || '#1B5E20'),
              empresa: String(l.empresa || ''),
            }
          })
          .filter((item): item is LogoItem => item !== null)
        if (vivo && urls.length > 0) setLogos(urls)
      } catch (_) {
        try {
          const r = (await pb.send('/backend/v1/public/logos', { method: 'GET' })) as any
          const urls = ((r && r.logos) || [])
            .map((l: any) => {
              const urlFinal = l.iconeUrl || l.emblemaUrl || l.logoUrl
              if (!urlFinal) return null
              return {
                url: urlFinal as string,
                cor: String(l.cor || '#1B5E20'),
                empresa: String(l.empresa || ''),
              }
            })
            .filter((item: any): item is LogoItem => item !== null)
          if (vivo && urls.length > 0) setLogos(urls)
        } catch (_) {
          /* segue no Leaf */
        }
      }
    })()
    return () => {
      vivo = false
    }
  }, [])

  // 3. Empresas do vínculo ↔ logomarcas: monta a lista que o quadrado alterna.
  //    Só entra no carrossel a logo da empresa que o usuário tem vínculo.
  const logosDoUsuario: LogoItem[] = (() => {
    if (empresas.length === 0) return [] // sem vínculo identificado → Leaf puro
    const norm = (s: string) => s.trim().toLowerCase()
    const out: LogoItem[] = []
    for (const emp of empresas) {
      const rec = logos.find((l) => norm(l.empresa) === norm(emp.nome))
      if (rec) {
        out.push({ url: rec.url, cor: rec.cor || emp.cor, empresa: emp.nome })
      } else {
        // Sem imagem cadastrada: mostra o quadrado na cor da identidade
        // (mesmo fallback de cor do login/sidebar).
        out.push({ url: '', cor: emp.cor || '#1B5E20', empresa: emp.nome })
      }
    }
    return out
  })()

  // Rotação a cada 2s quando há mais de uma empresa (mesmo ritmo do login)
  useEffect(() => {
    if (logosDoUsuario.length < 2) return
    const t = setInterval(() => setLogoIdx((i) => (i + 1) % logosDoUsuario.length), 2000)
    return () => clearInterval(t)
  }, [logosDoUsuario.length, empresas.length, logos.length])

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

  const marcaAtual =
    logosDoUsuario.length > 0 ? logosDoUsuario[logoIdx % logosDoUsuario.length] : null

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl border border-[#E5E7EB] shadow-sm p-8">
          <div className="flex flex-col items-center mb-6">
            {/* Quadrado da marca: alterna entre as EMPRESAS DO USUÁRIO (não entre
                todas as logos do grupo). Cor de fundo = cor da identidade. */}
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4 overflow-hidden relative border border-gray-200"
              style={{ backgroundColor: marcaAtual ? marcaAtual.cor : '#1B5E20' }}
            >
              {marcaAtual && marcaAtual.url ? (
                <img
                  key={marcaAtual.url}
                  src={marcaAtual.url}
                  alt={marcaAtual.empresa}
                  className="h-full w-full object-contain p-1.5 animate-in fade-in duration-500"
                />
              ) : marcaAtual ? (
                <span className="font-bold text-[15px] text-white drop-shadow-sm">
                  {marcaAtual.empresa.slice(0, 2).toUpperCase()}
                </span>
              ) : (
                <Leaf className="h-8 w-8 text-white" />
              )}
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">extrafruti</h1>
            <p className="text-[13px] text-gray-500 mt-0.5">Portal de Gestão Executivo</p>

            {/* Empresas do usuário: 1 → nome fixo; 2+ → carrossel com indicadores.
                Comportamento espelha o login (alternância 2s + fade). */}
            {logosDoUsuario.length === 1 && (
              <div className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200">
                <Building2 className="h-3.5 w-3.5 text-[#1B5E20]" />
                <span className="text-[12px] font-semibold text-gray-700">
                  {logosDoUsuario[0].empresa}
                </span>
              </div>
            )}
            {logosDoUsuario.length > 1 && (
              <div className="mt-3 flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200">
                  <Building2 className="h-3.5 w-3.5 text-[#1B5E20]" />
                  <span
                    key={marcaAtual?.empresa}
                    className="text-[12px] font-semibold text-gray-700 animate-in fade-in duration-500"
                  >
                    {marcaAtual?.empresa}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {logosDoUsuario.map((l, i) => (
                    <span
                      key={l.empresa + i}
                      className={
                        'h-1.5 rounded-full transition-all duration-300 ' +
                        (i === logoIdx % logosDoUsuario.length
                          ? 'w-4 bg-[#1B5E20]'
                          : 'w-1.5 bg-gray-300')
                      }
                    />
                  ))}
                </div>
              </div>
            )}
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
              <div className="flex justify-center">
                <div className="h-16 w-16 rounded-full bg-[#1B5E20]/10 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-[#1B5E20]" />
                </div>
              </div>
              <h2 className="text-base font-bold text-gray-900">Senha alterada com sucesso</h2>
              <p className="text-[13px] text-gray-600 leading-relaxed">
                Sua nova senha já está valendo. Você será levado ao login.
              </p>
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-left">
                <Mail className="h-4 w-4 text-[#1B5E20] mt-0.5 shrink-0" />
                <p className="text-[13px] text-[#0F3D13] leading-relaxed">
                  Enviamos um e-mail de confirmação de segurança para o seu endereço cadastrado,
                  avisando que a senha foi alterada. Se não foi você, contate o administrador.
                </p>
              </div>
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
