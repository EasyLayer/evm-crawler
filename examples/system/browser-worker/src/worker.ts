import { bootstrap } from '@easylayer/evm-crawler';
import { NativeBalanceWatcher } from './model';
import { GetBalanceQueryHandler } from './query';

type WorkerEnv = Record<string, string>;

declare const self: SharedWorkerGlobalScope & {
  __ENV?: WorkerEnv;
  __pendingSharedWorkerPorts?: MessagePort[];
};

const defaultWatchAddress = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const watchAddresses = String(import.meta.env.VITE_WATCH_ADDRESSES || defaultWatchAddress);

self.__pendingSharedWorkerPorts = [];
self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  port.start();
  self.__pendingSharedWorkerPorts?.push(port);
};

self.__ENV = {
  APPLICATION_NAME: 'evm-browser-worker-example',
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
  NETWORK_CHAIN_ID: '1',
  NETWORK_NATIVE_CURRENCY_SYMBOL: 'ETH',
  NETWORK_NATIVE_CURRENCY_DECIMALS: '18',
  NETWORK_BLOCK_TIME_SECONDS: '12',
  NETWORK_HAS_EIP1559: 'true',
  NETWORK_HAS_WITHDRAWALS: 'true',
  NETWORK_HAS_BLOB_TRANSACTIONS: 'true',
  NETWORK_SUPPORTS_TRACES: 'false',
  NETWORK_VERIFY_TRIE: 'false',
  TRACES_ENABLED: 'false',
  PROVIDER_NETWORK_RPC_URLS: '/rpc',
  EVENTSTORE_DB_TYPE: 'sqlite-opfs',
  EVENTSTORE_SQLITE_RUNTIME_BASE_URL: '/sqlite',
  TRANSPORT_OUTBOX_ENABLE: '1',
  TRANSPORT_OUTBOX_KIND: 'shared-worker-server',
  WATCH_ADDRESSES: watchAddresses,
};

(async () => {
  console.log('[worker] starting evm crawler...');
  await bootstrap({
    Models: [NativeBalanceWatcher],
    QueryHandlers: [GetBalanceQueryHandler],
  });
  console.log('[worker] crawler ready');
})().catch((error) => {
  console.error('[worker] bootstrap failed:', error);
});
