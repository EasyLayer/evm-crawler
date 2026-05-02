import { Global, Module, DynamicModule, Provider } from '@nestjs/common';
import { transformAndValidate } from 'class-transformer-validator';
import { CqrsTransportModule } from '@easylayer/common/cqrs-transport';
import { ArithmeticService } from '@easylayer/common/arithmetic';
import { EventStoreModule, EventStoreReadService } from '@easylayer/common/eventstore';
import { NetworkTransportModule } from '@easylayer/common/network-transport';
import { Network, Mempool, BlockchainProviderModule, BlocksQueueModule } from '@easylayer/evm';
import { AppService } from '../app.service';
import {
  NetworkCommandFactoryService,
  ReadStateExceptionHandlerService,
  MempoolCommandFactoryService,
} from '../application-layer/services';
import {
  NetworkModelFactoryService,
  MempoolModelFactoryService,
  MempoolReadService,
  NetworkReadService,
  NETWORK_AGGREGATE_ID,
  MEMPOOL_AGGREGATE_ID,
} from '../domain-layer/services';
import {
  AppConfig,
  BusinessConfig,
  EventStoreConfig,
  BlocksQueueConfig,
  ProvidersConfig,
  BootstrapConfig,
} from '../config';
import { TransportConfig } from './config';
import { getUnifiedEnv } from '../config/unified-env';
import { ModelFactoryService, normalizeModelsEVM, ModelInput } from '../domain-layer/framework';
import { ConsolePromptService } from './console-prompt.service';

export interface BrowserAppModuleOptions {
  appName: string;
  Models?: ModelInput[];
  Providers?: Array<new (...args: any[]) => Provider>;
  config?: BootstrapConfig;
}

@Global()
@Module({})
export class BrowserAppModule {
  static async forRootAsync({
    appName,
    Models = [],
    Providers = [],
    config = {},
  }: BrowserAppModuleOptions): Promise<DynamicModule> {
    const env = getUnifiedEnv();

    const eventstoreConfig = await transformAndValidate(EventStoreConfig, env, {
      validator: { whitelist: true },
    });
    const appConfig = await transformAndValidate(AppConfig, env, {
      validator: { whitelist: true },
    });
    const businessConfig = await transformAndValidate(BusinessConfig, env, {
      validator: { whitelist: true },
    });
    const blocksQueueConfig = await transformAndValidate(BlocksQueueConfig, env, {
      validator: { whitelist: true },
    });
    const providersConfig = await transformAndValidate(ProvidersConfig, env, {
      validator: { whitelist: true },
    });
    const transportConfig = await transformAndValidate(TransportConfig, env, {
      validator: { whitelist: true },
    });

    const networkConfig = businessConfig.getNetworkConfig();
    const queueIteratorBlocksBatchSize = businessConfig.NETWORK_MAX_BLOCK_WEIGHT * 2;
    const queueLoaderRequestBlocksBatchSize = businessConfig.NETWORK_MAX_BLOCK_WEIGHT * 2;
    const maxQueueSize = queueIteratorBlocksBatchSize * 10;

    const networkModel = new Network({ aggregateId: NETWORK_AGGREGATE_ID, maxSize: 0, blockHeight: -1 });
    const mempoolModel = new Mempool({
      aggregateId: MEMPOOL_AGGREGATE_ID,
      blockHeight: -1,
      minGasPrice: BigInt(networkConfig.minGasPrice ?? '1000000000'),
      maxPendingCount: businessConfig.MEMPOOL_MAX_PENDING_TX_COUNT,
      pendingTxTtlMs: businessConfig.MEMPOOL_PENDING_TX_TTL_MS,
    });

    const NormalizedModels = normalizeModelsEVM(Models);
    const userModels = NormalizedModels.map((ModelCtr) => new ModelCtr());

    // Browser always uses RPC (no P2P / ZMQ).
    // EVM mempool uses WebSocket subscribe — pass WS URLs as mempool connections.
    const networkConnections = (providersConfig.PROVIDER_NETWORK_RPC_URLS ?? []).map((url) => ({
      httpUrl: url,
    }));
    const mempoolConnections = providersConfig.getMempoolConnections?.() ?? [];

    return {
      module: BrowserAppModule,
      controllers: [],
      imports: [
        CqrsTransportModule.forRoot({
          isGlobal: true,
          systemAggregates: [NETWORK_AGGREGATE_ID, MEMPOOL_AGGREGATE_ID],
        }),

        NetworkTransportModule.forRoot({
          isGlobal: true,
          transports: transportConfig.getEnabledBrowserTransports(),
          outbox: transportConfig.getOutboxOptions(),
        }),

        // Browser EVM provider: fetch-based RPC (no P2P, no ZMQ).
        // Mempool via WS subscribe if PROVIDER_MEMPOOL_WS_URLS is set.
        BlockchainProviderModule.forRootAsync({
          isGlobal: true,
          network: networkConfig,
          rateLimits: providersConfig.getRateLimits(),
          networkProviders: {
            type: 'ethersjs', // browser always uses ethersjs/web3js RPC
            connections: networkConnections,
          },
          mempoolProviders: mempoolConnections.length
            ? { type: providersConfig.PROVIDER_TYPE, connections: mempoolConnections }
            : undefined,
        }),

        (EventStoreModule as any).forRootAsync({
          isGlobal: true,
          name: `${appName}-eventstore`,
          type: 'sqlite-opfs',
          database: eventstoreConfig.EVENTSTORE_DB_NAME,
          aggregates: [...userModels, networkModel, mempoolModel],
          logging: eventstoreConfig.isLogging(),
          sqliteRuntimeBaseUrl: eventstoreConfig.EVENTSTORE_SQLITE_RUNTIME_BASE_URL,
        }),

        BlocksQueueModule.forRootAsync({
          mempoolCommandExecutor: MempoolCommandFactoryService,
          blocksCommandExecutor: NetworkCommandFactoryService,
          maxBlockHeight: businessConfig.MAX_BLOCK_HEIGHT ?? Number.MAX_SAFE_INTEGER,
          queueLoaderStrategyName: blocksQueueConfig.BLOCKS_QUEUE_LOADER_STRATEGY_NAME,
          mempoolLoaderStrategyName: blocksQueueConfig.MEMPOOL_LOADER_STRATEGY_NAME,
          basePreloadCount: blocksQueueConfig.BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT,
          blockSize: businessConfig.NETWORK_MAX_BLOCK_WEIGHT,
          maxBlockWeight: businessConfig.NETWORK_MAX_BLOCK_WEIGHT,
          queueLoaderRequestBlocksBatchSize,
          queueIteratorBlocksBatchSize,
          maxQueueSize,
          blockTimeMs: businessConfig.NETWORK_TARGET_BLOCK_TIME_MS,
          tracesEnabled: businessConfig.TRACES_ENABLED,
        }),
      ],
      providers: [
        { provide: AppConfig, useValue: appConfig },
        { provide: BusinessConfig, useValue: businessConfig },
        { provide: BlocksQueueConfig, useValue: blocksQueueConfig },
        { provide: EventStoreConfig, useValue: eventstoreConfig },
        { provide: ProvidersConfig, useValue: providersConfig },
        { provide: TransportConfig, useValue: transportConfig },
        { provide: 'BootstrapConfig', useValue: config },
        { provide: 'FrameworkModelsConstructors', useValue: NormalizedModels },
        { provide: 'ConsolePromptService', useClass: ConsolePromptService },
        {
          provide: ModelFactoryService,
          useFactory: (eventStoreService: EventStoreReadService) =>
            new ModelFactoryService(businessConfig, eventStoreService),
          inject: [EventStoreReadService],
        },
        AppService,
        ArithmeticService,
        NetworkCommandFactoryService,
        NetworkModelFactoryService,
        ReadStateExceptionHandlerService,
        MempoolCommandFactoryService,
        MempoolModelFactoryService,
        MempoolReadService,
        NetworkReadService,
        ...Providers,
      ],
      exports: [
        AppService,
        NetworkCommandFactoryService,
        NetworkModelFactoryService,
        ReadStateExceptionHandlerService,
        MempoolCommandFactoryService,
        MempoolModelFactoryService,
        AppConfig,
        BusinessConfig,
        EventStoreConfig,
        BlocksQueueConfig,
        ProvidersConfig,
        'FrameworkModelsConstructors',
        'BootstrapConfig',
        'ConsolePromptService',
        ModelFactoryService,
        BlocksQueueModule,
        EventStoreModule,
        MempoolReadService,
        NetworkReadService,
        ...Providers,
      ],
    };
  }
}
