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

## D13 — Saldo do parecer: texto composto localmente neste ciclo

**Ambiguidade:** o parecer deveria vir do Gemini.

**Decisão:** o card monta o texto com os dados e os alertas determinísticos, e
**persiste** em `ll5_ai_reports` com o payload e o `input_hash` do prompt que
SERIA enviado ao gateway. O prompt está completo em `src/ll5/parecer.ts`.

**Por quê:** o ciclo 1 é protótipo funcional; o gateway Gemini exige chave e
tratamento de streaming, e o briefing marca "OCR real" e integrações como fora
de escopo. A estrutura de dados e o prompt já estão prontos para o ciclo 2.

**Risco declarado:** o texto do card é determinístico, não gerado por LLM. Está
visível no `modelo: 'gemini-1.5-flash'` do registro, mas não houve chamada real.
