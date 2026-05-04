import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fork } from 'node:child_process';
import express from 'express';
import { Client } from '@easylayer/transport-sdk';
config();
const child = fork(resolve(process.cwd(), 'src/app.ts'), [], {
  execArgv: ['-r', 'ts-node/register/transpile-only'],
  stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
  env: process.env,
});
const client = new Client({ transport: { type: 'ipc-parent', options: { child } } });
client.subscribe('NativeBalanceSnapshotCaptured', async (event: any) => {
  console.log('NativeBalanceSnapshotCaptured', event);
});
const app = express();
app.use(express.json());
app.get('/balance', async (req, res) => {
  try {
    const raw = typeof req.query.addresses === 'string' ? req.query.addresses : '';
    const addresses = raw
      ? raw
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const data = await client.query<any, any>('GetBalanceQuery', { addresses });
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'internal' });
  }
});
app.get('/model', async (req, res) => {
  try {
    const modelId = String(req.query.modelId || '').trim();
    if (!modelId) return res.status(400).json({ error: 'modelId is required' });
    const blockHeightParam = req.query.blockHeight;
    const filter: any = {};
    if (blockHeightParam !== undefined && String(blockHeightParam).length) {
      const blockHeight = Number(blockHeightParam);
      if (!Number.isFinite(blockHeight) || blockHeight < 0)
        return res.status(400).json({ error: 'blockHeight must be a non-negative number' });
      filter.blockHeight = blockHeight;
    }
    const data = await client.query<any, any>('GetModelsQuery', {
      modelIds: [modelId],
      ...(Object.keys(filter).length ? { filter } : {}),
    });
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'internal' });
  }
});
app.get('/events', async (req, res) => {
  try {
    const modelId = String(req.query.modelId || '').trim();
    if (!modelId) return res.status(400).json({ error: 'modelId is required' });
    const limit = req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const offset = req.query.offset !== undefined ? Number(req.query.offset) : undefined;
    const paging: any = {};
    if (limit !== undefined) {
      if (!Number.isFinite(limit) || limit <= 0) return res.status(400).json({ error: 'limit must be positive' });
      paging.limit = limit;
    }
    if (offset !== undefined) {
      if (!Number.isFinite(offset) || offset < 0) return res.status(400).json({ error: 'offset must be non-negative' });
      paging.offset = offset;
    }
    const data = await client.query<any, any>('FetchEventsQuery', {
      modelIds: [modelId],
      filter: {},
      ...(Object.keys(paging).length ? { paging } : {}),
    });
    res.status(200).json(data);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'internal' });
  }
});
const port = Number(process.env.TRANSPORT_HTTP_PORT || 3000);
const host = process.env.TRANSPORT_HTTP_HOST || '0.0.0.0';
const server = app.listen(port, host, () => {
  console.log(`\n🚀 EVM Native Balance Watcher transport example started on http://${host}:${port}\n`);
  console.log('GET /balance?addresses=0xd8da6bf26964af9d7eed9e03e53415d37aa96045');
  console.log('GET /model?modelId=native-balance-watcher');
  console.log('GET /events?modelId=native-balance-watcher&limit=10');
});
const shutdown = async (code = 0) => {
  try {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  } catch {}
  try {
    if (child.connected) child.disconnect();
  } catch {}
  try {
    child.kill('SIGTERM');
  } catch {}
  process.exit(code);
};
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (error) => {
  console.error(error);
  shutdown(1);
});
process.on('unhandledRejection', (error) => {
  console.error(error);
  shutdown(1);
});
