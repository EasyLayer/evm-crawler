import { v4 as uuidv4 } from 'uuid';
import { Injectable, Logger } from '@nestjs/common';
import { NetworkCommandFactoryService, MempoolCommandFactoryService } from './application-layer/services';
import { ProvidersConfig } from './config';

@Injectable()
export class AppService {
  private readonly log = new Logger(AppService.name);

  constructor(
    private readonly networkCommandFactory: NetworkCommandFactoryService,
    private readonly mempoolCommandFactory: MempoolCommandFactoryService,
    private readonly providersConfig: ProvidersConfig
  ) {}

  async init(): Promise<void> {
    /**
     * Activation logic mirrors evm-crawler:
     * - any mempool RPC/WS provider present → init mempool first
     *   (MempoolInitializedEventHandler will then init network)
     * - otherwise → init network directly
     */
    if (this.providersConfig.hasMempoolProviders()) {
      this.log.log('Mempool providers configured — initializing mempool first');
      await this.mempoolCommandFactory.init({ requestId: uuidv4() });
    } else {
      this.log.log('No mempool providers — initializing network only');
      await this.networkCommandFactory.init({ requestId: uuidv4() });
    }
  }
}
