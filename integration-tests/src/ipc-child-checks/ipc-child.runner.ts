import { bootstrap } from '@easylayer/evm-crawler/node';
import { BlockchainProviderService } from '@easylayer/evm';
import BlocksModel from './blocks.model';
import { mockBlocks } from '../../../e2e-tests-server/src/+fixtures/evm-blocks';

// Patch provider methods directly on prototype — jest.spyOn is not available in child process
BlockchainProviderService.prototype.getCurrentBlockHeightFromNetwork = async function () {
  return mockBlocks[mockBlocks.length - 1]!.blockNumber; // 2
};

BlockchainProviderService.prototype.getManyBlocksByHeights = async function (heights: any[]) {
  return heights.map((h) => {
    const blk = mockBlocks.find((b) => b.blockNumber === Number(h));
    if (!blk) throw new Error(`No mock EVM block for blockNumber ${h}`);
    return blk;
  });
};

BlockchainProviderService.prototype.getManyBlocksWithReceipts = async function (heights: any[]) {
  return heights.map((h) => {
    const blk = mockBlocks.find((b) => b.blockNumber === Number(h));
    if (!blk) throw new Error(`No mock EVM block for blockNumber ${h}`);
    return blk;
  });
};

BlockchainProviderService.prototype.getManyBlocksStatsByHeights = async function (heights: any[]) {
  return heights.map((h) => {
    const blk = mockBlocks.find((b) => b.blockNumber === Number(h))!;
    return {
      hash: blk.hash,
      number: blk.blockNumber,
      size: (blk as any).size ?? 0,
      gasLimit: blk.gasLimit,
      gasUsed: blk.gasUsed,
      gasUsedPercentage: blk.gasUsed / blk.gasLimit,
      timestamp: blk.timestamp,
      transactionCount: blk.transactions?.length ?? 0,
      miner: blk.miner ?? '0x' + '0'.repeat(40),
      difficulty: (blk as any).difficulty ?? '0x1',
      parentHash: blk.parentHash,
      unclesCount: (blk as any).uncles?.length ?? 0,
    };
  });
};

(async () => {
  await bootstrap({ Models: [BlocksModel] });
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
