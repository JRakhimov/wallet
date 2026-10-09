/** Binary storage for meal photos. Local disk for now; S3/MinIO can be added as another class. */
export interface PhotoStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export const PHOTO_STORAGE = Symbol("PHOTO_STORAGE");
