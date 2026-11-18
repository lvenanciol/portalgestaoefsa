/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// FASE 2.6 — CAMPOS 5W2H, GUT E JANELA NO pen_initiative (18/11/2026)
//
// A Fase 1.1 criou pen_initiative com titulo/owner/prazo/progresso/status,
// mas NÃO com os campos que a 2.6 exige:
//   · 5W2H — What / Why / Where / Who / When / How / How much
//   · GUT  — Gravidade, Urgência, Tendência
//   · janela de execução (inicio) para desenhar o Gantt de 12 meses
//
// `who` = owner_id e `when` = prazo já existem; não duplico.
//
// fields.add() exige INSTÂNCIA (TextField/NumberField), nunca objeto simples:
// com objeto a migração registra `applied` e o campo não é criado.
// ============================================================================
migrate(
  (app) => {
    const TEXTO = ['w_what', 'w_why', 'w_where', 'w_how', 'inicio']
    const NUM = ['w_howmuch', 'gut_g', 'gut_u', 'gut_t']

    try {
      const col = app.findCollectionByNameOrId('pen_initiative')
      let criados: string[] = []

      const existe = (nome: string) => {
        for (let i = 0; i < col.fields.length; i++) {
          if (String(col.fields[i].name || '') === nome) return true
        }
        return false
      }

      for (const n of TEXTO) {
        if (!existe(n)) {
          col.fields.add(new TextField({ name: n, required: false }))
          criados.push(n)
        }
      }
      for (const n of NUM) {
        if (!existe(n)) {
          col.fields.add(new NumberField({ name: n, required: false }))
          criados.push(n)
        }
      }
      if (criados.length) app.save(col)
      console.log('[w2h] campos criados: ' + (criados.join(', ') || 'nenhum (já existiam)'))
    } catch (e) {
      console.log('[w2h] ERRO ao criar campos: ' + String(e).slice(0, 160))
    }

    // ------------------------------------------------------------------
    // semeia 5W2H + GUT + janela nas 8 iniciativas existentes
    // ------------------------------------------------------------------
    const DADOS: Record<string, any> = {
      'Recuperar 400 clientes inativos no atacado': {
        w_what: 'Reativar base inativa do atacado com oferta e visita programada',
        w_why: 'Base inativa representa 18% do faturamento potencial do canal',
        w_where: 'Regional Sudeste — 3 CDs e 11 vendedores',
        w_how: 'Segmentação da base, roteiro de abordagem e meta semanal por vendedor',
        w_howmuch: 85000,
        inicio: '2026-07-01',
        gut_g: 4,
        gut_u: 4,
        gut_t: 4,
      },
      'Programa de redução de quebra por loja': {
        w_what: 'Implantar rotina de controle de temperatura e inventário único',
        w_why: 'Quebra de 2,9% contra teto de 2,5% consome margem do varejo',
        w_where: 'Todas as lojas da rede Casafruti',
        w_how: 'Sensor com alarme na câmara e calendário único de inventário',
        w_howmuch: 120000,
        inicio: '2026-08-01',
        gut_g: 5,
        gut_u: 4,
        gut_t: 4,
      },
      'Trilha de líder de turno': {
        w_what: 'Formar 100% dos líderes de turno com trilha de 40h',
        w_why: 'Turnover de 5,4% ao mês contra meta de 3,0%',
        w_where: 'CD e lojas — 34 líderes',
        w_how: 'Trilha presencial + 1:1 mensal com registro no sistema',
        w_howmuch: 60000,
        inicio: '2026-06-01',
        gut_g: 5,
        gut_u: 5,
        gut_t: 4,
      },
      'Reforma de 6 lojas âncora': {
        w_what: 'Reformar layout e frente de loja das 6 unidades âncora',
        w_why: 'Fluxo e percepção de sortimento abaixo do padrão da bandeira',
        w_where: 'Lojas âncora da praça Rio',
        w_how: 'Faseamento por loja com aprovação por etapa',
        w_howmuch: 900000,
        inicio: '2026-05-01',
        gut_g: 3,
        gut_u: 3,
        gut_t: 4,
      },
      'NPS: jornada de atendimento na loja': {
        w_what: 'Padronizar a jornada de atendimento e medir no PDV',
        w_why: 'NPS de 55 contra meta de 60',
        w_where: 'Rede Casafruti',
        w_how: 'Script de atendimento, treinamento curto e coleta no cupom',
        w_howmuch: 35000,
        inicio: '2026-08-01',
        gut_g: 3,
        gut_u: 4,
        gut_t: 3,
      },
      'Contratos de retornáveis com 3 operadores logísticos': {
        w_what: 'Fechar contrato de embalagem retornável com 3 operadores',
        w_why: 'Receita de R$ 3,65 mi contra meta de R$ 5,0 mi',
        w_where: 'FoldBox — praças SP e MG',
        w_how: 'Piloto de 60 dias, prova de custo por ciclo e contrato anual',
        w_howmuch: 45000,
        inicio: '2026-07-15',
        gut_g: 4,
        gut_u: 4,
        gut_t: 5,
      },
      'Automação da apuração fiscal': {
        w_what: 'Automatizar 70% da apuração fiscal via integração ERP',
        w_why: 'Processo manual consome 6 dias/mês de controladoria',
        w_where: 'Controladoria e Tecnologia',
        w_how: 'Integração Sankhya, testes de homologação e plano B manual',
        w_howmuch: 180000,
        inicio: '2026-04-01',
        gut_g: 4,
        gut_u: 3,
        gut_t: 4,
      },
      'Régua de despesas operacionais': {
        w_what: 'Implantar réguia de autorização de despesa por faixa',
        w_why: 'Despesa operacional cresceu acima da receita no semestre',
        w_where: 'Shared Services — todas as empresas',
        w_how: 'Faixas de alçada, aprovação no sistema e revisão mensal',
        w_howmuch: 0,
        inicio: '2026-03-01',
        gut_g: 3,
        gut_u: 2,
        gut_t: 3,
      },
    }

    let n = 0
    try {
      const inis = app.findRecordsByFilter('pen_initiative', "id != ''", '', 300, 0)
      for (const i of inis) {
        const t = String(i.getString('titulo') || '')
        const d = DADOS[t]
        if (!d) continue
        for (const k in d) {
          if (typeof d[k] === 'number') i.set(k, d[k])
          else i.set(k, d[k])
        }
        app.save(i)
        n++
      }
    } catch (e) {
      console.log('[w2h] semear: ' + String(e).slice(0, 160))
    }
    console.log('[w2h] iniciativas atualizadas: ' + n)

    // conferência: o campo existe de verdade no schema?
    try {
      const col = app.findCollectionByNameOrId('pen_initiative')
      const nomes: string[] = []
      for (let i = 0; i < col.fields.length; i++) nomes.push(String(col.fields[i].name))
      console.log('[w2h] campos atuais: ' + nomes.join(','))
    } catch (_) {}

    try {
      const uma = app.findRecordsByFilter('pen_initiative', 'titulo ~ "Trilha"', '', 1, 0)
      if (uma && uma.length) {
        console.log(
          '[w2h] amostra — inicio=' +
            uma[0].getString('inicio') +
            ' howmuch=' +
            uma[0].getFloat('w_howmuch') +
            ' GUT=' +
            uma[0].getFloat('gut_g') +
            'x' +
            uma[0].getFloat('gut_u') +
            'x' +
            uma[0].getFloat('gut_t'),
        )
      }
    } catch (_) {}
    console.log('[w2h] CONCLUÍDO')
  },
  (app) => {
    console.log('[w2h] rollback: campos mantidos')
  },
)
