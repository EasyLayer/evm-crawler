# EVM Native Balance Watcher

This example watches one or more Ethereum addresses and stores native coin balances in wei.

## What it does

- reads addresses from `WATCH_ADDRESSES`
- for every processed block, fetches the real native balance for each watched address at that exact block height
- stores snapshots via `processBlock()` + `onNativeBalanceSnapshotCaptured()`
- exposes `GetBalanceQuery` to fetch the latest known balances

## Recommended mainnet usage

For Ethereum mainnet, keep `START_BLOCK_HEIGHT` empty so the crawler starts from the current tip and waits for new blocks. If you want a short historical replay, set `START_BLOCK_HEIGHT` close to the current chain height.

Copy `.env.example` to `.env`, put your Chainstack HTTP endpoint into `PROVIDER_NETWORK_RPC_URLS`, then run `yarn start`.
