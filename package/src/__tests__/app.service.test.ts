import { AppService } from '../app.service';

describe('AppService.init — branching on hasMempoolProviders', () => {
  function makeService(hasMempool: boolean) {
    const networkCommandFactory = { init: jest.fn().mockResolvedValue(undefined) };
    const mempoolCommandFactory = { init: jest.fn().mockResolvedValue(undefined) };
    const providersConfig = { hasMempoolProviders: jest.fn().mockReturnValue(hasMempool) };
    return {
      service: new AppService(networkCommandFactory as any, mempoolCommandFactory as any, providersConfig as any),
      networkCommandFactory,
      mempoolCommandFactory,
    };
  }

  it('starts the mempool path when providers report mempool support', async () => {
    const { service, networkCommandFactory, mempoolCommandFactory } = makeService(true);
    await service.init();
    expect(mempoolCommandFactory.init).toHaveBeenCalledTimes(1);
    expect(networkCommandFactory.init).not.toHaveBeenCalled();
  });

  it('starts the network path when no mempool providers configured', async () => {
    const { service, networkCommandFactory, mempoolCommandFactory } = makeService(false);
    await service.init();
    expect(networkCommandFactory.init).toHaveBeenCalledTimes(1);
    expect(mempoolCommandFactory.init).not.toHaveBeenCalled();
  });

  it('passes a fresh requestId per init call', async () => {
    const { service, mempoolCommandFactory } = makeService(true);
    await service.init();
    await service.init();
    const calls = mempoolCommandFactory.init.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].requestId).not.toBe(calls[1][0].requestId);
    expect(typeof calls[0][0].requestId).toBe('string');
  });
});
