import type { Walker } from './declarative';

function isAsyncIterable(x: any): x is AsyncIterable<any> {
  return x && typeof x[Symbol.asyncIterator] === 'function';
}

async function walkMempoolTx(mempool: any, feed: (tx: any) => Promise<void>, errorPrefix: string): Promise<void> {
  // 1) snapshot { tx: any[] }
  if (Array.isArray(mempool?.tx)) {
    for (const tx of mempool.tx) await feed(tx);
    return;
  }

  // 2) snapshot { transactions: any[] }
  if (Array.isArray(mempool?.transactions)) {
    for (const tx of mempool.transactions) await feed(tx);
    return;
  }

  // 3) service: iterLoadedTx()
  if (typeof mempool?.iterLoadedTx === 'function') {
    const iter = mempool.iterLoadedTx();
    if (isAsyncIterable(iter)) {
      for await (const tx of iter) await feed(tx);
      return;
    }
  }

  // 4) service: forEachLoadedTx(cb)
  if (typeof mempool?.forEachLoadedTx === 'function') {
    await mempool.forEachLoadedTx(feed);
    return;
  }

  // 5) service: forEachTxLazy(cb)
  if (typeof mempool?.forEachTxLazy === 'function') {
    await mempool.forEachTxLazy(feed);
    return;
  }

  throw new Error(`${errorPrefix}: unsupported mempool source.`);
}

export const walkEVM: Walker = async (from, source, fn) => {
  if (!source) return;

  switch (from) {
    // -------- Block traversal --------
    case 'block': {
      await fn({ block: source });
      return;
    }

    case 'block.transactions': {
      const block: any = source;
      for (const tx of block.transactions ?? []) {
        await fn({ block, tx });
      }
      return;
    }

    case 'block.receipts': {
      const block: any = source;
      for (const receipt of block.receipts ?? []) {
        await fn({ block, receipt });
      }
      return;
    }

    case 'block.receipts.logs': {
      const block: any = source;
      for (const receipt of block.receipts ?? []) {
        for (const log of receipt.logs ?? []) {
          await fn({ block, receipt, log });
        }
      }
      return;
    }

    case 'block.logs': {
      const block: any = source;

      // Prefer top-level logs if a normalized block exposes them.
      if (Array.isArray(block.logs)) {
        for (const log of block.logs) {
          await fn({ block, log });
        }
        return;
      }

      // Fallback to receipt logs.
      for (const receipt of block.receipts ?? []) {
        for (const log of receipt.logs ?? []) {
          await fn({ block, receipt, log });
        }
      }
      return;
    }

    case 'block.traces': {
      const block: any = source;
      for (const trace of block.traces ?? []) {
        await fn({ block, trace });
      }
      return;
    }

    // -------- Mempool traversal --------
    case 'mempool': {
      await fn({ mempool: source });
      return;
    }

    case 'mempool.tx':
    case 'mempool.transactions': {
      const mempool: any = source;

      await walkMempoolTx(
        mempool,
        async (tx: any) => {
          await fn({ mempool, tx });
        },
        from
      );

      return;
    }

    default:
      return;
  }
};
