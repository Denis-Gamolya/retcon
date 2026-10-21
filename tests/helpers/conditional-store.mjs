import assert from 'node:assert/strict';

/** Model one atomic Blobs compare-and-swap, with optional forced contention. */
export function conditionalStore({ conflicts = 0 } = {}) {
  const entries = new Map();
  let revision = 0;
  return {
    entries,
    async getWithMetadata(key, options) {
      assert.equal(options.consistency, 'strong');
      return structuredClone(entries.get(key) ?? null);
    },
    async setJSON(key, data, conditions) {
      assert.ok(conditions.onlyIfNew || conditions.onlyIfMatch);
      if (conflicts-- > 0) return { modified: false };
      const current = entries.get(key);
      if (conditions.onlyIfNew ? current : current?.etag !== conditions.onlyIfMatch) return { modified: false };
      const etag = `revision-${++revision}`;
      entries.set(key, { data: structuredClone(data), etag, metadata: {} });
      return { modified: true, etag };
    },
  };
}
