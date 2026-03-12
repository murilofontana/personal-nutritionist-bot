# Design: Bot Nutricionista Telegram

**Data:** 2026-03-12  
**Status:** Aprovado pelo usuário  
**Autor:** >[SEU NOME] Fontana

---

## Contexto

>[SEU NOME] usa um prompt de nutricionista no Perplexity para acompanhar calorias e macros ao longo do dia. O objetivo é transformar esse fluxo em um bot Telegram pessoal, mais conveniente e com funcionalidades adicionais (atualização de peso, edição de metas, resumos diários e semanais).

---

## Objetivo

Construir um bot Telegram de uso pessoal (single-user) em Node.js que:

1. Receba descrições de refeições em linguagem natural e calcule calorias/macros usando LLM.
2. Persista o log do dia em SQLite para sobreviver a reinicializações.
3. Forneça resumos diários e semanais com visualização textual (barras ASCII).
4. Permita atualizar peso, metas e a dieta padrão via comandos.
5. Seja configurável para diferentes provedores de LLM via variável de ambiente.
6. Seja Docker-ready para facilitar migração para VPS futura.

---

## Arquitetura

### Stack

- **Runtime:** Node.js 20+
- **Biblioteca Telegram:** `grammy` (moderna, TypeScript-friendly)
- **Banco de dados:** SQLite via `better-sqlite3` (síncrono, zero-config)
- **LLM:** abstração plugável — suporta Groq, OpenAI e Google Gemini
- **Configuração:** arquivo `.env` na raiz
- **Containerização:** `Dockerfile` + `docker-compose.yml`

### Estrutura de arquivos

```
nutricionista/
├── src/
│   ├── bot.js              # Inicialização do bot e registro de handlers
│   ├── commands/
│   │   ├── dia.js          # /dia — zera contadores do dia
│   │   ├── status.js       # /status — saldo rápido do dia
│   │   ├── hoje.js         # /hoje — resumo diário detalhado
│   │   ├── semana.js       # /semana — resumo semanal
│   │   ├── peso.js         # /peso [X] — atualiza peso
│   │   ├── dieta.js        # /dieta — edita metas/dieta padrão
│   │   └── exercicio.js    # /exercicio — registra treino (+250 kcal)
│   ├── handlers/
│   │   └── meal.js         # Handler de mensagem livre (refeição)
│   ├── llm/
│   │   ├── index.js        # Fábrica de provedor LLM
│   │   ├── groq.js         # Provedor Groq
│   │   ├── openai.js       # Provedor OpenAI
│   │   └── gemini.js       # Provedor Google Gemini
│   ├── db/
│   │   ├── index.js        # Conexão e inicialização do SQLite
│   │   └── queries.js      # Queries reutilizáveis
│   └── utils/
│       ├── format.js       # Formatação de tabelas e barras ASCII
│       └── prompt.js       # Monta o contexto completo para o LLM
├── data/
│   └── nutricionista.db    # Banco SQLite (gerado automaticamente)
├── prompt_atual.txt        # System prompt atual (carregado na inicialização)
├── .env.example
├── Dockerfile
├── docker-compose.yml
└── package.json
```

---

## Fluxo de uma mensagem de refeição

```
Usuário: "comi 150g de frango com batata cozida"
         ↓
1. Middleware verifica ALLOWED_TELEGRAM_USER_ID
         ↓
2. Bot busca no SQLite: log do dia atual + perfil + dieta
         ↓
3. Bot monta contexto para o LLM:
   - system: perfil completo (dados pessoais, metas, dieta padrão, regras)
   - user context: "Hoje você já consumiu: X kcal | Yg prot | ..."
   - user message: "comi 150g de frango com batata cozida"
         ↓
4. LLM retorna JSON estruturado:
   {
     "kcal": 390,
     "prot": 37,
     "carbo": 32,
     "fat": 11,
     "dentro_da_dieta": "sim",
     "avaliacao": "Dentro da meta. Proteína adequada.",
     "recomendacao": "Lanche A ou B à tarde + jantar padrão fecha bem o dia."
   }
         ↓
5. Se o LLM retornar JSON inválido: bot tenta novamente uma vez com instrução explícita de retornar apenas JSON. Se falhar na segunda tentativa, responde com erro amigável e não salva nada.
         ↓
6. Bot salva refeição no SQLite
         ↓
7. Bot responde formatado no Telegram
```

### Resposta formatada no Telegram

```
✅ Almoço — frango + batata
┌──────────────┬─────────┐
│ Calorias     │ 390 kcal│
│ Proteína     │ 37g     │
│ Carboidrato  │ 32g     │
│ Gordura      │ 11g     │
└──────────────┴─────────┘

Dentro da dieta? Sim ✅

Saldo restante no dia:
• Calorias: 710 kcal
• Proteína: 58g
• Carbo:    58g
• Gordura:  24g

Sugestão: Lanche A ou B à tarde + jantar padrão fecha bem o dia.
```

---

## Comandos

| Comando | Descrição | Usa LLM? |
|---|---|---|
| Texto livre | Registrar refeição/alimento | Sim |
| `/dia` | Apaga os registros do dia atual e recomeça do zero | Não |
| `/status` | Mostra saldo do dia (rápido) | Não |
| `/exercicio` | Registra treino (+250 kcal adicionados à meta do dia) | Não |
| `/peso 94.5` | Atualiza o peso atual no perfil | Não |
| `/dieta` | Inicia fluxo de edição de metas e dieta padrão | Não |
| `/hoje` | Resumo detalhado do dia com barras ASCII | Não |
| `/semana` | Resumo dos últimos 7 dias com gráfico e médias | Não |

### Semântica do `/dia`

O comando `/dia` **apaga todos os registros de refeições e ajustes do dia atual** (registros com `date = hoje`). Serve para recomeçar do zero quando o usuário esqueceu de zerar ou registrou algo errado. A mudança de dia ocorre naturalmente pela data — `/dia` é um reset manual explícito.

### Fluxo do `/dieta`

O comando `/dieta` apresenta um menu com duas opções:

1. **Editar metas numéricas** — bot envia os valores atuais e pede os novos um a um (kcal, prot, carbo, fat). Cada valor é confirmado antes de salvar.
2. **Substituir dieta padrão** — bot pede que o usuário cole o novo texto completo da dieta (system prompt). O texto é salvo na tabela `diet_plan` e passa a ser usado em todas as chamadas ao LLM.

### Semântica dos ajustes de exercício

Quando o usuário registra um exercício via `/exercicio`, um registro é inserido em `day_adjustments` com `extra_kcal = 250`. Nos cálculos de saldo do dia (usados em `/status`, `/hoje` e no contexto enviado ao LLM), a **meta calórica efetiva** é:

```
meta_efetiva = target_kcal + SUM(extra_kcal WHERE date = hoje)
```

Ou seja, exercício **aumenta a meta** do dia, dando mais margem calórica.

### `prompt_atual.txt` vs tabela `diet_plan`

Na primeira execução do bot, se a tabela `diet_plan` estiver vazia, o conteúdo de `prompt_atual.txt` é importado automaticamente como dieta padrão inicial. Após isso, o arquivo `prompt_atual.txt` não é mais lido — toda edição futura ocorre via `/dieta` e é persistida na tabela `diet_plan`. Isso garante que o bot sempre use a versão mais recente editada pelo usuário.

---

## Resumo diário — `/hoje`

```
📊 Resumo do dia — Qui 12/03/2026

Refeições registradas:
  • 12:30 — Almoço: frango + batata (390 kcal)
  • 16:00 — Lanche A: whey + fruta (215 kcal)

Totais vs Meta:
  Calorias  ████████░░  605 / 1100 kcal (55%)
  Proteína  ███████░░░   63 / 95g   (66%)
  Carbo     ████████░░   49 / 90g   (54%)
  Gordura   ██████░░░░   13 / 35g   (37%)

Status: ✅ dentro da meta
Faltam: 495 kcal | 32g prot | 41g carbo | 22g fat
```

---

## Resumo semanal — `/semana`

```
📅 Semana 06/03 – 12/03/2026

Calorias por dia:
  Seg  ██████████  1082 kcal ✅
  Ter  ████████░░   890 kcal ⚠️ abaixo da meta
  Qua  ██████████  1095 kcal ✅
  Qui  █████░░░░░   605 kcal (em andamento)
  Sex  ──────────  sem registro
  Sáb  ██████████  1120 kcal ✅
  Dom  █████████░  1050 kcal ✅

Médias (dias completos):
  Calorias: 1047 kcal/dia  ✅
  Proteína:   88g/dia      ⚠️ abaixo de 120g em 2 dias
  Carbo:      91g/dia      ✅
  Gordura:    29g/dia      ✅

Dias dentro da meta calórica: 4 / 6  ✅
Dias com proteína baixa (< 120g):  2 🔴
Peso: 95.0kg → 94.5kg  (-0.5kg na semana)
```

---

## Banco de dados (SQLite)

### Tabela `meals`

```sql
CREATE TABLE meals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL,        -- 'YYYY-MM-DD'
  time        TEXT NOT NULL,        -- 'HH:MM'
  description TEXT NOT NULL,
  kcal        REAL NOT NULL,
  prot        REAL NOT NULL,
  carbo       REAL NOT NULL,
  fat         REAL NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Tabela `profile`

```sql
CREATE TABLE profile (
  id           INTEGER PRIMARY KEY DEFAULT 1,
  weight       REAL,
  target_kcal  REAL NOT NULL DEFAULT 1100,
  target_prot  REAL NOT NULL DEFAULT 95,
  target_carbo REAL NOT NULL DEFAULT 90,
  target_fat   REAL NOT NULL DEFAULT 35,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Tabela `diet_plan`

```sql
CREATE TABLE diet_plan (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  content    TEXT NOT NULL,   -- system prompt completo (editável via /dieta)
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Tabela `day_adjustments`

```sql
CREATE TABLE day_adjustments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,   -- 'YYYY-MM-DD'
  extra_kcal REAL NOT NULL DEFAULT 0,  -- ex: +250 por exercício
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Provedor LLM (abstração)

Cada provedor implementa a mesma interface:

```js
// interface esperada
async function chat({ systemPrompt, userContext, userMessage }) {
  // retorna string JSON com { kcal, prot, carbo, fat, dentro_da_dieta, avaliacao, recomendacao }
}
```

Seleção via `.env`:

```
LLM_PROVIDER=groq   # groq | openai | gemini
GROQ_API_KEY=...
OPENAI_API_KEY=...
GEMINI_API_KEY=...
```

Modelos padrão por provedor:
- **Groq:** `llama-3.3-70b-versatile`
- **OpenAI:** `gpt-4o-mini`
- **Gemini:** `gemini-1.5-flash`

---

## Segurança

- Variável `ALLOWED_TELEGRAM_USER_ID` no `.env`: middleware rejeita qualquer mensagem de outro usuário com uma resposta genérica.
- Banco SQLite fica no diretório `data/`, mapeado como volume no Docker.
- Chaves de API nunca commitadas (`.env` no `.gitignore`).

---

## Privacidade e dados enviados ao LLM

Toda chamada ao LLM inclui o perfil completo (dados pessoais, metas, dieta padrão). Isso é equivalente ao uso atual no Perplexity. Os comandos `/status`, `/hoje`, `/semana`, `/peso` e `/exercicio` **não fazem chamadas ao LLM** e são seguros.

---

## Configuração (.env.example)

```env
TELEGRAM_TOKEN=seu_token_aqui
ALLOWED_TELEGRAM_USER_ID=seu_id_telegram_aqui

LLM_PROVIDER=groq
GROQ_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

# Opcional: override dos modelos padrão
LLM_MODEL=
```

---

## Docker

O `Dockerfile` e `docker-compose.yml` montam o banco SQLite como volume externo para que os dados persistam entre redeploys:

```yaml
volumes:
  - ./data:/app/data
```

---

## O que está fora do escopo (v1)

- Interface web ou dashboard
- Suporte a múltiplos usuários
- Banco de alimentos local (TACO/USDA)
- Notificações automáticas (lembrete de refeição)
- Integração com balança inteligente
