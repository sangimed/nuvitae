import type { ExtractionSourceReader } from "@nuvitae/extraction";
import { LocalPrivateImportStorage } from "@nuvitae/storage";

export class LocalPrivateSourceReader implements ExtractionSourceReader {
  constructor(private readonly storage: LocalPrivateImportStorage) {}

  async readSource(input: {
    readonly sourceStorageKey: string;
    readonly maximumBytes: number;
    readonly abortSignal?: AbortSignal;
  }): Promise<Uint8Array> {
    if (input.abortSignal?.aborted === true) {
      throw new Error("aborted");
    }
    const bytes = await this.storage.readObject(input.sourceStorageKey);
    if (bytes.byteLength > input.maximumBytes) {
      return bytes.subarray(0, input.maximumBytes + 1);
    }
    return bytes;
  }
}
