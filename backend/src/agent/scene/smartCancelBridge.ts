// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

export interface SmartCancelToken {
  readonly signal: AbortSignal;
  throwIfAborted(): void;
}

export class SmartCancelBridge {
  private readonly controllers = new Map<string, AbortController>();
  private readonly terminalClaims = new Set<string>();

  private key(parentSessionId: string, runId?: string): string {
    return runId ? `${parentSessionId}:${runId}` : parentSessionId;
  }

  private keysForSession(parentSessionId: string): string[] {
    const prefix = `${parentSessionId}:`;
    return [
      parentSessionId,
      ...Array.from(this.controllers.keys()).filter(key => key.startsWith(prefix)),
      ...Array.from(this.terminalClaims.values()).filter(key => key.startsWith(prefix)),
    ];
  }

  create(parentSessionId: string, runId?: string): SmartCancelToken {
    this.release(parentSessionId, runId);
    const controller = new AbortController();
    this.controllers.set(this.key(parentSessionId, runId), controller);
    return {
      signal: controller.signal,
      throwIfAborted() {
        if (controller.signal.aborted) {
          throw new Error('Smart analysis cancelled');
        }
      },
    };
  }

  cancel(parentSessionId: string, runId?: string): boolean {
    const keys = runId ? [this.key(parentSessionId, runId)] : this.keysForSession(parentSessionId);
    let cancelled = false;
    for (const key of keys) {
      const controller = this.controllers.get(key);
      if (!controller) continue;
      controller.abort();
      cancelled = true;
    }
    return cancelled;
  }

  tryClaimTerminal(parentSessionId: string, runId?: string): boolean {
    const key = this.key(parentSessionId, runId);
    if (this.terminalClaims.has(key)) return false;
    this.terminalClaims.add(key);
    return true;
  }

  release(parentSessionId: string, runId?: string): void {
    const keys = runId ? [this.key(parentSessionId, runId)] : this.keysForSession(parentSessionId);
    for (const key of keys) {
      this.controllers.delete(key);
      this.terminalClaims.delete(key);
    }
  }
}
