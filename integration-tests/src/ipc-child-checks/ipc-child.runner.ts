import { bootstrap } from '@easylayer/evm-crawler';
import { BlockchainProviderService } from '@easylayer/evm';
import BlocksModel from './blocks.model';
import { mockBlocks } from './mocks';

function cloneBlock<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

// Patch provider methods directly on prototype — jest.spyOn is not available in child process

BlockchainProviderService.prototype.getCurrentBlockHeightFromNetwork = async function (): Promise<number> {
  return mockBlocks[mockBlocks.length - 1]!.blockNumber;
};

BlockchainProviderService.prototype.getManyBlocksStatsByHeights = async function (heights: any[]): Promise<any> {
  return mockBlocks
    .filter((block) => heights.map(Number).includes(block.blockNumber))
    .map((block) => ({
      hash: block.hash,
      number: block.blockNumber,
      size: block.size,
      gasLimit: block.gasLimit,
      gasUsed: block.gasUsed,
      gasUsedPercentage: block.gasUsed / block.gasLimit,
      timestamp: block.timestamp,
      transactionCount: block.transactions?.length ?? 0,
      miner: block.miner ?? '0x' + '0'.repeat(40),
      difficulty: (block as any).difficulty ?? '0x1',
      parentHash: block.parentHash,
      unclesCount: (block as any).uncles?.length ?? 0,
    }));
};

BlockchainProviderService.prototype.getManyBlocksByHeights = async function (heights: any[]) {
  return heights.map((h) => {
    const blk = mockBlocks.find((b) => b.blockNumber === Number(h));
    if (!blk) throw new Error(`No mock EVM block for blockNumber ${h}`);
    return cloneBlock(blk);
  });
};

BlockchainProviderService.prototype.getManyBlocksWithReceipts = async function (heights: any[]) {
  return heights.map((h) => {
    const blk = mockBlocks.find((b) => b.blockNumber === Number(h));
    if (!blk) throw new Error(`No mock EVM block for blockNumber ${h}`);
    return cloneBlock(blk);
  });
};

BlockchainProviderService.prototype.getOneBlockByHeight = async function (height: string | number) {
  const block = mockBlocks.find((b: any) => b.blockNumber === Number(height));
  return block ? cloneBlock(block) : null;
};

(async () => {
  await bootstrap({ Models: [BlocksModel] });
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
