import { ModelFactoryService } from '../factory';

class TestModel {
  static modelId = 'test';
  // simulated AggregateRoot internal
  _lastBlockHeight = -1;
  apply() {}
}

class ThrowingModel {
  constructor() {
    throw new Error('Mandatory throw');
  }
}

describe('ModelFactoryService', () => {
  it('createNewModel sets _lastBlockHeight to START_BLOCK_HEIGHT - 1', () => {
    const eventStore = { getOne: jest.fn() } as any;
    const config = { START_BLOCK_HEIGHT: 100 } as any;
    const svc = new ModelFactoryService(config, eventStore);

    const instance = svc.createNewModel(TestModel as any);
    expect((instance as any)._lastBlockHeight).toBe(99);
  });

  it('createNewModel uses 0 - 1 = -1 when START_BLOCK_HEIGHT is undefined', () => {
    const eventStore = { getOne: jest.fn() } as any;
    const config = { START_BLOCK_HEIGHT: undefined } as any;
    const svc = new ModelFactoryService(config, eventStore);

    const instance = svc.createNewModel(TestModel as any);
    expect((instance as any)._lastBlockHeight).toBe(-1);
  });

  it('restoreByCtor calls eventStore.getOne with instance', async () => {
    const restored = new TestModel();
    const eventStore = { getOne: jest.fn().mockResolvedValue(restored) } as any;
    const config = { START_BLOCK_HEIGHT: 0 } as any;
    const svc = new ModelFactoryService(config, eventStore);

    const result = await svc.restoreByCtor(TestModel as any);
    expect(eventStore.getOne).toHaveBeenCalled();
    expect(result).toBe(restored);
  });

  it('wraps actively throwing constructor errors in a descriptive message', () => {
    const eventStore = { getOne: jest.fn() } as any;
    const config = { START_BLOCK_HEIGHT: 0 } as any;
    const svc = new ModelFactoryService(config, eventStore);

    expect(() => svc.createNewModel(ThrowingModel as any)).toThrow(
      /ModelFactoryService: Model "ThrowingModel" must have a zero-args constructor/
    );
  });
});
