import { MempoolTickReadService } from '../mempool-tick-read.service';

describe('MempoolTickReadService — bind/release lifecycle', () => {
  function makeMempool() {
    return {
      hasTransaction: jest.fn().mockReturnValue(true),
      isTransactionLoaded: jest.fn().mockReturnValue(true),
      getTransactionMetadata: jest.fn().mockReturnValue({ hash: '0xa', from: '0x1', to: '0x2', nonce: 0, value: '0', gas: 21000 }),
      getStats: jest.fn().mockReturnValue({ total: 1, loaded: 1, providers: 1, nonceIndex: 0 }),
      getLastUpdatedMs: jest.fn().mockReturnValue(1234),
      iterLoadedTx: jest.fn().mockImplementation(function* () {
        yield { hash: '0xa', metadata: { hash: '0xa' } };
        yield { hash: '0xb', metadata: { hash: '0xb' } };
      }),
      forEachLoadedTx: jest.fn().mockImplementation(async (cb: any) => {
        await cb({ hash: '0xa', metadata: { hash: '0xa' } });
        await cb({ hash: '0xb', metadata: { hash: '0xb' } });
      }),
    };
  }

  it('throws when read methods called without bind', async () => {
    const svc = new MempoolTickReadService();
    await expect(svc.hasTransaction('0xa')).rejects.toThrow(/is not bound/);
    await expect(svc.isTransactionLoaded('0xa')).rejects.toThrow(/is not bound/);
    await expect(svc.getTransactionMetadata('0xa')).rejects.toThrow(/is not bound/);
    await expect(svc.getStats()).rejects.toThrow(/is not bound/);
    await expect(svc.getLastUpdatedMs()).rejects.toThrow(/is not bound/);
    await expect(svc.checkTransaction('0xa')).rejects.toThrow(/is not bound/);
    await expect(svc.forEachLoadedTx(() => {})).rejects.toThrow(/is not bound/);

    // iterLoadedTx is a generator — error is thrown on first iteration step.
    await expect(async () => {
      for await (const _ of svc.iterLoadedTx()) {
        // unreachable
      }
    }).rejects.toThrow(/is not bound/);
  });

  it('delegates to the bound model', async () => {
    const svc = new MempoolTickReadService();
    const model = makeMempool();
    svc.bind(model as any);

    expect(await svc.hasTransaction('0xa')).toBe(true);
    expect(model.hasTransaction).toHaveBeenCalledWith('0xa');

    expect(await svc.isTransactionLoaded('0xa')).toBe(true);
    expect(model.isTransactionLoaded).toHaveBeenCalledWith('0xa');

    await svc.getStats();
    expect(model.getStats).toHaveBeenCalled();

    const items: any[] = [];
    for await (const it of svc.iterLoadedTx()) items.push(it);
    expect(items).toHaveLength(2);

    const cb = jest.fn();
    await svc.forEachLoadedTx(cb);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('release clears the binding — subsequent calls throw again', async () => {
    const svc = new MempoolTickReadService();
    svc.bind(makeMempool() as any);
    await svc.hasTransaction('0xa');

    svc.release();
    await expect(svc.hasTransaction('0xa')).rejects.toThrow(/is not bound/);
  });

  it('bind → release → bind to a different model uses the new one', async () => {
    const svc = new MempoolTickReadService();
    const first = makeMempool();
    const second = makeMempool();

    svc.bind(first as any);
    await svc.hasTransaction('0xa');
    expect(first.hasTransaction).toHaveBeenCalled();

    svc.release();
    svc.bind(second as any);
    await svc.hasTransaction('0xb');
    expect(second.hasTransaction).toHaveBeenCalledWith('0xb');
    // First model not called a second time
    expect(first.hasTransaction).toHaveBeenCalledTimes(1);
  });

  it('checkTransaction returns full structure when tx exists and is loaded', async () => {
    const svc = new MempoolTickReadService();
    const model = makeMempool();
    svc.bind(model as any);

    const result = await svc.checkTransaction('0xa');
    expect(result).toMatchObject({ hash: '0xa', exists: true, isLoaded: true });
    expect(result.metadata).toBeDefined();
  });

  it('checkTransaction handles non-existent tx', async () => {
    const svc = new MempoolTickReadService();
    const model = makeMempool();
    model.hasTransaction.mockReturnValue(false);
    svc.bind(model as any);

    const result = await svc.checkTransaction('0xdeadbeef');
    expect(result).toMatchObject({ hash: '0xdeadbeef', exists: false, isLoaded: false, metadata: undefined });
    expect(model.isTransactionLoaded).not.toHaveBeenCalled();
    expect(model.getTransactionMetadata).not.toHaveBeenCalled();
  });
});
