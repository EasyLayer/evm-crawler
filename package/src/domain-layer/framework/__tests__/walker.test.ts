import { walkEVM } from '../walker';

describe('walkEVM', () => {
  it('block: yields { block }', async () => {
    const block = { blockNumber: 1 };
    const seen: any[] = [];
    await walkEVM('block', block, async (item) => {
      seen.push(item);
    });
    expect(seen).toEqual([{ block }]);
  });

  it('block.transactions: iterates each tx', async () => {
    const block = { transactions: [{ hash: '0x1' }, { hash: '0x2' }] };
    const seen: any[] = [];
    await walkEVM('block.transactions', block, async (item) => {
      seen.push(item);
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ block, tx: { hash: '0x1' } });
  });

  it('block.receipts: iterates each receipt', async () => {
    const block = { receipts: [{ transactionHash: '0x1' }, { transactionHash: '0x2' }] };
    const seen: any[] = [];
    await walkEVM('block.receipts', block, async (item) => {
      seen.push(item);
    });
    expect(seen).toHaveLength(2);
  });

  it('block.receipts.logs: iterates each log nested in receipts', async () => {
    const block = {
      receipts: [
        { transactionHash: '0x1', logs: [{ index: 0 }, { index: 1 }] },
        { transactionHash: '0x2', logs: [{ index: 2 }] },
      ],
    };
    const seen: any[] = [];
    await walkEVM('block.receipts.logs', block, async (item) => {
      seen.push(item);
    });
    expect(seen).toHaveLength(3);
  });

  it('block.logs: prefers top-level logs when present', async () => {
    const block = {
      logs: [{ index: 0 }, { index: 1 }],
      receipts: [{ logs: [{ index: 99 }] }],
    };
    const seen: any[] = [];
    await walkEVM('block.logs', block, async (item) => {
      seen.push(item);
    });
    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ log: { index: 0 } });
  });

  it('block.logs: falls back to receipts when no top-level logs', async () => {
    const block = {
      receipts: [{ logs: [{ index: 0 }, { index: 1 }] }],
    };
    const seen: any[] = [];
    await walkEVM('block.logs', block, async (item) => {
      seen.push(item);
    });
    expect(seen).toHaveLength(2);
  });

  it('block.traces: iterates each trace', async () => {
    const block = { traces: [{ type: 'call' }, { type: 'create' }] };
    const seen: any[] = [];
    await walkEVM('block.traces', block, async (item) => {
      seen.push(item);
    });
    expect(seen).toHaveLength(2);
  });

  it('mempool: yields { mempool }', async () => {
    const mempool = { tx: [] };
    const seen: any[] = [];
    await walkEVM('mempool', mempool, async (item) => {
      seen.push(item);
    });
    expect(seen).toEqual([{ mempool }]);
  });

  it('mempool.tx: snapshot { tx: [...] }', async () => {
    const mempool = { tx: [{ hash: '0x1' }, { hash: '0x2' }] };
    const seen: any[] = [];
    await walkEVM('mempool.tx', mempool, async (item) => {
      seen.push(item);
    });
    expect(seen).toHaveLength(2);
  });

  it('mempool.transactions: snapshot { transactions: [...] }', async () => {
    const mempool = { transactions: [{ hash: '0x1' }] };
    const seen: any[] = [];
    await walkEVM('mempool.transactions', mempool, async (item) => {
      seen.push(item);
    });
    expect(seen).toHaveLength(1);
  });

  it('mempool.tx: service-style iterLoadedTx (async iterable)', async () => {
    const mempool = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      iterLoadedTx: () => {
        return (async function* () {
          yield { hash: '0xa', metadata: {} };
          yield { hash: '0xb', metadata: {} };
        })();
      },
    };
    const seen: any[] = [];
    await walkEVM('mempool.tx', mempool, async (item) => {
      seen.push(item);
    });
    expect(seen).toHaveLength(2);
  });

  it('mempool.tx: service-style forEachLoadedTx', async () => {
    const mempool = {
      forEachLoadedTx: async (cb: any) => {
        await cb({ hash: '0xa' });
        await cb({ hash: '0xb' });
      },
    };
    const seen: any[] = [];
    await walkEVM('mempool.tx', mempool, async (item) => {
      seen.push(item);
    });
    expect(seen).toHaveLength(2);
  });

  it('mempool.tx: service-style forEachTxLazy', async () => {
    const mempool = {
      forEachTxLazy: async (cb: any) => {
        await cb({ hash: '0x1' });
      },
    };
    const seen: any[] = [];
    await walkEVM('mempool.tx', mempool, async (item) => {
      seen.push(item);
    });
    expect(seen).toHaveLength(1);
  });

  it('mempool.tx: throws when no iteration method available', async () => {
    const mempool = {}; // none of the supported shapes
    await expect(
      walkEVM('mempool.tx', mempool, async () => {})
    ).rejects.toThrow(/unsupported mempool source/);
  });

  it('default case: no-op (does not throw)', async () => {
    const seen: any[] = [];
    await walkEVM('unknown.path' as any, {}, async (item) => {
      seen.push(item);
    });
    expect(seen).toEqual([]);
  });

  it('does nothing when source is falsy', async () => {
    const seen: any[] = [];
    await walkEVM('block', null as any, async (item) => {
      seen.push(item);
    });
    expect(seen).toEqual([]);
  });
});
