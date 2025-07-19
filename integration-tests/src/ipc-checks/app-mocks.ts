import { BlockchainProviderService } from '@easylayer/evm';
import { mockBlocks } from './mocks';

BlockchainProviderService.prototype.getManyBlocksWithReceipts = async function (heights: number[]): Promise<any> {
  return mockBlocks;
};
