import type { DeclarativeModel } from '@easylayer/evm-crawler';
import { compileStateModelEVM } from '@easylayer/evm-crawler';

export const AGGREGATE_ID = 'MempoolMonitorModel';

interface Store {
  tickCount: number;
  seen: string[];
}

const MempoolMonitorDeclarative: DeclarativeModel<Store> = {
  modelId: AGGREGATE_ID,
  state: (): Store => ({ tickCount: 0, seen: [] }),
  sources: {
    // Called once per mempool tick: marks that the mempool snapshot was seen by the user model.
    async mempool({ applyEvent, state }: any): Promise<void> {
      await applyEvent('MempoolTickEvent', state.tickCount, { tickIndex: state.tickCount });
    },
    // Called per loaded mempool tx: records that we observed a specific hash.
    async mempoolTx({ tx, applyEvent, state }: any): Promise<void> {
      if (!tx?.hash) return;
      await applyEvent('MempoolTxSeenEvent', state.seen.length, { hash: tx.hash });
    },
  },
  reducers: {
    MempoolTickEvent(state: Store) {
      state.tickCount++;
    },
    MempoolTxSeenEvent(state: Store, event: any) {
      state.seen.push(event.payload.hash);
    },
  },
  options: { snapshotsEnabled: false },
};

export default compileStateModelEVM<Store>(MempoolMonitorDeclarative);
