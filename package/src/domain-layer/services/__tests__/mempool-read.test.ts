import { MempoolReadService } from '../mempool-read.service';

describe('MempoolReadService — factory-based delegation', () => {
  function makeMempool() {
    return {
      hasTransaction: jest.fn().mockReturnValue(true),
      isTransactionLoaded: jest.fn().mockReturnValue(true),
      getTransactionMetadata: jest.fn().mockReturnValue({ hash: '0xa' }),
      getStats: jest.fn().mockReturnValue({ total: 1, loaded: 1, providers: 1, nonceIndex: 0 }),
      getLastUpdatedMs: jest.fn().mockReturnValue(42),
      iterLoadedTx: jest.fn().mockImplementation(function* () {
        yield { hash: '0xa', metadata: { hash: '0xa' } };
      }),
      forEachLoadedTx: jest.fn().mockImplementation(async (cb: any) => {
        await cb({ hash: '0xa', metadata: { hash: '0xa' } });
      }),
    };
  }

  function makeService() {
    const model = makeMempool();
    const factory = { initModel: jest.fn().mockResolvedValue(model) };
    return { svc: new MempoolReadService(factory as any), factory, model };
  }

  it('hasTransaction delegates via factory', async () => {
    const { svc, factory, model } = makeService();
    expect(await svc.hasTransaction('0xa')).toBe(true);
    expect(factory.initModel).toHaveBeenCalled();
    expect(model.hasTransaction).toHaveBeenCalledWith('0xa');
  });

  it('isTransactionLoaded delegates', async () => {
    const { svc, model } = makeService();
    expect(await svc.isTransactionLoaded('0xa')).toBe(true);
    expect(model.isTransactionLoaded).toHaveBeenCalled();
  });

  it('getTransactionMetadata delegates', async () => {
    const { svc, model } = makeService();
    expect(await svc.getTransactionMetadata('0xa')).toMatchObject({ hash: '0xa' });
    expect(model.getTransactionMetadata).toHaveBeenCalled();
  });

  it('getStats delegates', async () => {
    const { svc, model } = makeService();
    expect(await svc.getStats()).toMatchObject({ total: 1, loaded: 1 });
    expect(model.getStats).toHaveBeenCalled();
  });

  it('getLastUpdatedMs delegates', async () => {
    const { svc, model } = makeService();
    expect(await svc.getLastUpdatedMs()).toBe(42);
    expect(model.getLastUpdatedMs).toHaveBeenCalled();
  });

  it('iterLoadedTx yields entries from the underlying model', async () => {
    const { svc } = makeService();
    const items: any[] = [];
    for await (const entry of svc.iterLoadedTx()) items.push(entry);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ hash: '0xa' });
  });

  it('forEachLoadedTx delegates and invokes callback', async () => {
    const { svc } = makeService();
    const cb = jest.fn();
    await svc.forEachLoadedTx(cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  describe('checkTransaction — all combinations', () => {
    it('exists + loaded → returns full info', async () => {
      const { svc } = makeService();
      const result = await svc.checkTransaction('0xa');
      expect(result).toMatchObject({ exists: true, isLoaded: true });
      expect(result.metadata).toBeDefined();
    });

    it('exists + not loaded → returns metadata, isLoaded=false', async () => {
      const { svc, model } = makeService();
      model.isTransactionLoaded.mockReturnValue(false);
      const result = await svc.checkTransaction('0xa');
      expect(result).toMatchObject({ exists: true, isLoaded: false });
    });

    it('not exists → returns isLoaded=false and no metadata', async () => {
      const { svc, model } = makeService();
      model.hasTransaction.mockReturnValue(false);
      const result = await svc.checkTransaction('0xa');
      expect(result).toMatchObject({ exists: false, isLoaded: false, metadata: undefined });
    });
  });
});
