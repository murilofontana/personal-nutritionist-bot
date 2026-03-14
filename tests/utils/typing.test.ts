import { withTyping } from '../../src/utils/typing';

describe('withTyping', () => {
  let ctx: { replyWithChatAction: jest.Mock };

  beforeEach(() => {
    ctx = { replyWithChatAction: jest.fn().mockResolvedValue(undefined) };
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls replyWithChatAction immediately before the task runs', async () => {
    const task = jest.fn().mockResolvedValue('result');
    const promise = withTyping(ctx as any, task);
    // allow microtasks to flush
    await Promise.resolve();
    expect(ctx.replyWithChatAction).toHaveBeenCalledWith('typing');
    await promise;
  });

  it('returns the value from the task function', async () => {
    const task = jest.fn().mockResolvedValue('hello');
    const result = await withTyping(ctx as any, task);
    expect(result).toBe('hello');
  });

  it('re-sends typing every 4 seconds while the task is running', async () => {
    let resolveFn!: () => void;
    const task = jest.fn().mockReturnValue(new Promise<string>(r => { resolveFn = () => r('done'); }));

    const promise = withTyping(ctx as any, task);
    await Promise.resolve(); // flush initial call

    expect(ctx.replyWithChatAction).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(4000);
    await Promise.resolve();
    expect(ctx.replyWithChatAction).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(4000);
    await Promise.resolve();
    expect(ctx.replyWithChatAction).toHaveBeenCalledTimes(3);

    resolveFn();
    await promise;
  });

  it('stops sending typing after the task resolves', async () => {
    const task = jest.fn().mockResolvedValue('done');
    await withTyping(ctx as any, task);

    const callCountAfterResolve = ctx.replyWithChatAction.mock.calls.length;
    jest.advanceTimersByTime(8000);
    await Promise.resolve();
    expect(ctx.replyWithChatAction).toHaveBeenCalledTimes(callCountAfterResolve);
  });

  it('propagates errors from the task', async () => {
    const task = jest.fn().mockRejectedValue(new Error('LLM failed'));
    await expect(withTyping(ctx as any, task)).rejects.toThrow('LLM failed');
  });
});
