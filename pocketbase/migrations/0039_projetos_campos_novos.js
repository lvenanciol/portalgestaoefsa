// 0039_projetos_campos_novos.js
// Adiciona colunas opcionais à coleção 'projetos' para suportar o novo modal:
// patrocinador (text), prioridade (select Baixa|Normal|Alta), inicio (date),
// marco_atual (select), vinculo_tipo (text), vinculo_id (text), anexos (file múltiplo).
// Preserva intactos todos os campos pré-existentes (nome, descricao, empresa, status, progresso, responsavel, prazo, orcamento, realizado, marcos, riscos, raci).

migrate(
  (app) => {
    const projetos = app.findCollectionByNameOrId('projetos')

    if (!projetos.fields.getByName('patrocinador')) {
      projetos.fields.add(new TextField({ name: 'patrocinador' }))
    }

    if (!projetos.fields.getByName('prioridade')) {
      projetos.fields.add(
        new SelectField({
          name: 'prioridade',
          values: ['Baixa', 'Normal', 'Alta'],
          maxSelect: 1,
        }),
      )
    }

    if (!projetos.fields.getByName('inicio')) {
      projetos.fields.add(new DateField({ name: 'inicio' }))
    }

    if (!projetos.fields.getByName('marco_atual')) {
      projetos.fields.add(
        new SelectField({
          name: 'marco_atual',
          values: ['Fase 1 de 5', 'Fase 2 de 5', 'Fase 3 de 5', 'Fase 4 de 5', 'Fase 5 de 5'],
          maxSelect: 1,
        }),
      )
    }

    if (!projetos.fields.getByName('vinculo_tipo')) {
      projetos.fields.add(new TextField({ name: 'vinculo_tipo' }))
    }

    if (!projetos.fields.getByName('vinculo_id')) {
      projetos.fields.add(new TextField({ name: 'vinculo_id' }))
    }

    if (!projetos.fields.getByName('anexos')) {
      projetos.fields.add(
        new FileField({
          name: 'anexos',
          maxSelect: 0, // Múltiplos arquivos
          maxSize: 52428800, // 50MB
        }),
      )
    }

    app.save(projetos)
  },
  (app) => {
    try {
      const projetos = app.findCollectionByNameOrId('projetos')
      const nomes = [
        'patrocinador',
        'prioridade',
        'inicio',
        'marco_atual',
        'vinculo_tipo',
        'vinculo_id',
        'anexos',
      ]
      for (const n of nomes) {
        if (projetos.fields.getByName(n)) {
          projetos.fields.removeByName(n)
        }
      }
      app.save(projetos)
    } catch (_) {}
  },
)
