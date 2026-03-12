# personal-nutritionist-bot

Bot pessoal para Telegram que registra refeições em texto livre, analisa macros com uma LLM e acompanha o progresso da dieta ao longo do dia e da semana.

## O que faz

Você manda uma mensagem descrevendo o que comeu — "frango com batata e salada" — e o bot:

1. Envia a refeição para uma LLM (Groq, OpenAI ou Gemini) junto com seu plano de dieta e saldo do dia
2. Recebe de volta calorias + macros + avaliação se está dentro da dieta
3. Salva o registro no banco local (SQLite)
4. Responde com o resumo da refeição e o quanto ainda resta para comer no dia

Além do registro de refeições, há comandos para consultar o resumo do dia, ver o histórico da semana, registrar treinos, atualizar o peso e editar metas.

## Comandos disponíveis

| Comando | O que faz |
|---|---|
| `<texto livre>` | Registra uma refeição e analisa macros |
| `/hoje` | Resumo detalhado do dia com barras de progresso |
| `/status` | Saldo rápido de calorias e macros |
| `/semana` | Resumo dos últimos 7 dias com médias |
| `/exercicio` | Registra treino (+250 kcal na meta do dia) |
| `/peso 94.5` | Atualiza o peso e salva no histórico |
| `/dieta` | Edita metas numéricas ou o texto da dieta |
| `/dia` | Zera todos os registros do dia atual |

## Pré-requisitos

- Node.js 20+
- Token de bot do Telegram ([@BotFather](https://t.me/BotFather))
- Seu ID de usuário do Telegram (o bot só aceita mensagens do seu ID)
- Chave de API de pelo menos um provedor LLM: [Groq](https://console.groq.com), [OpenAI](https://platform.openai.com) ou [Google Gemini](https://aistudio.google.com)

## Configuração

Copie o arquivo de exemplo e preencha as variáveis:

```bash
cp .env.example .env
```

```dotenv
TELEGRAM_TOKEN=seu_token_aqui
ALLOWED_TELEGRAM_USER_ID=seu_id_telegram_aqui

# Escolha o provedor: groq | openai | gemini
LLM_PROVIDER=groq

GROQ_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

# Opcional: sobrescreve o modelo padrão do provedor
LLM_MODEL=
```

Modelos padrão por provedor: `llama-3.3-70b-versatile` (Groq), `gpt-4o-mini` (OpenAI), `gemini-1.5-flash` (Gemini).

### Plano de dieta

O arquivo `prompt_atual.txt` na raiz é usado como system prompt da LLM. Ele é carregado automaticamente no banco na primeira execução. Você pode editar esse arquivo antes de rodar pela primeira vez, ou usar o comando `/dieta` para atualizar o texto depois que o bot já estiver rodando.

## Como rodar

### Desenvolvimento local

```bash
npm install
npm start        # roda com tsx (sem compilar)
```

### Produção com Docker Compose

```bash
docker compose up -d --build
```

O banco SQLite fica em `./data/nutricionista.db`, montado como volume para persistir entre reinicializações.

### Produção manual (sem Docker)

```bash
npm install
npm run build    # compila TypeScript → dist/
node dist/bot.js
```

## Desenvolvimento

```bash
npm test         # roda os testes com Jest
npm run build    # compila TypeScript (verifica tipos + gera dist/)
```

### Estrutura do projeto

```
src/
  bot.ts                  # entry point — inicializa bot, middlewares e comandos
  types/index.ts          # interfaces compartilhadas
  db/
    index.ts              # abertura do banco e schema
    queries.ts            # todas as queries SQL
  llm/
    index.ts              # factory que seleciona o provedor
    groq.ts / openai.ts / gemini.ts
  utils/
    format.ts             # formatação das mensagens de resposta
    prompt.ts             # montagem do system prompt e contexto do usuário
  commands/               # um arquivo por comando do bot
  handlers/
    meal.ts               # handler de texto livre (registro de refeição)
tests/
  utils/                  # testes de format e prompt
  db/                     # testes das queries
  llm/                    # testes dos provedores LLM (com mocks)
```
