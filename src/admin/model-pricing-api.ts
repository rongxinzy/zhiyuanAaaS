// Mirrors AEP's versioned model-pricing contract until the next immutable SDK release.
// Reference configuration only; no billing or statistical computation happens here.
export interface ModelPriceConfiguration {
  currency: string;
  inputPricePerMillionTokens: string;
  outputPricePerMillionTokens: string;
  cachedInputPricePerMillionTokens?: string;
  source?: string;
}
export interface ModelPricing {
  modelId: string;
  version: number;
  pricing: ModelPriceConfiguration | null;
  updatedAt: string | null;
}
export interface ModelPricingWrite {
  pricing: ModelPriceConfiguration | null;
  expectedVersion: number;
}
