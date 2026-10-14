import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { AppConfig } from '../../config/app-config';
import type { FileStorage } from './file-storage';

/** Repo root, from src/infrastructure/storage (or dist/infrastructure/storage). */
const REPO_ROOT = resolve(__dirname, '../../../../..');

@Injectable()
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(config: AppConfig) {
    const dir = config.get('TICKET_STORAGE_DIR');
    this.root = isAbsolute(dir) ? dir : resolve(REPO_ROOT, dir);
  }

  /** Maps a storage key to a path, refusing anything that would escape the storage root. */
  private pathFor(key: string): string {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${randomUUID()}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, target);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }
}
