// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

export const SDK_SESSION_FRESHNESS_MS = 4 * 60 * 60 * 1000;
export const DEFAULT_RUNTIME_CACHE_LIMIT = 50;

export function buildRuntimeSessionMapKey(sessionId: string, referenceTraceId?: string): string {
  return referenceTraceId ? `${sessionId}:ref:${referenceTraceId}` : sessionId;
}

export function isFreshRuntimeEntry<T extends { updatedAt?: number }>(
  entry: T | undefined,
  freshnessMs = SDK_SESSION_FRESHNESS_MS,
  now = Date.now(),
): entry is T & { updatedAt: number } {
  return !!entry
    && typeof entry.updatedAt === 'number'
    && now - entry.updatedAt < freshnessMs;
}

export function getLruCacheEntry<K, V>(cache: Map<K, V>, key: K): V | undefined {
  const value = cache.get(key);
  if (value !== undefined) {
    cache.delete(key);
    cache.set(key, value);
  }
  return value;
}

export function setLruCacheEntry<K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  maxEntries = DEFAULT_RUNTIME_CACHE_LIMIT,
): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > maxEntries) {
    const first = cache.keys().next();
    if (first.done) break;
    cache.delete(first.value);
  }
}
