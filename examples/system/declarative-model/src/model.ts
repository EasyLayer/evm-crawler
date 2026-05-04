import type { DeclarativeModel } from '@easylayer/evm-crawler';
import { compileStateModelEVM } from '@easylayer/evm-crawler';
const DEFAULT_WATCH_ADDRESSES = ['0xd8da6bf26964af9d7eed9e03e53415d37aa96045'];
export interface NativeBalanceSnapshot {
  address: string;
  balanceWei: string;
}
type State = { wallets: Set<string>; balances: Map<string, string> };
export const NativeBalanceWatcherModel: DeclarativeModel<State> = {
  modelId: 'native-balance-watcher',
  state: () => ({ wallets: new Set(readWatchAddresses()), balances: new Map<string, string>() }),
  sources: {
    async block(ctx: any): Promise<void> {
      if (!ctx.state.wallets.size) return;
      const balances = await loadBalancesAtBlock(ctx, ctx.state.wallets);
      ctx.applyEvent('NativeBalanceSnapshotCaptured', ctx.block.blockNumber, { blockHash: ctx.block.hash, balances });
    },
  },
  reducers: {
    NativeBalanceSnapshotCaptured(state: State, event: any): void {
      const payload = event.payload as { balances?: NativeBalanceSnapshot[] };
      for (const item of payload.balances ?? []) state.balances.set(normalizeAddress(item.address), item.balanceWei);
    },
  },
  selectors: {
    getBalance(state: State, address: string): string {
      return state.balances.get(normalizeAddress(address)) ?? '0';
    },
    getAllBalances(state: State): Record<string, string> {
      const result: Record<string, string> = {};
      for (const address of state.wallets) result[address] = state.balances.get(address) ?? '0';
      return result;
    },
  },
};
export default compileStateModelEVM<State>(NativeBalanceWatcherModel);
async function loadBalancesAtBlock(
  ctx: { block: { blockNumber: number }; services: any },
  addresses: Iterable<string>
): Promise<NativeBalanceSnapshot[]> {
  const provider = await ctx.services?.nodeProvider?.connectionManager?.getActiveProvider?.();
  const httpClient = provider?.httpClient;
  if (!httpClient) throw new Error('Active EVM HTTP provider is not available in processBlock context');
  const blockTag = ctx.block.blockNumber;
  const result: NativeBalanceSnapshot[] = [];
  for (const rawAddress of addresses) {
    const address = normalizeAddress(rawAddress);
    const balanceWei = await getBalanceWei(httpClient, address, blockTag);
    result.push({ address, balanceWei });
  }
  return result;
}
async function getBalanceWei(httpClient: any, address: string, blockTag: number): Promise<string> {
  if (typeof httpClient.getBalance === 'function') {
    const value = await httpClient.getBalance(address, blockTag);
    return typeof value === 'bigint' ? value.toString() : String(value);
  }
  if (httpClient.eth && typeof httpClient.eth.getBalance === 'function') {
    const value = await httpClient.eth.getBalance(address, blockTag);
    return typeof value === 'bigint' ? value.toString() : String(value);
  }
  throw new Error('Unsupported EVM provider client: getBalance() API was not found');
}
function readWatchAddresses(): string[] {
  const raw = process.env.WATCH_ADDRESSES ?? DEFAULT_WATCH_ADDRESSES.join(',');
  const addresses = raw
    .split(',')
    .map((item) => normalizeAddress(item))
    .filter(Boolean);
  return addresses.length ? Array.from(new Set(addresses)) : DEFAULT_WATCH_ADDRESSES;
}
function normalizeAddress(value: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}
