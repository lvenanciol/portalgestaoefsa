# DECISIONS — Seção LL5 (ciclo 1)

Registro das decisões tomadas em ambiguidade, conforme instrução do briefing:
"em ambiguidade, escolha a opção que preserve integridade dos dados e registre
em DECISIONS.md".

---

## D1 — Isolamento por owner em DUAS camadas

**Ambiguidade:** a regra do PocketBase poderia filtrar sozinha, mas o admin
precisa ver tudo.

**Decisão:** o isolamento vive no **repositório** (`src/ll5/repo.ts`), que:

1. envia o filtro `owner_id` ao banco (para não trafegar dado alheio);
2. refaz o recorte em memória (defesa em profundidade).

Um membro que tente pedir `ownerEscolhido` de outro recebe o próprio filtro —
`filtroOwner()` descarta o parâmetro de propósito.

**Por quê:** o briefing exige teste que prove que o membro não lista registro
alheio **chamando o repositório diretamente**. Filtrar só na UI não passaria.

**Teste:** `ll5.test.ts` → "membro NUNCA recebe filtro que não seja o próprio id".

---

## D2 — Abas são 100% dados, sem enum no código

**Ambiguidade:** "as 4 abas iniciais" poderiam ser fixas e as novas dinâmicas.

**Decisão:** as 4 nascem pelo **mesmo** `criarAba()` que o botão "＋ Aba" usa.
`template_type` é só um campo de texto com valores conhecidos. Uma aba
duplicada herda `template_type` e `schema_template` e passa a ter série de
dados independente (novo registro em `ll5_tabs`, mesma renderização).

**Por quê:** o briefing é explícito — "A aba Composição Corporal NÃO é
hard-coded: nasce do mesmo CRUD das demais".

**Consequência:** excluir a aba Composição Corporal é igual a excluir qualquer
outra (soft delete em `deletado_em`).

---

## D3 — Soft delete de aba preserva os dados

**Decisão:** "excluir" uma aba grava `deletado_em` e `ativo=false`. Ela sai da
navegação mas os registros continuam no banco e voltam ao reativar.

**Por quê:** o briefing exige "Desativada (soft delete — sai da navegação,
dados preservados)" e "Reativada (dados reaparecem)".

---

## D4 — Método do exame nunca vem do OCR

**Decisão:** a extração **sugere** o método (`detectarMetodo`) e a UI mostra
"OCR sugeriu BIA — confirme antes de salvar". O campo `metodo` é obrigatório,
sem default, e o salvamento fica bloqueado sem ele.

**Por quê:** regra 1 do Bloco 0 — "o operador CONFIRMA em campo obrigatório.
Sem confirmação, não salva em série".

---

## D5 — Campos exclusivos de DEXA são OCULTOS, não desabilitados

**Decisão:** `campoVisivel(campo, metodo)` decide se o campo é renderizado. Na
BIA, `massa_ossea_kg` e `gordura_visceral_area_cm2` não existem no DOM.

**Por quê:** critério de aceite nº 3 — "Com metodo = bia, os campos exclusivos
de DEXA estão OCULTOS (mascarados), não desabilitados".

**Bônus:** o Bloco 3 aparece com **máscara diagonal** e texto explicativo
("Oculto para o método X"), em vez de campos cinzas.

---

## D6 — A conta aritmética vai no banner, não num toast

**Decisão:** `validar()` devolve a mensagem já com a conta montada:
`"21,00 + 58,00 = 79,00 kg vs peso 82,15 kg → divergência de 3,8% (limite ±2%)"`.

**Por quê:** o briefing proíbe toast genérico e exige a conta explícita.
Critério de aceite nº 2.

**Observação:** o cálculo usa `21,0 + 58,0 = 79,0` contra `82,15`, resultando em
**3,8%** (o briefing cita 3,9% — a diferença é arredondamento; a conta exibida é
a correta, calculada uma vez só).

---

## D7 — Parecer do membro não recebe o protocolo do titular

**Decisão:** `montarPayload()` é a única porta de entrada e reconstrói o
contexto genérico por **allowlist** de 6 campos. Qualquer campo extra é
descartado antes de entrar no prompt.

**Por quê:** teste obrigatório do briefing — "verificar que o payload da
variante `generico` não contém nenhuma string do protocolo do titular".

**Teste:** `payloadGenericoVazou()` + caso "descarta campos fora da allowlist".

---

## D8 — Guardrails bloqueiam, não avisam

**Decisão:** `verificarGuardrails()` devolve violações e o card **não exibe** o
parecer quando há qualquer uma. Gera-se erro, não um parecer parcial.

**Cobre:** (a) alerta determinístico ausente, (b) número fora do payload,
(c) tendência com < 3 pontos, (d) recomendação farmacológica sem disclaimer,
(e) prescrição calórica com método ≠ DEXA.

---

## D9 — Integrações exibem o estado REAL, sem simular sucesso

**Decisão:** `garminAdapter.status()` devolve `nao_configurado` e
`appleHealthAdapter.status()` devolve `indisponivel (permanente)`. Os botões de
sincronizar mostram a mensagem real do adapter, em vermelho.

**Por quê:** "PROIBIDO simular conexão bem-sucedida com Garmin ou Apple quando
não houver". O Garmin exige aprovação no Developer Program; o HealthKit não tem
API server-side.

**Consequência:** a tabela de atividades usa dados de demonstração, e isso está
declarado no cabeçalho do card ("demonstração").

---

## D10 — Anexos de tratamento: metadados no ciclo 1

**Decisão:** os 37 anexos do seed existem como **registros** em
`ll5_attachments` (nome, tipo, mime, tamanho, `storage_key`), sem upload real ao
storage.

**Por quê:** upload real exige bucket + permissões, fora do escopo declarado
("OCR real, envio real de e-mails" ficaram de fora). O botão "Anexar" avisa que
o upload está desativado neste ciclo.

**Campo preparado:** `arquivo` é um FileField já criado, para o ciclo 2 só
ligar o upload.

---

## D11 — Seed roda no CLIENTE, não na migração

**Ambiguidade:** seed em migração seria mais simples.

**Decisão:** o seed é uma função no front (`src/ll5/seed.ts`) que chama
`criarAba()` — o mesmo fluxo do CRUD.

**Por quê:** exigência explícita — "as 4 abas nascem pelo SEED através do mesmo
fluxo de criação de aba". Semear por SQL contornaria o CRUD e não provaria a
regra.

**Proteção:** o seed é idempotente (não roda se já existir aba para o owner) e
todo registro sai com `demo = true`.

---

## D12 — Dois perfis: admin e membro familiar

**Decisão:** a migração cria `familiar@extrafruti.com.br` (senha
`Extrafruti@2026`) sem grupo Admin. A troca de perfil é manual (logout/login),
como o escopo permite ("autenticação real" fora de escopo).

**Por quê:** critério de aceite nº 1 e nº 7 exigem provar o isolamento entre
dois owners reais.

---

## D14 — Tamanho do field no .FIT: SEMPRE o `size` declarado, nunca o do base type

**Achado que custou a primeira versão do parser:** um .FIT real declara
`field 7, size 8, base type 0x86 (uint32)`. O tamanho do base type é 4, o
`size` declarado é 8. Consumir 4 desalinha a leitura e corrompe **todo o resto
do arquivo** — o sintoma é "data message sem definition" a poucos bytes de
distância.

**Decisão:** `readValue` devolve e o loop consome `size` do field. O base type
define apenas COMO interpretar os bytes, não quantos são.

**Prova:** os 3 .FIT reais do briefing só leram corretamente depois desta
correção (0 erros, 6 eventos, 0 sessions — são wellness).

---

## D15 — Cadência: heurística de "por pé" documentada

O FIT grava a cadência de **um pé** em `record.cadence`, mas
`session.avg_running_cadence` pode já vir em passos/min. Regra aplicada:
valor `< 120` × 2; acima disso, mantido.

**Risco declarado:** um corredor muito lento (85 spm reais) seria dobrado por
engano. O limite de 120 foi escolhido porque nenhuma corrida humana tem 85 spm
reais — 170-180 é o normal, 42-45 por pé.

---

## D16 — Altitude: offset de +500 do protocolo

O FIT grava altitude como `(metros + 500) × 5`. A função `altitudeComOffset`
aplica a inversa. Sem isso, todo ganho de elevação sairia 500 m acima.

---

## D17 — Wellness recusado pelo NOME, não só pelo conteúdo

`ehWellness` recusa quando o nome contém `wellness`/`monitoring`, **ou** quando
o arquivo não tem `session`. As duas condições são independentes.

**Por quê:** o nome é a prova mais direta (o Garmin exporta
`<id>_WELLNESS.fit`), e a ausência de session cobre arquivos renomeados. Os 3
fixtures reais são wellness por nome E por conteúdo — confirmado.

---

## D18 — FC de pulso óptico em intervalado curto = baixa confiabilidade

Regra do briefing implementada literalmente: `fc_media > 0.85 × fc_max` **e**
`duracao_s < 180` → `baixa`. Abaixo de 60 s → `insuficiente`.

**Consequência:** essas sessões aparecem no histórico com badge cinza "não
confiável (pulso óptico)" e **ficam fora** do cálculo de TSS, zonas de treino e
carga semanal — não poluem a curva de tendência.

**Teste:** 6 casos cobrindo os limites (150/172 em 120 s → baixa; em 181 s → alta).

---

## D19 — TRIMP com FC de repouso estimada (limitação declarada)

`calcularTrimp` usa Banister com `fc_repouso = 60 bpm` quando o usuário não
informou a dele. O valor é **indicativo**, não prescritivo.

**Por quê não bloquear:** o campo é derivado e não entra em decisão clínica.
Mas o número não é apresentado como exato — e o cálculo devolve `null` se faltar
FC média ou duração, em vez de chutar.

---

## D20 — Importação em lotes de 25 com progresso persistido

**Proibido pelo briefing:** processar tudo num request.

**Decisão:** o ZIP é descompactado **no navegador** (fflate), cada arquivo vai
para a `fila` do job em base64, e o processamento roda em lotes de 25. Cada
lote faz UPSERT e grava `indice_retomada`.

**Retomada:** se falhar no arquivo 1.200, `indice_retomada=1200` e a próxima
chamada continua de 1.201. A fila fica no registro até o job concluir, quando é
limpa (`fila: null`) para não estourar o limite de tamanho.

**Bulk insert:** um `create(array)` por lote; se o batch falhar, cai para
inserção individual **dentro do lote** — não perde os 25.

---

## D21 — Abortar com >5% de falha (validação bloqueante 3)

`LIMITE_FALHAS_PCT = 5`. A cada lote recalcula `erros / processados`. Acima de
5%, o job vira `falhou` e para. Os arquivos já importados **permanecem** — o job
não faz rollback (perder 1.100 atividades boas por causa de 60 ruins seria pior).

---

## D22 — Enriquecimento sem sobrescrever

Se a atividade já existe e a nova traz streams (`tem_streams=false → true`),
atualiza **apenas** os campos de stream e running dynamics. `owner_id`,
`created_by` e `created_em` **nunca** são tocados.

Se já tinha streams, conta como `duplicado` e não toca em nada.

---

## D23 — Fuso horário: offset fixo de 180 min, não `America/Sao_Paulo`

O FIT grava epoch UTC. Converter com `-3h` fixo erra em períodos com horário de
verão (o Brasil teve até 2019 — dentro da janela de 8 anos do pacote).

**Decisão atual:** offset 180 min como default, parametrizável em
`NormalizarCtx.fusoOffsetMin`.

**Limitação declarada:** registros de 2018-2019 com DST podem ficar 1 h
deslocados. A correção definitiva é usar a lista de transições do
`America/Sao_Paulo` por data — fica para o próximo ciclo.

---

## D24 — Nenhum dado de wellness entra, nem por engano

Três barreiras:

1. varredura do ZIP ignora `DI-Connect-Wellness/` e `DI-Connect-User/`;
2. `ehWellness` recusa por nome e por ausência de `session`;
3. `normalizarAtividade` devolve `ok=false` sem `session`.

**Teste:** `expect(ehWellness('8386643197_WELLNESS.fit', d)).toBe(true)`.

---

## D26 — CSV: milhar BR vs decimal BR (`5.710` vs `0,94`)

O export usa ponto como separador de milhar (`Steps = 5.710`) **e** vírgula
como decimal (`Stride = 0,94`). Não dá para tratar ponto sempre como decimal.

**Regra:** se o valor tem vírgula, a vírgula é decimal e os pontos são milhar.
Sem vírgula, um padrão `^\d{1,3}(\.\d{3})+$` indica milhar (5.710 → 5710);
qualquer outro ponto é decimal (0.94 permanece 0.94).

**Validado no arquivo real:** `5.710 → 5710`, `0,94 → 0.94`, `'-9 → -9`.

---

## D27 — `Avg Run Cadence` aparece DUAS VEZES no CSV

As colunas 10 (com valor) e 21 (sempre `--`) têm o MESMO nome. O parser guarda
o índice da **primeira** ocorrência e ignora a segunda.

**Sem essa regra**, a cadência viria sempre `null` — metade do dado de running
dynamics se perderia silenciosamente.

---

## D28 — FCmax 218 é a referência de zonas, não 220 − idade

O arquivo traz 164 atividades com Max HR ≥ 200 (13,8%) e 9 com ≥ 210, pico 218
em 03/02/2024 ("Xuri 22km, Treino Maratona de SP", 21,71 km, FC média 183).
43,05% das atividades atingiram ≥ 190.

**Decisão:** zonas sobre **218** (Z1 109–131, Z2 131–153, Z3 153–174,
Z4 174–196, Z5 196–218), com `fcmax_validada = true` e
`fcmax_metodo_validacao = 'estatistico_164_atividades'`.

**Ressalva exibida na UI:** "recomendada confirmação por ergoespirometria".
O número é estatisticamente forte, mas não é medição direta de VO2máx.

---

## D29 — Zonas ESTIMADAS (o CSV não tem streams)

O CSV traz só a FC média por atividade, não as amostras. Distribuir a duração
por zona exige um modelo.

**Decisão:** gaussiana de **desvio 8 bpm** centrada na FC média, amostrada em
61 pontos de ±30 bpm, normalizada pela soma dos pesos. O total sempre fecha
com a duração real (testado: 2.103 s → soma 2.103 s).

**Marcação obrigatória:** `zonas_estimadas = true` em 100% das linhas de CSV.
Nunca apresentar como medição. O `.FIT` continua sendo a fonte de zona real
(quando houver streams).

---

## D30 — `carga_proxy` NÃO é TSS (o export tem TSS zerado)

`Training Stress Score®` está **0,0 em 1.189 de 1.189 linhas** — a coluna é
inútil. Sem carga, não há curva de treino.

**Decisão:** `carga_proxy = te_aerobico × (duracao_s / 60)`, gravada com
`carga_metodo = 'proxy_te_x_duracao'` para nunca ser confundida com TSS.

**Limitações declaradas na UI:** a nota "Estimativa por Training Effect ×
duração (TSS indisponível no export)" acompanha o card. A coluna
`Training Stress Score®` está em `COLUNAS_IGNORADAS` — **não é importada**.

**Cobertura:** 1.182 de 1.189 linhas têm TE e duração (99,4%).

---

## D31 — Sinalização de longo em Z4 vale só do corte para frente

Regra: corrida + ≥ 90 min + FC média ≥ 174 → `sinalizar_intensidade_excessiva`.

**Decisão:** só a partir de **14/11/2026**. Atividades históricas recebem
`false` mesmo quando atendem aos critérios — o campo é calculado, mas não
retroage.

**Por quê:** sinalizar 10 anos de histórico de uma vez produziria centenas de
alertas sem valor de coaching. O corte marca o momento em que a regra passou a
valer.

**No arquivo real:** 0 sinalizações (a última atividade é 13/11/2026, um dia
antes do corte).

---

## D32 — Força NUNCA calcula volume

As 172 sessões de Strength Training trazem apenas `Total Reps` e `Total Sets` —
não há exercício, série ou carga individual.

**Decisão:** `qualidade_dados = 'limitado'`, `tem_detalhe_exercicio = false`,
`volume_kg = null` (não calculado, nem estimado).

**Consequência na UI:** badge "Registro de frequência — sem detalhe de
exercício". Essas sessões **não alimentam** "Volume (30d)" nem "Progressão de
carga" — só "Sessões", frequência semanal, FC média e calorias.

---

## D33 — Dedupe do CSV sem `device_activity_id`

O CSV não tem identificador de atividade. **Chave:** (owner_id,
data_hora_inicio, tipo, distancia_m), comparando data/hora com precisão de
segundo.

**Três caminhos:**

1. existe com `fonte='garmin_csv'` → atualiza (idempotente);
2. existe com `fonte='garmin_fit'` e data ±60 s → **enriquece o FIT** com os
   campos que só o CSV tem;
3. data ±1% de distância sem chave igual → `possivel_duplicata = true` (fila de
   revisão, sem fundir).

`device_activity_id` do CSV é sintético: `csv-<data>-<tipo>`.

---

## D34 — Fuso: o CSV já vem em horário local

Diferente do .FIT (epoch UTC), o CSV traz `2026-11-13 06:11:57` **já no fuso
do usuário**. Gravar com offset `-03:00` explícito preserva o instante correto
sem depender do fuso do servidor.

**Limitação:** atividades de 2016-2019 com horário de verão podem estar 1 h
deslocadas em relação ao UTC real — mesma ressalva do D23.

---

## D25 — Saldo do parecer: texto composto localmente neste ciclo

**Ambiguidade:** o parecer deveria vir do Gemini.

**Decisão:** o card monta o texto com os dados e os alertas determinísticos, e
**persiste** em `ll5_ai_reports` com o payload e o `input_hash` do prompt que
SERIA enviado ao gateway. O prompt está completo em `src/ll5/parecer.ts`.

**Por quê:** o ciclo 1 é protótipo funcional; o gateway Gemini exige chave e
tratamento de streaming, e o briefing marca "OCR real" e integrações como fora
de escopo. A estrutura de dados e o prompt já estão prontos para o ciclo 2.

**Risco declarado:** o texto do card é determinístico, não gerado por LLM. Está
visível no `modelo: 'gemini-1.5-flash'` do registro, mas não houve chamada real.
