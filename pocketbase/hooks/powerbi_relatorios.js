// Ajustes PGE — T11: listar relatórios do Power BI disponíveis para o usuário.
// O embed "para organização" exige um access token Microsoft (Entra ID).
// Fluxo: o front obtém o token (MSAL com app registration do tenant —
// configuração em Configurações, chave pge_ms_client_id) e envia aqui;
// o hook chama GET https://api.powerbi.com/v1.0/myorg/reports e devolve a
// lista (id, name, embedUrl, webUrl). SEM app registration, o front mostra
// as instruções — a plataforma não permite listar com o embed URL sozinho.

routerAdd(
  'POST',
  '/backend/v1/powerbi/relatorios',
  (e) => {
    const auth = e.auth
    if (!auth) return e.unauthorizedError('Autenticação obrigatória.')
    const body = e.requestInfo().body || {}
    const token = String(body.access_token || '').trim()
    if (!token) {
      return e.json(400, {
        ok: false,
        erro: 'access_token obrigatório — configure o app registration no Entra ID (Configurações) para o portal obter o token automaticamente.',
      })
    }

    try {
      const res = $http.send({
        url: 'https://api.powerbi.com/v1.0/myorg/reports',
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token },
        timeout: 20,
      })
      if (res.statusCode !== 200) {
        return e.json(res.statusCode === 401 ? 401 : 502, {
          ok: false,
          erro: 'Power BI API ' + res.statusCode + ' — token inválido ou sem licença Pro.',
        })
      }
      const d = res.json || {}
      const itens = (d.value || []).map(function (r) {
        return {
          id: r.id,
          nome: r.name,
          embed_url: r.embedUrl,
          web_url: r.webUrl,
          workspace: r.workspaceId,
        }
      })
      // T11 fix (20/10): myorg/reports NÃO inclui relatórios de workspaces
      // compartilhados com o usuário — agregar /groups + /groups/{id}/reports.
      // Sem o escopo (401/403), segue só a lista base (comportamento anterior).
      const vistos = {}
      itens.forEach(function (i) {
        vistos[i.id] = true
      })
      try {
        const gw = $http.send({
          url: 'https://api.powerbi.com/v1.0/myorg/groups',
          method: 'GET',
          headers: { Authorization: 'Bearer ' + token },
          timeout: 20,
        })
        if (gw.statusCode === 200) {
          const grupos = ((gw.json || {}).value || []).slice(0, 50)
          for (const g of grupos) {
            try {
              const gr = $http.send({
                url: 'https://api.powerbi.com/v1.0/myorg/groups/' + g.id + '/reports',
                method: 'GET',
                headers: { Authorization: 'Bearer ' + token },
                timeout: 20,
              })
              if (gr.statusCode !== 200) continue
              for (const r of (gr.json || {}).value || []) {
                if (vistos[r.id]) continue
                vistos[r.id] = true
                itens.push({
                  id: r.id,
                  nome: r.name,
                  embed_url: r.embedUrl,
                  web_url: r.webUrl,
                  workspace: r.workspaceId || g.id,
                })
              }
            } catch (_e2) {
              continue
            }
          }
        }
      } catch (_e3) {
        // sem acesso a /groups — mantém a lista base
      }
      return e.json(200, { ok: true, total: itens.length, itens: itens })
    } catch (err) {
      return e.json(502, {
        ok: false,
        erro: 'Falha ao consultar Power BI: ' + String(err).slice(0, 200),
      })
    }
  },
  $apis.requireAuth(),
)
