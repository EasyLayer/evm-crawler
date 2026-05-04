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
  }

  public async exec(query: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.exec(query, (err) => (err ? reject(err) : resolve()));
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
