import { InitMempoolCommandHandler } from '../init-mempool.command-handler';

describe('InitMempoolCommandHandler — START_BLOCK_HEIGHT guard (BUG-005 regression)', () => {
  const requestId = 'req-1';
  const command = { payload: { requestId } } as any;

  function makeHandler(startBlockHeight: number | undefined) {
    const mempoolModel = {
      init: jest.fn().mockResolvedValue(undefined),
    };
    const mempoolModelFactory = {
      initModel: jest.fn().mockResolvedValue(mempoolModel),
    };
    const blockchainProvider = {
      getCurrentBlockHeightFromMempool: jest.fn().mockResolvedValue(1000),
    };
    const eventStore = {
      save: jest.fn().mockResolvedValue(undefined),
    };
    const businessConfig = { START_BLOCK_HEIGHT: startBlockHeight } as any;

    const handler = new InitMempoolCommandHandler(
      eventStore as any,
      mempoolModelFactory as any,
      blockchainProvider as any,
      businessConfig
    );

    return { handler, mempoolModel, mempoolModelFactory, eventStore };
  }

  it('proceeds when START_BLOCK_HEIGHT is undefined', async () => {
    const { handler, mempoolModel, eventStore } = makeHandler(undefined);
    await expect(handler.execute(command)).resolves.toBeUndefined();
    expect(mempoolModel.init).toHaveBeenCalled();
    expect(eventStore.save).toHaveBeenCalled();
  });

  it('throws when START_BLOCK_HEIGHT is 0 (the regression case — truthy check would have passed)', async () => {
    const { handler, mempoolModel } = makeHandler(0);
    await expect(handler.execute(command)).rejects.toThrow(/Mempool cannot be initialized/);
    expect(mempoolModel.init).not.toHaveBeenCalled();
  });

  it('throws when START_BLOCK_HEIGHT is a positive number', async () => {
    const { handler, mempoolModel } = makeHandler(100);
    await expect(handler.execute(command)).rejects.toThrow(/Mempool cannot be initialized/);
    expect(mempoolModel.init).not.toHaveBeenCalled();
  });
});
