/// <reference path="../pb_data/types.d.ts" />
// ============================================================================
// LL5 — CAMPOS QUE FALTAVAM (15/11/2026)
//
// 1. `ll5_body_composition.tmb_calculada_kcal`
//    CAUSA DO "Failed to create record" ao salvar composição: o formulário
//    envia `tmb_calculada_kcal`, mas o campo não existia no schema. O
//    PocketBase rejeita o registro inteiro.
//
// 2. `ll5_treatments` — campos pedidos pelo dono:
//    · instituto          → nome da clínica/espaço (à esquerda de profissional)
//    · empresa            → empresa do paciente (para gerar tarefa)
//    · responsavel_id     → usuário responsável (o próprio paciente)
//    · paciente_nome      → nome do paciente
//    · proximas_sessoes   → datas geradas a partir de início + frequência
//    · tarefa_ids         → ids das tarefas criadas no PGE
// ============================================================================
migrate(
  (app) => {
    // ---------------- 1) composição corporal ----------------
    try {
      const col = app.findCollectionByNameOrId('ll5_body_composition')
      const nomes = (col.fields || []).map((f) => f.name)
      if (!nomes.includes('tmb_calculada_kcal')) {
        col.fields.add(new NumberField({ name: 'tmb_calculada_kcal' }))
        app.save(col)
        console.log('[ll5/campos] tmb_calculada_kcal adicionado em ll5_body_composition')
      } else {
        console.log('[ll5/campos] tmb_calculada_kcal já existe')
      }
    } catch (err) {
      console.log('[ll5/campos] falha em composição: ' + String(err).slice(0, 160))
    }

    // ---------------- 2) tratamentos ----------------
    try {
      const col = app.findCollectionByNameOrId('ll5_treatments')
      const existentes = (col.fields || []).map((f) => f.name)

      const add = (campo) => {
        if (!existentes.includes(campo.name)) {
          col.fields.add(campo)
          console.log('[ll5/campos] + ' + campo.name)
        }
      }

      add(new TextField({ name: 'instituto', max: 160 }))
      add(new TextField({ name: 'empresa', max: 120 }))
      add(new TextField({ name: 'responsavel_id', max: 20 }))
      add(new TextField({ name: 'paciente_nome', max: 160 }))
      add(new JSONField({ name: 'proximas_sessoes', maxSize: 8000 }))
      add(new JSONField({ name: 'tarefa_ids', maxSize: 8000 }))
      add(new NumberField({ name: 'intervalo_dias', onlyInt: true }))

      app.save(col)
      console.log('[ll5/campos] ll5_treatments atualizada')
    } catch (err) {
      console.log('[ll5/campos] falha em tratamentos: ' + String(err).slice(0, 160))
    }
  },
  (app) => {
    console.log('[ll5/campos] rollback: campos mantidos para preservar dados')
  },
)
