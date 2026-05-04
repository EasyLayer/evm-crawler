import { Injectable } from '@nestjs/common';
import type { LightBlock } from '@easylayer/evm';
import { NetworkModelFactoryService } from './network-model-factory.service';

@Injectable()
export class NetworkReadService {
  constructor(private readonly networkModelFactory: NetworkModelFactoryService) {}

  public async getNetworkStats(): Promise<{
    isValid: boolean;
    lastBlockHeight: number;
    chainSize: number;
  }> {
    return this.networkModelFactory.getNetworkStats();
  }

  public async getBlock(height: number): Promise<{
    block: LightBlock | null;
    exists: boolean;
  }> {
    return this.networkModelFactory.getBlock(height);
  }

  public async getBlocks(
    lastN?: number,
    all: boolean = false
  ): Promise<{
    blocks: LightBlock[];
    requestedCount?: number;
  }> {
    return this.networkModelFactory.getBlocks(lastN, all);
  }

  public async getLastBlock(): Promise<{
    lastBlock: LightBlock | undefined;
  }> {
    return this.networkModelFactory.getLastBlock();
  }

  public async getLastBlockHeight(): Promise<number> {
    const model = await this.networkModelFactory.initModel();
    return model.lastBlockHeight;
  }

  public async getBlockByHeight(height: number): Promise<LightBlock | null> {
    const model = await this.networkModelFactory.initModel();
    return model.getBlockByHeight(height);
  }

  public async getLastNBlocks(count: number): Promise<LightBlock[]> {
    const model = await this.networkModelFactory.initModel();
    return model.getLastNBlocks(count);
  }

  public async hasBlockAtHeight(height: number): Promise<boolean> {
    return this.networkModelFactory.hasBlockAtHeight(height);
  }

  public async getBlocksInRange(
    startHeight: number,
    endHeight: number
  ): Promise<{
    blocks: LightBlock[];
    found: number;
    requested: number;
  }> {
    return this.networkModelFactory.getBlocksInRange(startHeight, endHeight);
  }

  public async hasTransaction(hash: string): Promise<boolean> {
    const model = await this.networkModelFactory.initModel();
    const last = model.getLastBlock();
    return !!last?.transactions?.includes(hash);
  }
}
