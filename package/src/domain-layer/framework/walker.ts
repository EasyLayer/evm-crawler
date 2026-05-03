export type Walker = (from: string, source: any, fn: (ctx: any) => void | Promise<void>) => Promise<void>;

export const walkEVM: Walker = async (from, source, fn) => {
  if (!source) return;
  switch (from) {
    case 'block':
      return fn({ block: source });
    case 'block.transactions':
      for (const tx of source.transactions ?? []) await fn({ block: source, tx });
      return;
    case 'block.receipts':
      for (const receipt of source.receipts ?? []) await fn({ block: source, receipt });
      return;
    case 'block.receipts.logs':
      for (const receipt of source.receipts ?? [])
        for (const log of receipt.logs ?? []) await fn({ block: source, receipt, log });
      return;
    case 'block.traces':
      for (const trace of source.traces ?? []) await fn({ block: source, trace });
      return;
    case 'mempool':
      return fn({ mempool: source });
    case 'mempool.tx':
      if (Array.isArray(source?.tx)) for (const tx of source.tx) await fn({ mempool: source, tx });
      return;
  }
};
