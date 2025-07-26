import { Module, DynamicModule, Provider } from '@nestjs/common';
import { transformAndValidate } from 'class-transformer-validator';
import { CqrsModule, EventPublisher } from '@easylayer/common/cqrs';
import type { IQueryHandler, IEventHandler } from '@easylayer/common/cqrs';
import { CqrsTransportModule } from '@easylayer/common/cqrs-transport';
import { AppLogger, LoggerModule } from '@easylayer/common/logger';
import { ArithmeticService } from '@easylayer/common/arithmetic';
import { EventStoreModule, EventStoreWriteRepository } from '@easylayer/common/eventstore';
import { TransportModule } from '@easylayer/common/network-transport';
import {
  Network,
  BlockchainProviderModule,
  BlocksQueueModule,
  NetworkConfig,
  NodeProviderTypes,
  RateLimits,
} from '@easylayer/evm';
import { AppService } from './app.service';
import { NetworkSaga } from './application-layer/sagas';
import {
  NetworkCommandFactoryService,
  ReadStateExceptionHandlerService,
  CqrsFactoryService,
} from './application-layer/services';
import { NetworkModelFactoryService, ConsolePromptService, NETWORK_AGGREGATE_ID } from './domain-layer/services';
import { CommandHandlers } from './domain-layer/command-handlers';
import { EventsHandlers } from './domain-layer/events-handlers';
import { QueryHandlers } from './domain-layer/query-handlers';
import { AppConfig, BusinessConfig, EventStoreConfig, BlocksQueueConfig, ProvidersConfig } from './config';
import { ModelType, ModelFactoryService } from './framework';
import { MetricsService } from './metrics.service';

const appName = `${process?.env?.APPLICATION_NAME || 'ethereum'}`; // TODO: think where to put this

export const EVENTSTORE_NAME = `${appName}-eventstore`;

export interface AppModuleOptions {
  Models?: ModelType[];
  QueryHandlers?: Array<new (...args: any[]) => IQueryHandler>;
  EventHandlers?: Array<new (...args: any[]) => IEventHandler>;
  Providers?: Array<new (...args: any[]) => Provider>;
}

@Module({})
export class AppModule {
  static async register({
    Models = [],
    QueryHandlers: UserQueryHandlers = [],
    EventHandlers: UserEventHandlers = [],
    Providers = [],
  }: AppModuleOptions): Promise<DynamicModule> {
    const eventstoreConfig = await transformAndValidate(EventStoreConfig, process.env, {
      validator: { whitelist: true },
    });
    const appConfig = await transformAndValidate(AppConfig, process.env, {
      validator: { whitelist: true },
    });
    const businessConfig = await transformAndValidate(BusinessConfig, process.env, {
      validator: { whitelist: true },
    });
    const blocksQueueConfig = await transformAndValidate(BlocksQueueConfig, process.env, {
      validator: { whitelist: true },
    });
    const providersConfig = await transformAndValidate(ProvidersConfig, process.env, {
      validator: { whitelist: true },
    });

    const queueIteratorBlocksBatchSize = businessConfig.NETWORK_MAX_BLOCK_WEIGHT * 2;
    const queueLoaderRequestBlocksBatchSize = businessConfig.NETWORK_MAX_BLOCK_WEIGHT * 2;
    const maxQueueSize = queueIteratorBlocksBatchSize * 8;
    const minTransferSize = businessConfig.NETWORK_MAX_BLOCK_SIZE - 1;

    const networkModel = new Network({ aggregateId: NETWORK_AGGREGATE_ID, maxSize: 0 });
    // Create instances of models without merging for basic instances
    const userModels = Models.map((ModelCtr) => new ModelCtr());

    // Smart transport detection using helper methods
    const transports = appConfig.getEnabledTransports();

    // Network configuration
    const network: NetworkConfig = {
      chainId: businessConfig.NETWORK_CHAIN_ID,
      nativeCurrencySymbol: businessConfig.NETWORK_NATIVE_CURRENCY_SYMBOL,
      nativeCurrencyDecimals: businessConfig.NETWORK_NATIVE_CURRENCY_DECIMALS,
      blockTime: businessConfig.NETWORK_BLOCK_TIME,
      hasEIP1559: businessConfig.NETWORK_HAS_EIP1559,
      hasWithdrawals: businessConfig.NETWORK_HAS_WITHDRAWALS,
      hasBlobTransactions: businessConfig.NETWORK_HAS_BLOB_TRANSACTIONS,
      maxBlockSize: businessConfig.NETWORK_MAX_BLOCK_SIZE,
      maxBlockWeight: businessConfig.NETWORK_MAX_BLOCK_WEIGHT,
      maxCodeSize: businessConfig.NETWORK_MAX_CODE_SIZE,
      maxGasLimit: businessConfig.NETWORK_MAX_GAS_LIMIT,
      maxInitCodeSize: businessConfig.NETWORK_MAX_INIT_CODE_SIZE,
      maxTransactionSize: businessConfig.NETWORK_MAX_TRANSACTION_SIZE,
      maxBaseFeePerGas: businessConfig.NETWORK_MAX_BASE_FEE_PER_GAS,
      maxBlobGasPerBlock: businessConfig.NETWORK_MAX_BLOB_GAS_PER_BLOCK,
      maxPriorityFeePerGas: businessConfig.NETWORK_MAX_PRIORITY_FEE_PER_GAS,
      minGasPrice: businessConfig.NETWORK_MIN_GAS_PRICE,
    };

    const rateLimits: RateLimits = {
      maxConcurrentRequests: providersConfig.NETWORK_PROVIDER_RATE_LIMIT_MAX_CONCURRENT_REQUESTS,
      maxBatchSize: providersConfig.NETWORK_PROVIDER_RATE_LIMIT_MAX_BATCH_SIZE,
      requestDelayMs: providersConfig.NETWORK_PROVIDER_RATE_LIMIT_REQUEST_DELAY_MS,
    };

    return {
      module: AppModule,
      controllers: [],
      imports: [
        LoggerModule.forRoot({ componentName: appName }),
        // Set main modules as global
        CqrsTransportModule.forRoot({ isGlobal: true }),
        CqrsModule.forRoot({ isGlobal: true }),
        TransportModule.forRoot({ isGlobal: true, transports }),
        BlockchainProviderModule.forRootAsync({
          isGlobal: true,
          network,
          rateLimits,
          providers: [
            {
              connection: {
                type: providersConfig.NETWORK_PROVIDER_TYPE as NodeProviderTypes,
                httpUrl: providersConfig.NETWORK_PROVIDER_NODE_HTTP_URL,
                wsUrl: providersConfig.NETWORK_PROVIDER_NODE_WS_URL,
                responseTimeout: providersConfig.NETWORK_PROVIDER_REQUEST_TIMEOUT,
              },
            },
          ],
        }),
        EventStoreModule.forRootAsync({
          name: EVENTSTORE_NAME,
          aggregates: [...userModels, networkModel],
          logging: eventstoreConfig.isLogging(),
          snapshotInterval: eventstoreConfig.EVENTSTORE_SNAPSHOT_INTERVAL,
          sqliteBatchSize: eventstoreConfig.EVENTSTORE_INSERT_BATCH_SIZE,
          type: eventstoreConfig.EVENTSTORE_DB_TYPE,
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
          blocksCommandExecutor: NetworkCommandFactoryService,
          maxBlockHeight: businessConfig.MAX_BLOCK_HEIGHT,
          queueLoaderStrategyName: blocksQueueConfig.BLOCKS_QUEUE_LOADER_STRATEGY_NAME,
          basePreloadCount: blocksQueueConfig.BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT,
          blockSize: businessConfig.NETWORK_MAX_BLOCK_WEIGHT,
          queueLoaderRequestBlocksBatchSize,
          queueIteratorBlocksBatchSize,
          maxQueueSize,
          minTransferSize,
        }),
      ],
      providers: [
        {
          provide: AppConfig,
          useValue: appConfig,
        },
        {
          provide: BusinessConfig,
          useValue: businessConfig,
        },
        {
          provide: BlocksQueueConfig,
          useValue: blocksQueueConfig,
        },
        {
          provide: EventStoreConfig,
          useValue: eventstoreConfig,
        },
        {
          provide: ProvidersConfig,
          useValue: providersConfig,
        },
        {
          provide: 'FrameworkModelsConstructors',
          useValue: Models,
        },
        {
          provide: 'FrameworModelFactory',
          useFactory: (eventStoreWriteRepository: EventStoreWriteRepository, eventPublisher: EventPublisher) =>
            new ModelFactoryService(eventStoreWriteRepository, eventPublisher),
          inject: [EventStoreWriteRepository, EventPublisher],
        },
        AppService,
        MetricsService,
        ArithmeticService,
        NetworkSaga,
        NetworkCommandFactoryService,
        NetworkModelFactoryService,
        ReadStateExceptionHandlerService,
        CqrsFactoryService,
        ConsolePromptService,
        ...CommandHandlers,
        ...EventsHandlers,
        ...QueryHandlers,
        ...UserQueryHandlers,
        ...UserEventHandlers,
        ...Providers,
      ],
      exports: [],
    };
  }
}
