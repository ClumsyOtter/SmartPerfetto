// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import { captureEntitiesFromResponses, applyCapturedEntities } from '../agent/core/entityCapture';

export function buildEntityContext(entityStore: any): string | undefined {
  try {
    const stats = entityStore.getStats?.();
    if (stats && stats.totalEntityCount === 0) return undefined;

    const lines: string[] = [];
    const frames = entityStore.getAllFrames?.() || [];
    if (frames.length > 0) {
      lines.push(`**帧 (${frames.length})**:`);
      for (const f of frames.slice(0, 15)) {
        const parts = [`frame_id=${f.frame_id}`];
        if (f.start_ts) parts.push(`ts=${f.start_ts}`);
        if (f.jank_type) parts.push(`jank=${f.jank_type}`);
        if (f.dur_ms) parts.push(`dur=${f.dur_ms}ms`);
        if (f.process_name) parts.push(`proc=${f.process_name}`);
        lines.push(`- ${parts.join(', ')}`);
      }
      if (frames.length > 15) lines.push(`- ...及其他 ${frames.length - 15} 帧`);
    }

    const sessions = entityStore.getAllSessions?.() || [];
    if (sessions.length > 0) {
      lines.push(`**滑动会话 (${sessions.length})**:`);
      for (const s of sessions.slice(0, 8)) {
        const parts = [`session_id=${s.session_id}`];
        if (s.start_ts) parts.push(`ts=${s.start_ts}`);
        if (s.jank_count) parts.push(`janks=${s.jank_count}`);
        if (s.process_name) parts.push(`proc=${s.process_name}`);
        lines.push(`- ${parts.join(', ')}`);
      }
    }

    return lines.length > 0 ? lines.join('\n') : undefined;
  } catch {
    return undefined;
  }
}

export function captureSkillDisplayEntities(
  displayResults: Array<{ stepId?: string; data?: any }>,
  entityStore: any,
  agentId: string,
): void {
  try {
    const data: Record<string, any> = {};
    for (const dr of displayResults) {
      if (dr.stepId && dr.data) data[dr.stepId] = dr.data;
    }
    const captured = captureEntitiesFromResponses([{
      agentId,
      success: true,
      toolResults: [{ toolName: 'invoke_skill', data }],
    } as any]);
    applyCapturedEntities(entityStore, captured);
  } catch (error) {
    console.warn(`[${agentId}] Entity capture failed:`, (error as Error).message);
  }
}
