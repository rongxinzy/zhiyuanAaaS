export interface BatchItemResult<T> {
  readonly item: T;
  readonly ok: boolean;
  readonly error?: unknown;
}

/** Run independent admin mutations while preserving every item's outcome. */
export async function runBatch<T>(items: readonly T[], operation: (item: T) => Promise<void>): Promise<readonly BatchItemResult<T>[]> {
  return Promise.all(items.map(async item => {
    try {
      await operation(item);
      return { item, ok: true };
    } catch (error) {
      return { item, ok: false, error };
    }
  }));
}
