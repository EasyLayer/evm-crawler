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
  MempoolCommandFactoryService,
  ReadStateExceptionHandlerService,
} from '../application-layer/services';
import {
  NetworkModelFactoryService,
  MempoolModelFactoryService,
  NetworkReadService,
  MempoolReadService,
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
import {
  ModelFactoryService,
  normalizeModelsEVM,
  type ModelInput,
  type NormalizedModelCtor,
} from '../domain-layer/framework';
import { ConsolePromptService } from './console-prompt.service';

export interface AppModuleOptions {
  appName: string;
  Models?: ModelInput[];
  Providers?: Array<new (...args: any[]) => Provider>;
  config?: BootstrapConfig;
}

@Global()
@Module({})
export class AppModule {
  static async forRootAsync({
    appName,
    Models = [],
    Providers = [],
    config = {},
  }: AppModuleOptions): Promise<DynamicModule> {
    const env = process.env;

    const eventstoreConfig = await transformAndValidate(EventStoreConfig, env, { validator: { whitelist: true } });
    const appConfig = await transformAndValidate(AppConfig, env, { validator: { whitelist: true } });
    const businessConfig = await transformAndValidate(BusinessConfig, env, { validator: { whitelist: true } });
    const blocksQueueConfig = await transformAndValidate(BlocksQueueConfig, env, { validator: { whitelist: true } });
    const providersConfig = await transformAndValidate(ProvidersConfig, env, { validator: { whitelist: true } });
    const transportConfig = await transformAndValidate(TransportConfig, env, { validator: { whitelist: true } });

    const queueIteratorBlocksBatchSize = businessConfig.NETWORK_MAX_BLOCK_WEIGHT * 2;
    const queueLoaderRequestBlocksBatchSize = businessConfig.NETWORK_MAX_BLOCK_WEIGHT * 2;
    const maxQueueSize = queueIteratorBlocksBatchSize * 10;

    const networkModel = new Network({ aggregateId: NETWORK_AGGREGATE_ID, maxSize: 0, blockHeight: -1 });
    const networkConfig = businessConfig.getNetworkConfig();
    const mempoolModel = new Mempool({
      aggregateId: MEMPOOL_AGGREGATE_ID,
      blockHeight: -1,
      minGasPrice: BigInt(networkConfig.minGasPrice ?? '1000000000'),
      maxPendingCount: businessConfig.MEMPOOL_MAX_PENDING_TX_COUNT,
      pendingTxTtlMs: businessConfig.MEMPOOL_PENDING_TX_TTL_MS,
    });

    const NormalizedModels = normalizeModelsEVM(Models);
    const userModels = NormalizedModels.map((M) => new M());

    const hasMempoolProviders = providersConfig.hasMempoolProviders();

    return {
      module: AppModule,
      imports: [
        CqrsTransportModule.forRoot({
          isGlobal: true,
          systemAggregates: [NETWORK_AGGREGATE_ID, MEMPOOL_AGGREGATE_ID],
        }),
        NetworkTransportModule.forRoot({
          isGlobal: true,
          transports: (transportConfig as TransportConfig).getEnabledTransports(),
          outbox: (transportConfig as TransportConfig).getOutboxOptions(),
        }),
        BlockchainProviderModule.forRootAsync({
          isGlobal: true,
          network: networkConfig,
          rateLimits: providersConfig.getRateLimits(),
          networkProviders: {
            type: providersConfig.PROVIDER_TYPE,
            connections: providersConfig.getNetworkConnections(),
          },
          mempoolProviders: hasMempoolProviders
            ? { type: providersConfig.PROVIDER_TYPE, connections: providersConfig.getMempoolConnections() }
            : undefined,
        }),
        EventStoreModule.forRootAsync({
          isGlobal: true,
          name: `${appName}-eventstore`,
          aggregates: [...userModels, networkModel, mempoolModel],
          logging: eventstoreConfig.isLogging(),
          type: eventstoreConfig.EVENTSTORE_DB_TYPE as any,
          database: eventstoreConfig.EVENTSTORE_DB_NAME,
          ...(eventstoreConfig.EVENTSTORE_DB_HOST && {
            host: eventstoreConfig.EVENTSTORE_DB_HOST,
          }),
          ...(eventstoreConfig.EVENTSTORE_DB_PORT && {
            port: eventstoreConfig.EVENTSTORE_DB_PORT,
          }),
          ...(eventstoreConfig.EVENTSTORE_DB_USERNAME && {
            username: eventstoreConfig.EVENTSTORE_DB_USERNAME,
          }),
          ...(eventstoreConfig.EVENTSTORE_DB_PASSWORD && {
            password: eventstoreConfig.EVENTSTORE_DB_PASSWORD,
          }),
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
          verifyTrie: businessConfig.NETWORK_VERIFY_TRIE,
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
        MempoolCommandFactoryService,
        NetworkModelFactoryService,
        MempoolModelFactoryService,
        ReadStateExceptionHandlerService,
        NetworkReadService,
        MempoolReadService,
        ...Providers,
      ],
      exports: [
        AppService,
        NetworkCommandFactoryService,
        MempoolCommandFactoryService,
        NetworkModelFactoryService,
        MempoolModelFactoryService,
        NetworkReadService,
        MempoolReadService,
        ReadStateExceptionHandlerService,
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
        ...Providers,
      ],
    };
  }
}
