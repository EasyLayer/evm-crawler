import type { DeclarativeModel } from '@easylayer/evm-crawler';
import { compileStateModelEVM } from '@easylayer/evm-crawler';
export const AGGREGATE_ID = 'BlocksModel';
type Store = Record<string, never>;
const BlocksModelDeclarative: DeclarativeModel<Store> = {
  modelId: AGGREGATE_ID,
  state: (): Store => ({}),
  sources: {
    async block({ block, applyEvent }: any): Promise<void> {
      if (!block) return;
      await applyEvent('BlockAddedEvent', block.blockNumber, { hash: block.hash });
    },
  },
  reducers: { BlockAddedEvent() {} },
  options: { snapshotsEnabled: false },
};
export default compileStateModelEVM<Store>(BlocksModelDeclarative);
