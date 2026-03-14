# Design: Photo Meal Analysis

**Date:** 2026-03-13  
**Status:** Approved  
**Scope:** Add image/photo support to the personal-nutritionist-bot so the LLM can read nutritional labels or identify food in photos and return calorie + macro data.

---

## Problem

The bot currently only handles `message:text` events. When the user sends a photo (e.g. a food package nutritional label with the caption "Comi 3 unidades de bolacha dessa"), the message is silently ignored by grammY. No feedback is given to the user.

---

## Goals

1. Accept photos in the free-text meal registration flow.
2. Accept photos inside the `/posso` conversation.
3. When no caption is provided with a photo, ask the user to add a description before registering.
4. Save the LLM-generated description (not the raw caption) as the meal record in the database.

---

## Out of Scope

- Other media types (voice, video, documents, stickers).
- Batch photo uploads (multiple photos in one message).
- Retroactive re-analysis of past meals.

---

## Architecture

### Approach: Extend existing `chat()` interface (Approach A)

Add optional image fields to the existing `LLMProvider.chat()` method. This preserves full backward compatibility (optional fields) and avoids duplicating context-building logic.

---

## Component Changes

### 1. `src/types/index.ts`

Extend `LLMProvider.chat()` params:

```ts
chat(params: {
  systemPrompt: string;
  userContext: string;
  userMessage: string;
  imageBase64?: string;    // raw base64, no data: prefix
  imageMimeType?: string;  // 'image/jpeg' | 'image/png' | 'image/webp'
}): Promise<LLMResult>;
```

Add optional field to `LLMResult`:

```ts
interface LLMResult {
  kcal: number;
  prot: number;
  carbo: number;
  fat: number;
  dentro_da_dieta: 'sim' | 'sim_com_ressalva' | 'nao';
  avaliacao: string;
  recomendacao: string;
  descricao?: string;  // LLM-generated description of identified food (images only)
}
```

---

### 2. `src/llm/gemini.ts` (primary provider)

When `imageBase64` is present, pass a parts array to `generateContent`:

```ts
const parts = [
  { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
  { text: userContent }
];
await generativeModel.generateContent({ contents: [{ role: 'user', parts }] });
```

No model change needed — `gemini-1.5-flash` supports vision natively.

---

### 3. `src/llm/openai.ts`

When `imageBase64` is present, user message content becomes an array:

```ts
[
  { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
  { type: 'text', text: userContent }
]
```

`gpt-4o-mini` supports vision natively.

---

### 4. `src/llm/groq.ts`

Same multimodal content structure as OpenAI. When `imageBase64` is present, override the model to `llama-3.2-11b-vision-preview` unless `LLM_MODEL` env var is already set to a custom value (user override takes precedence).

---

### 5. `src/utils/prompt.ts`

A new helper `buildImageContext(caption: string): string` injects an image-specific instruction into the user context string when a photo is being analyzed:

```
[IMAGEM ANEXADA] O usuário enviou uma foto. Analise a tabela nutricional ou
o alimento visível. Use a legenda para inferir a quantidade consumida.
Retorne também o campo "descricao" com o que foi identificado
(ex: "3 biscoitos Crackers Integral, ~45g").

Legenda do usuário: "<caption>"
```

This is appended to the existing `userContext` output from `buildUserContext()`, not to the system prompt, so it doesn't pollute the persistent diet plan context.

---

### 6. `src/handlers/meal.ts`

Signature change:

```ts
export function createMealHandler(q: Queries, llm: LLMProvider, botToken?: string)
```

Decision flow:

```
message received
├── message:photo
│   ├── no caption → reply asking for caption, return
│   ├── has caption
│   │   ├── download largest PhotoSize via Telegram file API
│   │   │   └── on failure → reply error, return
│   │   ├── convert ArrayBuffer → base64
│   │   ├── userMessage = caption
│   │   ├── call llm.chat({ ..., imageBase64, imageMimeType })
│   │   └── save llmResult.descricao ?? caption to DB
└── message:text → existing flow unchanged, save ctx.message.text to DB
```

Photo download:

```ts
const photo = ctx.message.photo[ctx.message.photo.length - 1]; // largest
const file  = await ctx.api.getFile(photo.file_id);
const url   = `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;
const buf   = await fetch(url).then(r => r.arrayBuffer());
const b64   = Buffer.from(buf).toString('base64');
const mime  = 'image/jpeg'; // Telegram always returns JPEG for photos
```

---

### 7. `src/commands/posso.ts`

The existing `waitFor('message')` already captures photo messages. Extend the guard:

```ts
// Before (only text):
if (!input.message.text) { ... }

// After:
const hasText  = !!input.message.text;
const hasPhoto = !!input.message.photo?.length;

if (!hasText && !hasPhoto) {
  await input.reply('Por favor, envie uma mensagem de texto ou uma foto.');
  return;
}
if (hasPhoto && !input.message.caption) {
  await input.reply('Foto recebida! Adicione uma legenda descrevendo quanto vai comer.');
  return;
}
```

When photo is present, download and pass `imageBase64` + `imageMimeType` to the existing `llm.chat()` call for the `/posso` flow.

---

### 8. `src/bot.ts`

```ts
const mealHandler = createMealHandler(q, llm, TELEGRAM_TOKEN);
bot.on('message:text',  mealHandler);
bot.on('message:photo', mealHandler);  // new
```

---

## Data Flow (photo meal registration)

```
User sends photo + caption "Comi 3 unidades de bolacha dessa"
  │
  ▼
bot.on('message:photo') → createMealHandler
  │
  ├── caption present? yes
  ├── download photo bytes from Telegram API
  ├── convert to base64
  │
  ▼
buildSystemPrompt(dietPlan)
buildUserContext(totals, extraKcal, profile) + buildImageContext(caption)
  │
  ▼
llm.chat({ systemPrompt, userContext, userMessage: caption, imageBase64, imageMimeType })
  → Gemini reads nutritional label, multiplies by 3 units
  → returns { kcal: 189, prot: 3, carbo: 27, fat: 8,
               descricao: "3 biscoitos Crackers Integral (~45g total)", ... }
  │
  ▼
q.insertMeal(today, now, llmResult.descricao, kcal, prot, carbo, fat)
  │
  ▼
formatMealResponse(llmResult.descricao, mealMacros, llmResult, remaining)
  → reply to user
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Photo without caption | Reply: "Adicione uma legenda descrevendo o que você comeu (ex: 'comi 2 unidades')." |
| Download failure | Reply: "❌ Não consegui baixar a imagem. Tente novamente." |
| LLM returns invalid JSON | Existing retry logic handles it (one retry with JSON reinforcement) |
| `descricao` missing from result | Falls back to `userMessage` (caption) for DB description |
| `kcal` is 0 or clearly wrong | Existing field validation catches it (same as text flow) |

---

## Testing

- Existing tests in `tests/llm/providers.test.ts` continue passing (new fields are optional).
- New unit tests cover:
  - `gemini.ts` with `imageBase64` present: verify multimodal parts structure
  - `openai.ts` with `imageBase64` present: verify image_url content block
  - `meal.ts`: photo without caption returns early with prompt message
  - `meal.ts`: photo with caption triggers image download + LLM call
  - `posso.ts`: photo guard logic

---

## Constraints

- `botToken` is required by the meal handler to construct the Telegram file download URL. It is passed explicitly from `bot.ts` rather than accessed globally.
- Telegram always returns photos in JPEG format regardless of the original upload format; `mimeType` is hardcoded to `'image/jpeg'`.
- The `descricao` field in `LLMResult` is only expected in responses where an image was analyzed. Text-only calls do not need to return it (field is optional).
