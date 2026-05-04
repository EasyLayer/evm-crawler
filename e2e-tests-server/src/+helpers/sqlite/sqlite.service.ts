import * as sqlite3 from 'sqlite3';

export interface SQLiteConfig {
  path: string;
}

export class SQLiteService {
  private db!: sqlite3.Database | null;
  private _path: string;

  constructor({ path }: SQLiteConfig) {
    this._path = path;
  }

  public async connect(): Promise<void> {
    await this.openDatabase();

    // Tell SQLite to retry internally for up to 5s if the DB is locked.
    // Works at C-library level — unaffected by jest fake timers.
    await this.exec('PRAGMA busy_timeout = 5000');

    // Attempt a passive WAL checkpoint: flushes any WAL pages left by the
    // just-closed NestJS app connection back into the main DB file.
    // Passive mode never blocks — only checkpoints pages safe to flush now.
    await this.exec('PRAGMA wal_checkpoint(PASSIVE)');

    // Run a no-op read to confirm the lock has been released.
    // With busy_timeout=5000 this will block up to 5s at C level if needed.
    await this.get('SELECT 1');
  }

  public async exec(query: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.exec(query, (err) => (err ? reject(err) : resolve()));
    });
  }

  public async get(query: string, params: any[] = []): Promise<any> {
    return new Promise((resolve, reject) => {
      this.db!.get(query, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
  }

  public async all(query: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db!.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      this.db.close((err) => {
        if (err) return reject(err);
        this.db = null;
        resolve();
      });
    });
  }

  private async openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this._path, (err) => (err ? reject(err) : resolve()));
    });
  }
}

export function payloadToObject(p: any): any {
  if (p == null) return p;
  if (Buffer.isBuffer(p)) return JSON.parse(p.toString('utf8'));
  if (typeof p === 'string') {
    try {
      return JSON.parse(p);
    } catch {
      return p;
    }
  }
  return p;
}
