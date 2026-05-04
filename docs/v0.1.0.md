# @easylayer/evm-crawler

A self-hosted framework for building custom EVM blockchain indexers.  
Define what data you care about, point it at an EVM RPC provider or your own node, and get a live + historical event stream with automatic reorg handling.

Built on **Event Sourcing + CQRS**. Ships **CJS and ESM Node bundles** and keeps the same model/query API across HTTP, WS, TCP, and IPC transports.

---

<!-- KEY-FEATURES-START -->
## Overview

EVM Crawler lets you build application-specific read models on top of Ethereum-style chains without coupling your business logic to raw RPC calls.

You define one or more models, `bootstrap()` the crawler, and the framework handles:
- historical sync from any start height,
- live block processing,
- event persistence in SQLite or PostgreSQL,
- reorg rollback and replay,
- transport exposure for queries and live events.

It is designed for **self-hosted** usage and works with providers such as QuickNode/Chainstack or with your own node.

## Key Features
- **Historical + real-time indexing** from any block height
- **Automatic reorg handling** with rollback/replay of affected aggregates
- **Class-based and declarative models**
- **HTTP, WebSocket, TCP, and IPC transports**
- **SQLite or PostgreSQL EventStore**
- **Custom query handlers** for your own API surface
- **EVM-specific runtime options** for receipts, traces, mempool, and provider types
- **Multiple provider adapters** via `ethersjs` or `web3js`
<!-- KEY-FEATURES-END -->

<!-- PERFORMANCE-START -->
## Performance (TODO)

EVM Crawler is engineered for high-speed operation, but actual performance is primarily influenced by two factors: network latency when fetching blocks from the blockchain and the efficiency of inserting large datasets into database, depending on your model structure.

<!-- PERFORMANCE-END -->

<!-- SETUP-START -->
## Installation

```bash
npm install @easylayer/evm-crawler
# or
yarn add @easylayer/evm-crawler
```

**Requirements:** Node.js ≥ 20 · TypeScript (recommended) · EVM RPC provider or your own node

---

## How It Works

1. You define a **Model** — either a class or a declarative descriptor.
2. `bootstrap()` starts the crawler. It restores existing aggregates from the EventStore, syncs missing history if needed, and then follows new blocks in real time.
3. For each block, your model's `processBlock()` logic or declarative reducers run.
4. Your model emits domain events via `applyEvent()`.
5. Events are persisted and can be queried or streamed to clients via the transport layer.

---

## Quick Start (Node.js)

### 1. Create a class-based model

```ts
// model.ts
import { Model } from '@easylayer/evm-crawler';
import type { Block, Transaction } from '@easylayer/evm';

export class NativeTransfers extends Model {
  static override modelId = 'native-transfers';

  public balances = new Map<string, string>();

  async processBlock(ctx: { block: Block }) {
    const block = ctx.block;
    const deltas: Array<{ address: string; amount: string }> = [];

    for (const tx of block.transactions ?? []) {
      if (!tx.to) continue;
      if (tx.value === '0') continue;
      deltas.push({ address: tx.to, amount: tx.value });
    }

    if (deltas.length > 0) {
      this.applyEvent('NativeTransferObserved', block.blockNumber, { deltas });
    }
  }

  protected onNativeTransferObserved(e: any) {
    for (const { address, amount } of e.payload.deltas) {
      const prev = BigInt(this.balances.get(address) ?? '0');
      this.balances.set(address, (prev + BigInt(amount)).toString());
    }
  }
}
```

### 2. Bootstrap

```ts
// main.ts
import { bootstrap } from '@easylayer/evm-crawler';
import { NativeTransfers } from './model';

bootstrap({
  Models: [NativeTransfers],
});
```

### 3. Configure via `.env`

```bash
# Minimum required
PROVIDER_NETWORK_RPC_URLS=https://your-rpc-endpoint
PROVIDER_TYPE=ethersjs
NETWORK_CHAIN_ID=1

# Optional — historical sync vs live-only mode
START_BLOCK_HEIGHT=19000000     # omit to start from current tip and follow only new blocks
MAX_BLOCK_HEIGHT=19001000       # inclusive upper bound; omit for no limit

# EventStore (default: SQLite)
EVENTSTORE_DB_TYPE=sqlite

# Transport (enable at least one for clients to connect)
TRANSPORT_HTTP_HOST=0.0.0.0
TRANSPORT_HTTP_PORT=3000

# EVM-specific defaults
TRACES_ENABLED=false
NETWORK_SUPPORTS_TRACES=false
NETWORK_VERIFY_TRIE=false
```

### 4. Query the state

```bash
curl -X POST http://localhost:3000/query   -H "Content-Type: application/json"   -d '{"name":"GetModelsQuery","dto":{"modelIds":["native-transfers"]}}'
```

---

## Models

### Declarative Model (less boilerplate)

Use declarative models when your logic is mostly “scan a block/log/trace/transaction and reduce state”.

```ts
import type { DeclarativeModel } from '@easylayer/evm-crawler';
import { compileStateModelEVM } from '@easylayer/evm-crawler';

const TransfersModel: DeclarativeModel<any> = {
  modelId: 'native-transfers',

  state: {
    balances: new Map<string, string>(),
  },

  sources: {
    async ['block.transactions'](ctx) {
      if (!ctx.tx.to) return;
      if (ctx.tx.value === '0') return;
      return { address: ctx.tx.to, amount: ctx.tx.value };
    },

    async block(ctx) {
      const deltas = ctx.locals['block.transactions'] ?? [];
      if (deltas.length > 0) {
        ctx.applyEvent('NativeTransferObserved', ctx.block.blockNumber, { deltas });
      }
    },
  },

  reducers: {
    NativeTransferObserved(state, e) {
      for (const { address, amount } of e.payload.deltas) {
        const prev = BigInt(state.balances.get(address) ?? '0');
        state.balances.set(address, (prev + BigInt(amount)).toString());
      }
    },
  },
};

export const NativeTransfers = compileStateModelEVM(TransfersModel);
```

### Class-Based Model (more control)

Use class-based models when you need full control over iteration, cross-transaction logic, mixed block/receipt/trace handling, or custom mempool behaviour.

```ts
import { Model } from '@easylayer/evm-crawler';
import type { Block } from '@easylayer/evm';

export class ContractCallTracker extends Model {
  static override modelId = 'contract-calls';

  public calls = 0;

  async processBlock(ctx: { block: Block }) {
    for (const trace of ctx.block.traces ?? []) {
      if (trace.type !== 'call') continue;
      this.applyEvent('ContractCallObserved', ctx.block.blockNumber, {
        transactionHash: trace.transactionHash,
        traceType: trace.type,
      });
    }
  }

  protected onContractCallObserved() {
    this.calls += 1;
  }
}
```

**Rule of thumb:** use **declarative** for straightforward block / transaction / log / trace scanning, and **class-based** when you need full control over branching, custom state mutation, or more complex EVM-specific logic.

---

## Bootstrap Options

```ts
bootstrap({
  Models: [],          // Your model classes / compiled declarative models
  QueryHandlers: [],   // Custom query handler classes
  EventHandlers: [],   // Custom event handler classes
  Providers: [],       // Additional NestJS providers
});
```

All fields are optional. You can bootstrap with an empty `Models` array if you only want system aggregates and transport access.

---

## Custom Query Handlers

```ts
import { IQueryHandler, QueryHandler } from '@easylayer/common/cqrs';

class GetNativeBalanceQuery {
  constructor(public readonly addresses: string[]) {}
}

@QueryHandler(GetNativeBalanceQuery)
class GetNativeBalanceQueryHandler implements IQueryHandler<GetNativeBalanceQuery> {
  constructor(private readonly modelFactory: any) {}

  async execute(query: GetNativeBalanceQuery) {
    const model = await this.modelFactory.restoreModel(NativeTransfers);
    return query.addresses.map((address) => ({
      address,
      balance: model.balances.get(address) ?? '0',
    }));
  }
}

bootstrap({
  Models: [NativeTransfers],
  QueryHandlers: [GetNativeBalanceQueryHandler],
});
```

Query it:
```bash
curl -X POST http://localhost:3000/query   -H "Content-Type: application/json"   -d '{"name":"GetNativeBalanceQuery","dto":{"addresses":["0xabc..."]}}'
```

---

## EVM-Specific Runtime Notes

### Historical sync vs live-only
- If `START_BLOCK_HEIGHT` is set, the crawler syncs from that height.
- If `START_BLOCK_HEIGHT` is omitted, the crawler starts from the current tip and follows new blocks only.
- `START_BLOCK_HEIGHT=0` means start from **genesis**.
- `MAX_BLOCK_HEIGHT` is an **inclusive height ceiling**, not a “number of blocks” counter.

### Receipts and traces
- `TRACES_ENABLED=false` by default.
- `NETWORK_SUPPORTS_TRACES=false` by default.
- Enable trace loading only when your provider really supports it.
- Trace loading strategy is controlled by `NETWORK_TRACE_STRATEGY` (`auto`, `debug-trace`, `parity-trace`).
- Receipt loading strategy is controlled by `NETWORK_RECEIPTS_STRATEGY` (`auto`, `block-receipts`, `transaction-receipts`).

### Trie verification
- `NETWORK_VERIFY_TRIE=false` by default.
- Enable it only when you explicitly want block-level verification of trie-related data and your provider behaviour is known to be compatible with it.

### Mempool
- If no mempool providers are configured, mempool mode is disabled.
- Configure mempool explicitly via `PROVIDER_MEMPOOL_RPC_URLS` and/or `PROVIDER_MEMPOOL_WS_URLS`.
- Use `mempoolTick()` in class-based models if you need pending-transaction state.

### Provider adapters
- `PROVIDER_TYPE=ethersjs` is the default path.
- `PROVIDER_TYPE=web3js` is supported when you need that provider stack instead.

### Reorgs
- Reorg handling is automatic.
- System aggregates (`network`, `mempool`) and your custom models are rolled back and replayed as needed.

---

## Common Network Examples

### Ethereum Mainnet

```bash
PROVIDER_NETWORK_RPC_URLS=https://your-ethereum-rpc
PROVIDER_TYPE=ethersjs
NETWORK_CHAIN_ID=1
NETWORK_NATIVE_CURRENCY_SYMBOL=ETH
NETWORK_NATIVE_CURRENCY_DECIMALS=18
NETWORK_BLOCK_TIME_SECONDS=12
NETWORK_TARGET_BLOCK_TIME_MS=12000
NETWORK_HAS_EIP1559=true
NETWORK_HAS_WITHDRAWALS=true
NETWORK_HAS_BLOB_TRANSACTIONS=true
TRACES_ENABLED=false
NETWORK_SUPPORTS_TRACES=false
```

### BNB Smart Chain (BSC)

```bash
PROVIDER_NETWORK_RPC_URLS=https://your-bsc-rpc
PROVIDER_TYPE=ethersjs
NETWORK_CHAIN_ID=56
NETWORK_NATIVE_CURRENCY_SYMBOL=BNB
NETWORK_NATIVE_CURRENCY_DECIMALS=18
NETWORK_BLOCK_TIME_SECONDS=3
NETWORK_TARGET_BLOCK_TIME_MS=3000
NETWORK_HAS_EIP1559=false
NETWORK_HAS_WITHDRAWALS=false
NETWORK_HAS_BLOB_TRANSACTIONS=false
TRACES_ENABLED=false
NETWORK_SUPPORTS_TRACES=false
```

### Polygon PoS

```bash
PROVIDER_NETWORK_RPC_URLS=https://your-polygon-rpc
PROVIDER_TYPE=ethersjs
NETWORK_CHAIN_ID=137
NETWORK_NATIVE_CURRENCY_SYMBOL=POL
NETWORK_NATIVE_CURRENCY_DECIMALS=18
NETWORK_BLOCK_TIME_SECONDS=2
NETWORK_TARGET_BLOCK_TIME_MS=2000
NETWORK_HAS_EIP1559=true
NETWORK_HAS_WITHDRAWALS=false
NETWORK_HAS_BLOB_TRANSACTIONS=false
TRACES_ENABLED=false
NETWORK_SUPPORTS_TRACES=false
```

---

<!-- TRANSPORT-API-REFERENCE-START -->
## Transport API Reference

Clients can query current model state or fetch events over any enabled transport. HTTP is the simplest path for backend integrations; WS/TCP/IPC are useful for long-lived clients and live event streaming.

### Built-in queries

The crawler exposes two built-in query types:

1. **GetModelsQuery** — restore one or more aggregates at the latest or specified block height
2. **FetchEventsQuery** — fetch persisted events with filtering and pagination

#### `GetModelsQuery`

```json
{
  "name": "GetModelsQuery",
  "dto": {
    "modelIds": ["native-transfers"],
    "filter": {
      "blockHeight": 19000010
    }
  }
}
```

#### `FetchEventsQuery`

```json
{
  "name": "FetchEventsQuery",
  "dto": {
    "modelIds": ["native-transfers"],
    "filter": {},
    "paging": {
      "limit": 10,
      "offset": 0
    }
  }
}
```

### HTTP example

```bash
curl -X POST http://localhost:3000/query   -H "Content-Type: application/json"   -d '{"name":"FetchEventsQuery","dto":{"modelIds":["network"],"filter":{},"paging":{"limit":10}}}'
```

### WebSocket / IPC / TCP

For streaming transports, use [`@easylayer/transport-sdk`](https://www.npmjs.com/package/@easylayer/transport-sdk) and subscribe to domain events such as `EvmNetworkBlocksAddedEvent` or your own model events.

Typical flow:
1. connect to the chosen transport,
2. subscribe to the event names you care about,
3. issue `GetModelsQuery` / `FetchEventsQuery` over the same client,
4. keep the connection alive for live events.

### Recommended transport usage
- **HTTP** — simple backend queries and admin endpoints
- **WS** — browser or server clients that need live events
- **IPC** — child-process embedding in Node.js
- **TCP** — custom internal service integrations

<!-- TRANSPORT-API-REFERENCE-END -->

<!-- CONFIG-START -->
## Configuration Reference

### AppConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `APPLICATION_NAME` | string | Application name used for eventstore naming and logging |  | ✅ |
| `LOG_LEVEL` | string | Log level: trace | debug | info | warn | error | fatal |  |  |
| `TRACE` | undefined | Enable trace-level logging |  |  |

### BlocksQueueConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `BLOCKS_QUEUE_LOADER_STRATEGY_NAME` | string | Block loading strategy: rpc | subscribe-ws |  | ✅ |
| `BLOCKS_QUEUE_LOADER_PRELOADER_BASE_COUNT` | number | Base number of blocks to preload in parallel. |  | ✅ |
| `MEMPOOL_LOADER_STRATEGY_NAME` | string | Mempool loading strategy: subscribe-ws | txpool-content |  | ✅ |

### BootstrapConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|

### BusinessConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `NETWORK_CHAIN_ID` | number | EVM chain ID. This is crawler/runtime config, not a preset from @easylayer/evm. |  | ✅ |
| `NETWORK_NATIVE_CURRENCY_SYMBOL` | string | Native currency symbol for the target EVM chain. |  |  |
| `NETWORK_NATIVE_CURRENCY_DECIMALS` | number | Native currency decimals for the target EVM chain. |  |  |
| `NETWORK_BLOCK_TIME_SECONDS` | number | Average block time in seconds. |  |  |
| `NETWORK_HAS_EIP1559` | boolean | Whether the target EVM chain supports EIP-1559 baseFeePerGas fields. |  |  |
| `NETWORK_HAS_WITHDRAWALS` | boolean | Whether the target EVM chain exposes post-Shanghai withdrawals fields. |  |  |
| `NETWORK_HAS_BLOB_TRANSACTIONS` | boolean | Whether the target EVM chain exposes blob transaction / EIP-4844 fields. |  |  |
| `NETWORK_MAX_BLOCK_SIZE` | number | Max block size in bytes. Runtime parameter supplied by evm-crawler. |  | ✅ |
| `NETWORK_MAX_BLOCK_WEIGHT` | number | Max block weight/queue weight in bytes. Runtime parameter supplied by evm-crawler. |  | ✅ |
| `NETWORK_MAX_GAS_LIMIT` | number | Max gas limit for the target EVM chain. |  |  |
| `NETWORK_MAX_TRANSACTION_SIZE` | number | Max serialized transaction size in bytes. |  |  |
| `NETWORK_MIN_GAS_PRICE` | string | Minimum gas price in wei as decimal string. |  |  |
| `NETWORK_MAX_BASE_FEE_PER_GAS` | string | Optional max base fee per gas in wei as decimal string. |  |  |
| `NETWORK_MAX_PRIORITY_FEE_PER_GAS` | string | Optional max priority fee per gas in wei as decimal string. |  |  |
| `NETWORK_MAX_BLOB_GAS_PER_BLOCK` | number | Optional max blob gas per block. |  |  |
| `NETWORK_TARGET_BLOB_GAS_PER_BLOCK` | number | Optional target blob gas per block. |  |  |
| `NETWORK_MAX_CODE_SIZE` | number | Max EVM contract bytecode size. |  |  |
| `NETWORK_MAX_INIT_CODE_SIZE` | number | Max EVM initcode size. |  |  |
| `NETWORK_SUPPORTS_TRACES` | boolean | Whether the configured provider/chain should support debug/trace RPC APIs. |  |  |
| `NETWORK_RECEIPTS_STRATEGY` | string | Receipts loading strategy: auto | block-receipts | transaction-receipts. |  |  |
| `NETWORK_TRACE_STRATEGY` | string | Trace loading strategy: auto | debug-trace | parity-trace. |  |  |
| `NETWORK_TARGET_BLOCK_TIME_MS` | number | Target block time in milliseconds. |  | ✅ |
| `START_BLOCK_HEIGHT` | number | Start indexing from this block height. Undefined = current tip. |  |  |
| `MAX_BLOCK_HEIGHT` | number | Stop indexing at this block height. Undefined = no limit. |  |  |
| `NETWORK_VERIFY_TRIE` | boolean | Enable transactionsRoot/receiptsRoot verification for loaded blocks. Disabled by default. |  |  |
| `TRACES_ENABLED` | boolean | Load trace data for each block. Provider must support trace APIs; otherwise startup/load must fail. |  |  |
| `MEMPOOL_PENDING_TX_TTL_MS` | number | TTL for pending mempool transactions in milliseconds. |  |  |
| `MEMPOOL_MAX_PENDING_TX_COUNT` | number | Maximum number of pending transactions to track in mempool aggregate. |  |  |

### EventStoreConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `EVENTSTORE_DB_NAME` | string | For SQLite: folder path where the database file will be created; For Postgres: name of the database to connect to. | `"resolve(process.cwd(), eventstore"` | ✅ |
| `EVENTSTORE_DB_TYPE` | string | Type of database for the eventstore. | `"sqlite"` | ✅ |
| `EVENTSTORE_DB_SYNCHRONIZE` | boolean | Automatic synchronization that creates or updates tables and columns. Use with caution. | `true` | ✅ |
| `EVENTSTORE_DB_HOST` | string | Host for the eventstore database connection. |  |  |
| `EVENTSTORE_DB_PORT` | number | Port for the eventstore database connection. |  |  |
| `EVENTSTORE_DB_USERNAME` | string | Username for the eventstore database connection. |  |  |
| `EVENTSTORE_DB_PASSWORD` | string | Password for the eventstore database connection. |  |  |
| `EVENTSTORE_SQLITE_RUNTIME_BASE_URL` | string | Base URL for @sqlite.org/sqlite-wasm browser runtime files. Only used in browser (sqlite-opfs) mode. The directory must contain index.mjs, sqlite3.wasm, and required worker runtime files such as sqlite3-worker1.mjs. |  |  |

### ProvidersConfig

| Property | Type | Description | Default | Required |
|---|---|---|---|:---:|
| `PROVIDER_TYPE` | string | Provider type: ethersjs | web3js |  | ✅ |
| `PROVIDER_NETWORK_RPC_URLS` | undefined | Network RPC HTTP URLs (comma-separated) |  |  |
| `PROVIDER_NETWORK_WS_URLS` | undefined | Network WebSocket URLs (comma-separated). Required for subscribe-ws block strategy. |  |  |
| `PROVIDER_MEMPOOL_RPC_URLS` | undefined | Mempool RPC HTTP URLs (comma-separated). Enables txpool-content mempool tracking. |  |  |
| `PROVIDER_MEMPOOL_WS_URLS` | undefined | Mempool WebSocket URLs (comma-separated). Enables subscribe-ws mempool tracking. |  |  |
| `PROVIDER_RATE_LIMIT_MAX_BATCH_SIZE` | number | Maximum batch size for RPC requests. |  | ✅ |
| `PROVIDER_RATE_LIMIT_MAX_CONCURRENT_REQUESTS` | number | Maximum concurrent RPC requests. |  | ✅ |
| `PROVIDER_RATE_LIMIT_REQUEST_DELAY_MS` | number | Delay between RPC request batches in milliseconds. |  | ✅ |


<!-- CONFIG-END -->
