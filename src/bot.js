'use strict';
require('dotenv').config();

const path = require('path');
const { Bot, session }         = require('grammy');
const { conversations, createConversation } = require('@grammyjs/conversations');

const { openDatabase }        = require('./db/index');
const { createQueries }       = require('./db/queries');
const { createLLMProvider }   = require('./llm/index');

const { createDiaCommand }       = require('./commands/dia');
const { createStatusCommand }    = require('./commands/status');
const { createExercicioCommand } = require('./commands/exercicio');
const { createPesoCommand }      = require('./commands/peso');
const { createHojeCommand }      = require('./commands/hoje');
const { createSemanaCommand }    = require('./commands/semana');
const { createDietaConversation, createDietaCommand } = require('./commands/dieta');
const { createMealHandler }      = require('./handlers/meal');

// --- Validate required env vars ---
const { TELEGRAM_TOKEN, ALLOWED_TELEGRAM_USER_ID, LLM_PROVIDER } = process.env;

if (!TELEGRAM_TOKEN)          throw new Error('Missing TELEGRAM_TOKEN in .env');
if (!ALLOWED_TELEGRAM_USER_ID) throw new Error('Missing ALLOWED_TELEGRAM_USER_ID in .env');
if (!LLM_PROVIDER)             throw new Error('Missing LLM_PROVIDER in .env');

const ALLOWED_ID = parseInt(ALLOWED_TELEGRAM_USER_ID, 10);

// --- Database ---
const DB_PATH      = path.join(__dirname, '..', 'data', 'nutricionista.db');
const PROMPT_PATH  = path.join(__dirname, '..', 'prompt_atual.txt');
const db           = openDatabase(DB_PATH, PROMPT_PATH);
const q            = createQueries(db);

// --- LLM ---
const apiKeyMap = {
  groq:   process.env.GROQ_API_KEY,
  openai: process.env.OPENAI_API_KEY,
  gemini: process.env.GEMINI_API_KEY,
};
const apiKey = apiKeyMap[LLM_PROVIDER];
if (!apiKey) throw new Error(`Missing API key for LLM_PROVIDER="${LLM_PROVIDER}" in .env`);

const llm = createLLMProvider({ provider: LLM_PROVIDER, apiKey, model: process.env.LLM_MODEL });

// --- Bot ---
const bot = new Bot(TELEGRAM_TOKEN);

// Security middleware: reject all messages from other users
bot.use(async (ctx, next) => {
  if (ctx.from?.id !== ALLOWED_ID) {
    await ctx.reply('Acesso não autorizado.');
    return;
  }
  await next();
});

// Session + conversations middleware (required for /dieta)
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());
bot.use(createConversation(createDietaConversation(q), 'dieta'));

// --- Commands ---
bot.command('dia',      createDiaCommand(q));
bot.command('status',   createStatusCommand(q));
bot.command('exercicio', createExercicioCommand(q));
bot.command('peso',     createPesoCommand(q));
bot.command('hoje',     createHojeCommand(q));
bot.command('semana',   createSemanaCommand(q));
bot.command('dieta',    createDietaCommand());

bot.command('start', async (ctx) => {
  await ctx.reply(
    [
      '👋 <b>Bot Nutricionista ativo!</b>',
      '',
      'Envie qualquer refeição em texto livre para registrar.',
      '',
      '<b>Comandos disponíveis:</b>',
      '/hoje — resumo detalhado do dia',
      '/status — saldo rápido',
      '/semana — resumo dos últimos 7 dias',
      '/exercicio — registrar treino (+250 kcal na meta)',
      '/peso 94.5 — atualizar peso',
      '/dieta — editar metas ou dieta padrão',
      '/dia — zerar registros do dia',
    ].join('\n'),
    { parse_mode: 'HTML' }
  );
});

// --- Meal handler (free text) ---
bot.on('message:text', createMealHandler(q, llm));

// --- Error handler ---
bot.catch((err) => {
  console.error('[bot] Unhandled error:', err);
});

// --- Start ---
bot.start();
console.log(`[bot] Running with LLM provider: ${LLM_PROVIDER}`);
