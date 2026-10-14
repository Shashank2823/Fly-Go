/**
 * Port for binary file storage (ticket PDFs). Local disk in development; an S3-compatible
 * implementation can replace it without touching the tickets module.
 */
export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface FileStorage {
  /** Writes atomically: readers never observe a partially written file. */
  put(key: string, data: Buffer): Promise<void>;
  /** Returns null when the object does not exist. */
  get(key: string): Promise<Buffer | null>;
}
