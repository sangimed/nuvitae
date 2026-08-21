import type { Provider } from "@nestjs/common";

export interface ProductRuntimeConfig {
  readonly privateStorageRoot: string;
  readonly privateStorageSigningSecret: string;
  readonly maxSignedReferenceTtlSeconds: number;
  readonly providerSessionRoot: string;
  readonly providerSessionEncryptionSecret: string;
  readonly maxProviderSessionBytes: number;
}

export const PRODUCT_RUNTIME_CONFIG = Symbol("PRODUCT_RUNTIME_CONFIG");

export interface ProductRuntimeModuleOptions {
  readonly configProvider: Provider;
}
