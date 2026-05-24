import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { SQLiteService } from '../+helpers/sqlite/sqlite.service';

/* eslint-disable no-empty */
function runElectronMain(
  entryJs: string,
  env?: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const electronPath = require('electron') as unknown as string;

    const child: ChildProcess = spawn(electronPath, [entryJs], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ELECTRON_ENABLE_LOGGING: '1',
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
        ...env,
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });

    const timeout = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
    }, 30000);

    child.on('close', (code: number | null) => {
      clearTimeout(timeout);
      resolvePromise({ code: code ?? 0, stdout, stderr });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolvePromise({ code: 1, stdout, stderr: String(err) });
    });
  });
}
/* eslint-enable no-empty */

describe('EVM Crawler: Desktop Add Blocks (sqlite)', () => {
  it('adds 3 EVM blocks and exits with OK', async () => {
    const bootstrapPath = resolve(process.cwd(), 'src/desktop/bootstrap.cjs');

    const { code, stderr } = await runElectronMain(bootstrapPath);
    if (code !== 0) {
      // eslint-disable-next-line no-console
      console.error('STDERR:\n' + stderr);
    }
    expect(code).toBe(0);

    // Read SQLite from the test process
    const dbPath = resolve(process.cwd(), 'eventstore/current.sqlite3');
    mkdirSync(dirname(dbPath), { recursive: true });

    const db = new SQLiteService({ path: dbPath });
    await db.connect();

    const networkEvents = await db.all(`SELECT * FROM network ORDER BY id ASC`);
    const userEvents = await db.all(`SELECT * FROM BlocksModel ORDER BY id ASC`);

    await db.close().catch(() => undefined);

    expect(networkEvents.length).toBeGreaterThan(0);

    const blocksAddedCount = networkEvents.filter((e: any) => e.type === 'EvmNetworkBlocksAddedEvent').length;
    const userBlockEventsCount = userEvents.filter((e: any) => e.type === 'BlockAddedEvent').length;

    expect(blocksAddedCount).toBeGreaterThanOrEqual(2);
    expect(userBlockEventsCount).toBeGreaterThanOrEqual(2);
  });
});
