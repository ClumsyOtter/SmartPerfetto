// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import { describe, expect, it } from '@jest/globals';

import {
  isTruncationVerificationIssue,
  repairTruncatedFinalReport,
} from '../runtimeFinalReportRecovery';
import { verifyHeuristic } from '../engines/claude/claudeVerifier';
import type { AnalysisPlanV3, Hypothesis, PlanPhase } from '../../agentv3/types';

function makePlan(): AnalysisPlanV3 {
  const phases: PlanPhase[] = [
    {
      id: 'p1',
      name: '概览采集',
      goal: '获取帧统计',
      expectedTools: ['invoke_skill'],
      status: 'completed',
      summary: '347帧，7帧真实掉帧(2.02%)，最长帧62.73ms，证据来自 art-4 和 art-17。',
    },
    {
      id: 'p2',
      name: '根因深钻',
      goal: '执行 jank_frame_detail、frame_blocking_calls、blocking_chain_analysis',
      expectedTools: ['invoke_skill'],
      status: 'completed',
      summary: 'CustomScroll_longFrameLoad 在 animation 回调内同步执行 47-60ms；Binder/GC/锁/IO 无重叠证据。',
    },
    {
      id: 'p3',
      name: '综合结论',
      goal: '输出最终报告',
      expectedTools: [],
      status: 'completed',
      summary: '主要根因为 app 层同步长任务，次要根因为首帧 shader 编译。',
    },
  ];
  return {
    phases,
    successCriteria: '完整报告',
    submittedAt: Date.now(),
    toolCallLog: [],
  };
}

function makeHypotheses(): Hypothesis[] {
  return [
    {
      id: 'h1',
      statement: 'CustomScroll_longFrameLoad 同步执行导致 6 帧 workload_heavy 掉帧',
      status: 'confirmed',
      basis: 'frame_blocking_calls',
      evidence: 'animation 分别占用 59.31/58.84/56.28/57.77/58.04/47.91ms。',
      formedAt: Date.now(),
      resolvedAt: Date.now(),
    },
  ];
}

describe('runtime final report truncation recovery', () => {
  it('recognizes verifier truncation issues', () => {
    expect(isTruncationVerificationIssue({
      type: 'truncation',
      message: '结论文本被截断',
    })).toBe(true);
    expect(isTruncationVerificationIssue({
      type: 'missing_evidence',
      message: '缺少证据',
    })).toBe(false);
  });

  it('repairs only the incomplete final line while preserving the evidence-rich body', () => {
    const truncated = [
      '## 综合结论',
      '',
      '这份报告已经包含证据链，CustomScroll_longFrameLoad 耗时 59.31ms。',
      '',
      '## 优化建议',
      '',
      '- P0: 拆分 CustomScroll_longFrameLoad 内部添加 app-level trace section 做子步骤归因',
    ].join('\n');

    const repaired = repairTruncatedFinalReport({
      conclusion: truncated,
      plan: makePlan(),
      hypotheses: makeHypotheses(),
      outputLanguage: 'zh-CN',
    });

    expect(repaired).toBeTruthy();
    expect(repaired).toContain('CustomScroll_longFrameLoad 耗时 59.31ms');
    expect(repaired).not.toContain('添加 app-level trace section 做子步骤归因');
    expect(repaired).toContain('## 截断恢复补充');
    expect(repaired).toContain('## 置信度/限制');
    expect(repaired).toContain('confirmed: CustomScroll_longFrameLoad 同步执行导致 6 帧 workload_heavy 掉帧');

    const truncationIssues = verifyHeuristic([], repaired || '')
      .filter(issue => issue.type === 'truncation');
    expect(truncationIssues).toHaveLength(0);
  });
});
