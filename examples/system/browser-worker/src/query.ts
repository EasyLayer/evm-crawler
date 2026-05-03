import type { QueryHandlerFactory } from '@easylayer/evm-crawler';
import { NativeBalanceWatcher } from './model';
export const GetBalanceQueryHandler: QueryHandlerFactory = {
  queryName: 'GetBalanceQuery',
  handle: async (dto: { addresses?: string[] }, { modelFactory }) => {
    const model = await modelFactory.restoreByCtor(NativeBalanceWatcher);
    const addresses = dto.addresses ?? [];
    if (!addresses.length) return model.getAllBalances();
    const result: Record<string, string> = {};
    for (const address of addresses) result[address] = model.getBalance(address);
    return result;
  },
};
