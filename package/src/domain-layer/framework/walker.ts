import type { Walker } from './declarative';

export const walkEVM: Walker = async (from, source, fn) => {
  if (!source) return;

  switch (from) {
    case 'block': {
      await fn({ block: source });
      return;
    }

    case 'block.transactions': {
      const block: any = source;
      for (const tx of block.transactions ?? []) await fn({ block, tx });
      return;
    }

    case 'block.receipts': {
      const block: any = source;
      for (const receipt of block.receipts ?? []) await fn({ block, receipt });
      return;
    }

    case 'block.receipts.logs': {
      const block: any = source;
      for (const receipt of block.receipts ?? []) {
        for (const log of receipt.logs ?? []) await fn({ block, receipt, log });
      }
      return;
    }

    case 'block.traces': {
      const block: any = source;
      for (const trace of block.traces ?? []) await fn({ block, trace });
      return;
    }

    // ── Mempool ──────────────────────────────────────────────────────────

    case 'mempool': {
      await fn({ mempool: source });
      return;
    }

    case 'mempool.tx': {
      const mempool: any = source;
      if (Array.isArray(mempool?.tx)) {
        for (const tx of mempool.tx) await fn({ mempool, tx });
        return;
      }
      if (typeof mempool?.forEachLoadedTx === 'function') {
        await mempool.forEachLoadedTx(async (tx: any) => fn({ mempool, tx }));
        return;
      }
      throw new Error('mempool.tx: unsupported mempool source');
    }

    default:
      return;
  }
};
