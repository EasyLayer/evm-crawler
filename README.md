<p align="center">
  <img width="800" src="https://github.com/user-attachments/assets/96e47109-f9a3-47f6-87ed-ed5c3781c1a2" alt="EasyLayer How It Works"/>
</p>
<p align="center">
  <b>EVM Crawler</b> is a self-hosted framework for building real-time blockchain state services on Ethereum and EVM-compatible networks.
</p>
<br>

<p align="center">
  <a href="https://www.npmjs.com/package/@easylayer/evm-crawler"><img alt="npm version" src="https://img.shields.io/npm/v/@easylayer/evm-crawler.svg?style=flat-square"></a>
  <a href="https://www.npmjs.com/package/@easylayer/evm-crawler"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@easylayer/evm-crawler.svg?style=flat-square"></a>
  <a href="https://github.com/easylayer/evm-crawler/blob/master/LICENSE"><img alt="license" src="https://img.shields.io/github/license/easylayer/evm-crawler?style=flat-square"></a>
</p>

---

<p align="center">
  <a href="https://easylayer.io">Website</a> | <a href="https://easylayer.io/docs">Docs</a> | <a href="https://github.com/easylayer/core/discussions">Discussions</a>
</p>

<br>

# EasyLayer EVM Crawler

You define what on-chain data to track. The framework reads every block, keeps that state live and consistent, and handles chain reorganizations automatically. Your infrastructure, your data.

**Supported networks:** Ethereum (mainnet, testnets), BNB Smart Chain (BSC), Polygon, Arbitrum, Optimism, Base, and any EVM-compatible chain. Configure via `NETWORK_CHAIN_ID` — no hardcoded presets.

> The sections below are intended for contributors. If you are a user, visit the [documentation](https://easylayer.io/docs) for usage instructions.

## Table of Contents
- [How It Works](#how-it-works)
- [Key Capabilities](#key-capabilities)
- [EVM-Specific Features](#evm-specific-features)
- [Scaling to Large Datasets](#scaling-to-large-datasets)
- [Monorepo Overview](#monorepo-overview)
- [Architecture Overview](#architecture-overview)
- [Developer Setup](#developer-setup)
- [Contributing](#contributing)
- [Issue Reporting](#issue-reporting)
- [License](#license)

## How It Works

The crawler connects to an EVM node or external provider (Infura, Alchemy, QuickNode, etc.) and feeds blocks into your **State Model**: a TypeScript class or declarative object where you define what data to maintain. The framework handles everything beneath it.

- Reads blocks from any start height, syncs historical data, then switches to real-time mode automatically
- Emits state changes as an immutable event log (Event Sourcing)
- Rolls back orphaned blocks and replays the canonical chain on any reorg, automatically
- Serves your state over HTTP, WebSocket, IPC, Electron, or Browser transports

## Key Capabilities

- **Real-time state updates** on every confirmed block
- **Automatic reorg handling** of any length, no application code required — important for L2 chains where reorgs are frequent
- **Full EVM block data**: transactions, logs, receipts, and optional traces
- **Mempool monitoring** (optional) for pending transaction tracking and fee market analysis
- **Historical queries** at any past block height via Event Sourcing
- **Multiple storage backends**: SQLite (dev/desktop), PostgreSQL (production), IndexedDB (browser/Electron)
- **Five transports**: HTTP RPC, WebSocket, IPC parent/child, Electron IPC, SharedWorker (browser)
- **Cross-platform**: Node.js server, Electron desktop apps, browser extensions

## EVM-Specific Features

**Receipt strategies** — configure how receipts (and logs) are fetched:

| Strategy | Behavior |
|---|---|
| `auto` | Tries `eth_getBlockReceipts`, falls back to per-transaction |
| `block-receipts` | Strict batch mode |
| `transaction-receipts` | Strict per-transaction mode |

**Trace mode** — enable execution traces when your provider supports `debug_traceBlock` or `trace_block`:

```bash
TRACES_ENABLED=true
```

The crawler checks provider capability at startup and fails immediately if traces are unavailable, so you never get silent missing data.

**Chain ID configuration** — no hardcoded network presets. Set the chain and provider:

```bash
NETWORK_CHAIN_ID=1          # Ethereum mainnet
# NETWORK_CHAIN_ID=56       # BSC
# NETWORK_CHAIN_ID=137      # Polygon
# NETWORK_CHAIN_ID=42161    # Arbitrum
PROVIDER_NETWORK_RPC_URLS=https://your-rpc-endpoint
```

## Scaling to Large Datasets

EVM Crawler implements the **Write Model** in a CQRS architecture. It is optimized for real-time state: tracking contract events, monitoring specific addresses, maintaining live balances, indexing logs for specific contracts. For most applications this is everything needed.

For teams that need to index very large datasets (all ERC-20 transfers across a chain, full contract event history, high-volume concurrent reads) or serve high-load query traffic, the Write Model can be extended with a **Read Model**: SQL or S3 projections built on top of the same event stream, optimized for high-load queries and unlimited data volume.

We provide enterprise Read Model solutions for teams that need this layer. Details at [easylayer.io/enterprise](https://easylayer.io/enterprise).

## Monorepo Overview

| Component | Description |
|---|---|
| 📦 `package/` | Source code of the crawler |
| 🚀 `examples/` | Example applications |
| 🧪 `e2e-tests-server/` | End-to-end test suites |
| 🔌 `integration-tests/` | Integration test suites |

## Architecture Overview

The crawler is built on Event Sourcing and CQRS patterns.

**Core components:**
- **State Model** — your code, defines what state to maintain and what events to emit per block
- **Network Provider** — connects to an EVM node via JSON-RPC or WebSocket
- **EventStore** — persists all state changes as an append-only event log; supports SQLite, PostgreSQL, IndexedDB
- **Transport Layer** — exposes state to client applications over HTTP, WebSocket, IPC, Electron, or Browser
- **System Models** — built-in chain validation and mempool models available out of the box

## Developer Setup

> **Node.js:** 20 or higher required. LTS 22+ recommended.  
> **Yarn:** 4.5+ required (Yarn Berry). Included in `.yarn/releases/` — no global install needed.

1. **Clone the repository:**
```bash
git clone https://github.com/easylayer/evm-crawler.git
cd evm-crawler
```

2. **Install dependencies:**
```bash
yarn install
```

3. **Build all packages:**
```bash
yarn build
```

4. **Lint and format:**
```bash
yarn lint
# or
yarn lint:fix
```

5. **Run unit tests:**
```bash
yarn test:unit
```

6. **E2E tests:**
```bash
yarn test:e2e
```

7. **Integration tests:**
```bash
yarn test:integration
```

8. **Run an example app:**
```bash
cp .env.example .env
# Configure .env — see docs/ for parameter reference
# Navigate to the examples folder and run:
yarn start
```

## Contributing

We welcome contributions. To get started:

- Fork the repository and create a branch for your feature or fix
- Make your changes and ensure all tests and lints pass locally
- Submit a pull request to the `development` branch using the provided PR template
- Branch names and commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/) style. Allowed types: `feat`, `fix`, `infra`, `refactor`, `chore`, `BREAKING`
- All PRs are automatically checked by GitHub Actions (build, lint, unit tests)

## Issue Reporting

For bugs or feature requests related to this repository, [open an issue](https://github.com/easylayer/evm-crawler/issues/new/choose) with as much detail as possible. For issues related to other EasyLayer projects, use the appropriate repository.

## License

[MIT License](./package/LICENSE)
