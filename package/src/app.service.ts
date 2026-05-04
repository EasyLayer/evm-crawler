import { v4 as uuidv4 } from 'uuid';
import { Injectable, Logger } from '@nestjs/common';
import { NetworkCommandFactoryService, MempoolCommandFactoryService } from './application-layer/services';
import { ProvidersConfig } from './config';

@Injectable()
export class AppService {
  log = new Logger(AppService.name);

  constructor(
    private readonly networkCommandFactory: NetworkCommandFactoryService,
    private readonly mempoolCommandFactory: MempoolCommandFactoryService,
    private readonly providersConfig: ProvidersConfig
  ) {}

  async init() {
    if (this.providersConfig.hasMempoolProviders()) {
      await this.mempoolInitialization();
    } else {
      await this.networkInitialization();
    }
  }

  private async networkInitialization(): Promise<void> {
    await this.networkCommandFactory.init({ requestId: uuidv4() });
  }

  private async mempoolInitialization(): Promise<void> {
    await this.mempoolCommandFactory.init({ requestId: uuidv4() });
  }
}
