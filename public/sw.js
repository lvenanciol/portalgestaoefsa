// Service Worker mínimo para suporte PWA estável
// Estratégia Network-First: nunca prende versões antigas nem atrapalha deploys,
// garantindo que novos builds sejam carregados imediatamente em refresh.

// v3 (02/11/2026): bump para forçar a purga do cache antigo no PWA instalado.
// O SW já é network-first + skipWaiting, mas sem trocar o CACHE_NAME um cliente
// que ficou com o offline cache de uma versão anterior podia continuar servindo
// assets velhos. Subir a versão garante que o activate limpe tudo e o preview
// passe a exibir sempre o bundle do último build.
// v4 (03/11/2026): novo bump junto do rebuild do preview — garante que nenhum
// cliente continue servindo o bundle anterior por cache do service worker.
// v5 (03/11/2026): rebuild para purgar caches anteriores e servir bundle atualizado.
// v6 (04/11/2026): rebuild para garantir exibição imediata do bundle mais recente no preview.
// v7 (04/11/2026): rebuild tela /documentos (grade com título, empresa com ícone, botão excluir, anexo viewer blob).
// v8 (04/11/2026): rebuild evolução de documentos e persistência de dados.
// v9 (04/11/2026): bump de versão para forçar purga de caches antigos e servir bundle mais recente no preview.
// v10 (04/11/2026): rebuild evolução aba Jurídico (importação de relatórios PDF/XLSX, histórico de versões e módulo de audiências).
// v11 (04/11/2026): correção de importação em lote jurídica defensiva e módulo de audiências resiliente a células vazias.
// v12 (04/11/2026): grade Jurídicos com 13 colunas exatas e Parecer/Excluir como ícones com tooltip nas 5 abas.
// v14 (05/11/2026): bump de versão para forçar purga de caches antigos (grade 13 colunas, seletor de colunas visíveis, timeline de observações por data).
// v15 (05/11/2026): rebuild com filtros Natureza e Probabilidade na aba Jurídicos, busca sem acentos/pontuação em todas as abas, coluna Natureza com categoria pura e parser de observações completo.
// v16 (05/11/2026): rebuild com reset limpo e importação de PDF em Novo Contrato Comercial,
// parser de observações e cronologia processual estendida com relatório detalhado de erros em PT-BR.
// v17 (05/11/2026): extração exaustiva da cronologia do bloco de observações/andamentos em processos jurídicos,
// detecção flexível de datas na timeline sem descartar entradas e persistência íntegra sem truncamento.
// v19 (05/11/2026): suporte a múltiplos anexos em todas as abas de Documentos (criação, detalhe, gerenciador).
// v20 (05/11/2026): parser de observações sem descarte de cronologia contígua, isolamento try/catch por registro no lote e caixa ARQUIVOS ANEXOS DO DOCUMENTO padronizada.
// v23 (06/11/2026): timeline jurídica sem eventos fantasma de importação — histórico com data de importação não vira andamento; Visualizar habilitado em todo anexo exibível (PDF e imagens) no detalhe.
// v24 (06/11/2026): ampliação da largura do modal de detalhe de processo jurídico para max-w-7xl sem rolagem lateral.
// v25 (06/11/2026): suporte completo a múltiplos anexos no detalhe do documento (todas as abas), input múltiplo e união defensiva anti-sobrescrita.
// v26 (06/11/2026): recriação do campo anexo com maxSelect 10 nas 5 coleções e purga de cache para atualização instantânea do preview.
// v27 (06/11/2026): persistência cumulativa de múltiplos anexos (anexo+), remoção seletiva (anexo-), suporte a imagens e PDFs em tela de Documentos.
// v28 (07/11/2026): redesenho da listagem Documentos (colunas dinâmicas, resumo lateral, filtros 1 linha) e padrão de referência de detalhe de Alvarás.
// v29 (07/11/2026): telas de detalhe corporativas dedicadas para Contratos e Locações com régua de reajuste, card de mapa e KPIs financeiros.
// v30 (07/11/2026): telas de detalhe dedicadas para Atas (compliance, pauta estruturada, assinaturas, completude) e Jurídicos (hero com 3 KPIs, faixa de audiência, timeline vertical autêntica).
// v31 (07/11/2026): extração universal de anexos (extrairAnexos/contarAnexos) aplicada em todas as 5 views dedicadas e remoção de DocumentoAnexoModal legado.
// v33 (07/11/2026): filtro clicável nos indicadores de Documentos e empresa LL5 no filtro Empresa
// v34 (07/11/2026): desacoplamento Atas (contábeis em 'atas', /documentos) × reuniões (nova coleção 'atas_reunioes', Operação)
// v35 (07/11/2026): detalhe dedicado em TODOS os caminhos das 5 abas de /documentos; botão "Parecer IA" alinhado ao header do modal (padrão Atas & Reuniões)
// v36 (07/11/2026): integração completa dos componentes inline (CampoEditorInline, AnexoVisualizadorInline, ResponsaveisEditorDialog) nas 5 views dedicadas e Parecer IA com Gemini Flash
// v37 (07/11/2026): correção de layout e valores dos cards de KPI no topo da aba Locações (ALUGUEL, CAUÇÃO, VIGÊNCIA sem quebra mono tabular-nums)
// v38 (07/11/2026): validação da importação dos relatórios jurídicos Extrafruti (trabalhista e cível) e timeline cronológica de observações
// v39 (07/11/2026): cards KPI hero de Locações sem corte, tabela de valores e campos fiéis do PDF em Dados do Processo Jurídico
// v40 (07/11/2026): detalhe jurídico com ícone+empresa na linha Processo, título longo quebrando sem corte e substituição de Cliente principal por Polo estruturado
// v42 (11/11/2026): rebuild para purgar cache do PWA e exibir no preview a aba
// Convenções completa, a aba Seguros e o CRUD de grupos/parceiros do CAC.
// v43 (11/11/2026): importação de Convenções alinhada ao schema real (entidade_sindical,
// parte_patronal, reajuste_percentual, piso_salarial) com normalização do texto do PDF.js;
// nova branch de importação de Seguros lendo apólice/endosso; parser da Pauta de Audiências
// corrigido (cabeçalho não vira registro, data BR sem troca dia/mês); CRUD manual de audiências;
// botão "Enviar Login" no CAC.
// v44 (11/11/2026): rebuild de conferência + purga de cache do PWA. Inclui o reparo
// dos campos de sistema created/updated nas coleções convencoes e seguros (migração 0065),
// que era a causa de a grade de Convenções e Seguros ficar vazia; modal de Nova Convenção
// mais largo e diálogos amigáveis de confirmação em "Enviar Login" e exclusão de audiência.
// v45 (11/11/2026): correção do ReferenceError "audParaExcluir is not defined" no
// modal de Audiências — estado declarado para o diálogo de confirmação de exclusão.
// v46 (11/11/2026): e-mail de acesso com a faixa das logomarcas das empresas
// vinculadas ao usuário no topo da arte e endereço do portal em portalefsa.goskip.app.
// v47 (11/11/2026): links "Trocar minha senha" e "Cadastrar / trocar senha" do e-mail de
// acesso apontam para /reset-password?token=... (tela pública de troca de senha).
// v48 (11/11/2026): confirmação de e-mail de redefinição — hook que envia aviso de
// segurança ao usuário após a troca de senha na tela /reset-password, além de
// visual de sucesso reforçado na própria tela.
// v50 (11/11/2026): correção do carrossel de empresas em /reset-password — o
// endpoint público agora decodifica o token de redefinição manualmente (o
// parse de JWT usado antes não existe no JSVM do PocketBase e a lista voltava
// vazia) e já devolve a URL pública da logomarca de cada empresa; a tela usa
// essa URL como fonte primária (a leitura direta da coleção logomarcas exige
// sessão e resolvia vazia sem erro). Rebuild para purgar cache do PWA.
const CACHE_NAME = 'pge-pwa-v51'

self.addEventListener('install', (event) => {
  // Ativação imediata da nova versão sem esperar fechamento das abas
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  // Limpa todos os caches antigos, inclusive eventuais caches de ícones
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(keys.map((key) => caches.delete(key)))
      })
      .then(() => self.clients.claim()),
  )
})

// Network-First com fallback de rede puro
self.addEventListener('fetch', (event) => {
  // Ignora chamadas de API, websockets, realtime e uploads para nunca interferir no backend
  const url = new URL(event.request.url)
  if (
    event.request.method !== 'GET' ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/backend') ||
    url.pathname.includes('/realtime') ||
    url.pathname.includes('apple-touch-icon') ||
    url.pathname.includes('icon-192') ||
    url.pathname.includes('icon-512') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('manifest.json')
  ) {
    return
  }

  // Tenta rede primeiro, garantindo que o app sempre receba a versão mais recente
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request)
    }),
  )
})
