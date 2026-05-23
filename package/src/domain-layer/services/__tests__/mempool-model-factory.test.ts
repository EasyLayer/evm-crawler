import { MempoolModelFactoryService } from '../mempool-model-factory.service';

// We capture the Mempool constructor arguments via jest.mock to verify the
// conditional minGasPrice injection.
const mempoolCtorSpy = jest.fn();
jest.mock('@easylayer/evm', () => {
  const actual = jest.requireActual('@easylayer/evm') as any;
  return {
    ...actual,
    Mempool: function (opts: any) {
      mempoolCtorSpy(opts);
      this._opts = opts;
      this.aggregateId = opts.aggregateId;
      return this;
    },
  };
});

describe('MempoolModelFactoryService — minGasPrice conditional injection', () => {
  beforeEach(() => {
    mempoolCtorSpy.mockClear();
  });

  function makeFactory(rawMinGasPrice: any) {
    const businessConfig: any = {
      NETWORK_MIN_GAS_PRICE: rawMinGasPrice,
      MEMPOOL_MAX_PENDING_TX_COUNT: 1000,
      MEMPOOL_PENDING_TX_TTL_MS: 60_000,
    };
    const eventStoreService: any = { getOne: jest.fn().mockResolvedValue({}) };
    return new MempoolModelFactoryService(eventStoreService, businessConfig);
  }

  it('passes minGasPrice when env is a valid decimal string', () => {
    const factory = makeFactory('2000000000');
    factory.createNewModel();
    const opts = mempoolCtorSpy.mock.calls[0][0];
    expect(opts.minGasPrice).toBe(2_000_000_000n);
  });

  it('omits minGasPrice when env is undefined', () => {
    const factory = makeFactory(undefined);
    factory.createNewModel();
    const opts = mempoolCtorSpy.mock.calls[0][0];
    expect(opts.minGasPrice).toBeUndefined();
  });

  it('omits minGasPrice when env is empty string', () => {
    const factory = makeFactory('');
    factory.createNewModel();
    const opts = mempoolCtorSpy.mock.calls[0][0];
    expect(opts.minGasPrice).toBeUndefined();
  });

  it('omits minGasPrice when env is unparseable', () => {
    const factory = makeFactory('not-a-number');
    factory.createNewModel();
    const opts = mempoolCtorSpy.mock.calls[0][0];
    expect(opts.minGasPrice).toBeUndefined();
  });

  it('passes minGasPrice=0n when env is "0" (zero is a legitimate setting — disables minimum)', () => {
    const factory = makeFactory('0');
    factory.createNewModel();
    const opts = mempoolCtorSpy.mock.calls[0][0];
    expect(opts.minGasPrice).toBe(0n);
  });

  it('always passes maxPendingCount and pendingTxTtlMs', () => {
    const factory = makeFactory(undefined);
    factory.createNewModel();
    const opts = mempoolCtorSpy.mock.calls[0][0];
    expect(opts.maxPendingCount).toBe(1000);
    expect(opts.pendingTxTtlMs).toBe(60_000);
  });
});
