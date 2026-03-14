import type { BotContext } from '../types';

/**
 * Sends a "typing..." indicator to the chat and keeps renewing it every 4 seconds
 * while `fn` is executing. Stops as soon as `fn` resolves or rejects.
 *
 * Telegram hides the typing indicator after ~5 seconds, so 4s renewal keeps it
 * visible for the full duration of slow LLM calls.
 */
export async function withTyping<T>(
  ctx: Pick<BotContext, 'replyWithChatAction'>,
  fn: () => Promise<T>,
): Promise<T> {
  let active = true;

  const loop = async (): Promise<void> => {
    while (active) {
      void ctx.replyWithChatAction('typing');
      await new Promise<void>(r => setTimeout(r, 4000));
    }
  };

  // Fire-and-forget: loop runs concurrently with fn
  void loop();

  try {
    return await fn();
  } finally {
    active = false;
  }
}
