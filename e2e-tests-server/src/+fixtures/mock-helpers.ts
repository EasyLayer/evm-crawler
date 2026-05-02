import type { Block } from '@easylayer/evm';
import { mockBlocks } from './evm-blocks';

/**
 * Converts a mock Block into the stats shape returned by BlockchainProviderService.getManyBlocksStatsByHeights.
 * Uses real fixture values (not placeholders) for deterministic assertions.
 */
export function blockToStats(block: Block) {
  return {
    hash: block.hash,
    number: block.blockNumber,
    size: (block as any).size ?? 0,
    gasLimit: block.gasLimit,
    gasUsed: block.gasUsed,
    gasUsedPercentage: block.gasUsed / block.gasLimit,
    timestamp: block.timestamp,
    transactionCount: block.transactions?.length ?? 0,
    miner: block.miner ?? '0x' + '0'.repeat(40),
    difficulty: (block as any).difficulty ?? '0x1',
    parentHash: block.parentHash,
    unclesCount: (block as any).uncles?.length ?? 0,
  };
}

/**
 * Standard stats mock implementation for getManyBlocksStatsByHeights.
 * Filters from mockBlocks using the requested heights.
 */
export function makeStatsMock(blocks: Block[] = mockBlocks) {
  return async (heights: (string | number)[]) =>
    heights
      .map((h) => blocks.find((b) => b.blockNumber === Number(h)))
      .filter(Boolean)
      .map((b) => blockToStats(b!));
}

/**
 * Standard blocks mock implementation for getManyBlocksByHeights / getManyBlocksWithReceipts.
 */
export function makeBlocksMock(blocks: Block[] = mockBlocks) {
  return async (heights: (string | number)[]) =>
    heights.map((h) => {
      const blk = blocks.find((b) => b.blockNumber === Number(h));
      if (!blk) throw new Error(`No mock block for blockNumber ${h}`);
      return blk;
    });
}
