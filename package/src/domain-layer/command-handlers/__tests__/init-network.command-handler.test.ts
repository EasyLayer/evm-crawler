import { InitNetworkCommandHandler } from '../init-network.command-handler';

/**
 * Coverage of determineStartHeight + alignToExternalCheckpoint branches in
 * InitNetworkCommandHandler. We do not refactor private methods into exports —
 * instead we exercise them through .execute() with full DI mocks.
 */
describe('InitNetworkCommandHandler — start height + external checkpoint branches', () => {
  function makeMocks({
    dbHeight,
    networkHeight,
    configStartHeight,
    bootstrapLastBlockHeight,
    indexedHeight,
    promptResult,
  }: {
    dbHeight: number;
    networkHeight: number;
    configStartHeight?: number;
    bootstrapLastBlockHeight?: number;
    indexedHeight: number;
    promptResult?: boolean;
  }) {
    let networkModel: any = {
      lastBlockHeight: dbHeight,
      init: jest.fn().mockResolvedValue(undefined),
      clearChain: jest.fn().mockResolvedValue(undefined),
    };

    const networkModelFactory = {
      initModel: jest.fn().mockImplementation(() => Promise.resolve(networkModel)),
      createNewModel: jest.fn().mockImplementation(() => ({})),
    };
    const blockchainProvider = {
      getCurrentBlockHeightFromNetwork: jest.fn().mockResolvedValue(networkHeight),
    };
    const eventStore = {
      save: jest.fn().mockResolvedValue(undefined),
      rollback: jest.fn().mockImplementation(async () => {
        // Simulate rollback by replacing the model with a fresh one at the rolled-back height.
        networkModel = {
          lastBlockHeight: bootstrapLastBlockHeight ?? indexedHeight,
          init: jest.fn().mockResolvedValue(undefined),
          clearChain: jest.fn().mockResolvedValue(undefined),
        };
      }),
    };
    const businessConfig = { START_BLOCK_HEIGHT: configStartHeight } as any;
    const consolePromptService = {
      askDataResetConfirmation: jest.fn().mockResolvedValue(promptResult ?? false),
    };
    const modelFactoryService = { createNewModel: jest.fn().mockReturnValue({}) };
    const bootstrapConfig = { lastBlockHeight: bootstrapLastBlockHeight };

    const handler = new InitNetworkCommandHandler(
      eventStore as any,
      networkModelFactory as any,
      businessConfig,
      blockchainProvider as any,
      consolePromptService,
      [] as any,
      modelFactoryService as any,
      bootstrapConfig as any
    );

    return {
      handler,
      eventStore,
      networkModel: () => networkModel,
      networkModelFactory,
      consolePromptService,
    };
  }

  const cmd = (indexedHeight = -1) => ({ payload: { requestId: 'req-1', indexedHeight } } as any);

  it('empty DB + no configStartHeight → starts at currentNetworkHeight - 1', async () => {
    const { handler, networkModel } = makeMocks({
      dbHeight: -1,
      networkHeight: 1000,
      indexedHeight: -1,
    });
    await handler.execute(cmd());
    expect(networkModel().init).toHaveBeenCalledWith(expect.objectContaining({ startHeight: 999 }));
  });

  it('empty DB + configStartHeight=N → starts at N - 1', async () => {
    const { handler, networkModel } = makeMocks({
      dbHeight: -1,
      networkHeight: 1000,
      configStartHeight: 500,
      indexedHeight: -1,
    });
    await handler.execute(cmd());
    expect(networkModel().init).toHaveBeenCalledWith(expect.objectContaining({ startHeight: 499 }));
  });

  it('non-empty DB + no configStartHeight → resumes at currentDbHeight', async () => {
    const { handler, networkModel } = makeMocks({
      dbHeight: 250,
      networkHeight: 1000,
      indexedHeight: -1,
    });
    await handler.execute(cmd());
    expect(networkModel().init).toHaveBeenCalledWith(expect.objectContaining({ startHeight: 250 }));
  });

  it('non-empty DB + configStartHeight <= currentDbHeight → resumes at currentDbHeight', async () => {
    const { handler, networkModel } = makeMocks({
      dbHeight: 250,
      networkHeight: 1000,
      configStartHeight: 100,
      indexedHeight: -1,
    });
    await handler.execute(cmd());
    expect(networkModel().init).toHaveBeenCalledWith(expect.objectContaining({ startHeight: 250 }));
  });

  it('configStartHeight == currentDbHeight + 1 → resumes at currentDbHeight (no prompt)', async () => {
    const { handler, networkModel, consolePromptService } = makeMocks({
      dbHeight: 250,
      networkHeight: 1000,
      configStartHeight: 251,
      indexedHeight: -1,
    });
    await handler.execute(cmd());
    expect(networkModel().init).toHaveBeenCalledWith(expect.objectContaining({ startHeight: 250 }));
    expect(consolePromptService.askDataResetConfirmation).not.toHaveBeenCalled();
  });

  it('configStartHeight > currentDbHeight + 1 + user confirms → triggers DATA_RESET_REQUIRED path', async () => {
    const { handler, eventStore } = makeMocks({
      dbHeight: 100,
      networkHeight: 1000,
      configStartHeight: 500,
      indexedHeight: -1,
      promptResult: true,
    });
    await handler.execute(cmd());
    expect(eventStore.rollback).toHaveBeenCalled();
  });

  it('configStartHeight > currentDbHeight + 1 + user declines → throws cancelled', async () => {
    const { handler } = makeMocks({
      dbHeight: 100,
      networkHeight: 1000,
      configStartHeight: 500,
      indexedHeight: -1,
      promptResult: false,
    });
    await expect(handler.execute(cmd())).rejects.toThrow(/cancelled by user/);
  });

  it('externalCheckpointHeight < -1 → throws', async () => {
    const { handler } = makeMocks({
      dbHeight: -1,
      networkHeight: 1000,
      bootstrapLastBlockHeight: -2,
      indexedHeight: -1,
    });
    await expect(handler.execute(cmd())).rejects.toThrow(/lastBlockHeight cannot be less than -1/);
  });

  it('externalCheckpointHeight=N + empty DB → starts at N', async () => {
    const { handler, networkModel } = makeMocks({
      dbHeight: -1,
      networkHeight: 1000,
      bootstrapLastBlockHeight: 200,
      indexedHeight: -1,
    });
    await handler.execute(cmd());
    expect(networkModel().init).toHaveBeenCalledWith(expect.objectContaining({ startHeight: 200 }));
  });

  it('externalCheckpointHeight === currentDbHeight → no-op (no rollback)', async () => {
    const { handler, eventStore, networkModel } = makeMocks({
      dbHeight: 200,
      networkHeight: 1000,
      bootstrapLastBlockHeight: 200,
      indexedHeight: -1,
    });
    await handler.execute(cmd());
    expect(eventStore.rollback).not.toHaveBeenCalled();
    expect(networkModel().init).toHaveBeenCalledWith(expect.objectContaining({ startHeight: 200 }));
  });

  it('externalCheckpointHeight < currentDbHeight → rollback + restored model', async () => {
    const { handler, eventStore } = makeMocks({
      dbHeight: 300,
      networkHeight: 1000,
      bootstrapLastBlockHeight: 100,
      indexedHeight: -1,
    });
    await handler.execute(cmd());
    expect(eventStore.rollback).toHaveBeenCalled();
  });

  it('externalCheckpointHeight > currentDbHeight → throws (gap risk)', async () => {
    const { handler } = makeMocks({
      dbHeight: 100,
      networkHeight: 1000,
      bootstrapLastBlockHeight: 300,
      indexedHeight: -1,
    });
    await expect(handler.execute(cmd())).rejects.toThrow(/ahead of local EventStore/);
  });
});
