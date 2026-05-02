import { resolve, join } from 'node:path';
import { readdir, unlink } from 'node:fs/promises';

export const cleanDataFolder = async (path: string) => {
  const dataDir = resolve(process.cwd(), path);
  try {
    const files = await readdir(dataDir);
    const toDelete = files.filter((f: string) => f !== '.gitkeep');
    await Promise.all(toDelete.map((f) => unlink(join(dataDir, f))));
  } catch {
    // Folder may not exist yet — ignore
  }
};
