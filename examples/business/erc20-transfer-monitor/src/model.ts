import { Model } from '@easylayer/evm-crawler';
import type { ProcessBlockExecutionContext } from '@easylayer/evm-crawler';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export type RecentTransfer = {
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  from: string;
  to: string;
  value: string;
};
export class Erc20TransferMonitor extends Model {
  static override modelId = 'erc20-transfer-monitor';
  private readonly contractAddress = normalizeAddress(process.env.WATCH_CONTRACT_ADDRESS || '');
  private totalTransfers = 0;
  private totalValue = 0n;
  private recentTransfers: RecentTransfer[] = [];
  public async processBlock(ctx: ProcessBlockExecutionContext): Promise<void> {
    for (const receipt of ctx.block.receipts ?? [])
      for (const log of receipt.logs ?? []) {
        if (normalizeAddress(log.address) !== this.contractAddress) continue;
        if ((log.topics?.[0] ?? '').toLowerCase() !== TRANSFER_TOPIC) continue;
        if ((log.topics?.length ?? 0) < 3) continue;
        this.applyEvent('Erc20TransferObserved', ctx.block.blockNumber, {
          blockNumber: ctx.block.blockNumber,
          transactionHash: receipt.transactionHash,
          logIndex: Number(log.logIndex ?? 0),
          from: decodeTopicAddress(log.topics[1]),
          to: decodeTopicAddress(log.topics[2]),
          value: decodeUint256(log.data),
        });
      }
  }
  protected onErc20TransferObserved(event: any): void {
    const transfer = event.payload as RecentTransfer;
    this.totalTransfers += 1;
    this.totalValue += BigInt(transfer.value);
    this.recentTransfers.unshift(transfer);
    this.recentTransfers = this.recentTransfers.slice(0, 50);
  }
  public getContractSummary() {
    return {
      contractAddress: this.contractAddress,
      totalTransfers: this.totalTransfers,
      totalValue: this.totalValue.toString(),
      lastSeenBlock: this.recentTransfers[0]?.blockNumber ?? null,
    };
  }
  public getRecentTransfers() {
    return this.recentTransfers;
  }
}
function decodeTopicAddress(topic: string): string {
  const normalized = topic.toLowerCase().replace(/^0x/, '');
  return `0x${normalized.slice(-40)}`;
}
function decodeUint256(hexValue: string): string {
  const normalized = hexValue.toLowerCase().replace(/^0x/, '') || '0';
  return BigInt(`0x${normalized}`).toString();
}
function normalizeAddress(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}
