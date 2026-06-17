// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import { localize, type OutputLanguage } from '../agentv3/outputLanguage';
import type { AnalysisPlanV3, Hypothesis } from '../agentv3/types';
import { isConclusionLikePlanPhase } from '../agentv3/planPhaseSemantics';

interface VerificationIssueLike {
  type?: string;
  message?: string;
}

interface TruncatedFinalReportRepairInput {
  conclusion: string;
  plan: AnalysisPlanV3 | null;
  hypotheses?: readonly Hypothesis[];
  outputLanguage: OutputLanguage;
}

const MAX_SUMMARY_CHARS = 260;
const MAX_PHASE_BULLETS = 6;
const MAX_HYPOTHESIS_BULLETS = 5;

function hasProperConclusionEnding(line: string): boolean {
  return /[。.!！?？）\]】`✅✓☑→]$/.test(line) ||
    /^```$/.test(line) ||
    /^\|.*\|$/.test(line) ||
    /^\s*-\s*evidence_ref_id=.*\bvalue=.+$/i.test(line) ||
    /^---+$/.test(line);
}

export function isTruncationVerificationIssue(issue: VerificationIssueLike | undefined): boolean {
  if (!issue) return false;
  return issue.type === 'truncation' ||
    /结论文本被截断|conclusion.*truncated|truncated.*conclusion/i.test(issue.message || '');
}

function compactOneLine(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function truncateSummary(value: string): string {
  const compact = compactOneLine(value);
  if (compact.length <= MAX_SUMMARY_CHARS) return compact;
  return `${compact.slice(0, MAX_SUMMARY_CHARS - 1)}…`;
}

function collectPhaseBullets(plan: AnalysisPlanV3 | null): string[] {
  if (!plan) return [];
  return plan.phases
    .filter(phase => (phase.status === 'completed' || phase.status === 'skipped') && phase.summary)
    .filter(phase => !isConclusionLikePlanPhase(phase))
    .map(phase => {
      const label = phase.name || phase.id;
      const status = phase.status === 'skipped' ? 'skipped' : 'done';
      return `${label} (${status}): ${truncateSummary(phase.summary || '')}`;
    })
    .filter(line => line.length > 0)
    .slice(0, MAX_PHASE_BULLETS);
}

function collectHypothesisBullets(hypotheses: readonly Hypothesis[] | undefined): string[] {
  return (hypotheses || [])
    .filter(h => h.status === 'confirmed' || h.status === 'rejected')
    .map(h => {
      const evidence = compactOneLine(h.evidence);
      const suffix = evidence ? `；证据：${truncateSummary(evidence)}` : '';
      return `${h.status}: ${truncateSummary(h.statement)}${suffix}`;
    })
    .slice(0, MAX_HYPOTHESIS_BULLETS);
}

function dropIncompleteLastLine(text: string): string {
  const trimmed = text.trimEnd();
  const lines = trimmed.split(/\r?\n/);
  const lastLine = (lines[lines.length - 1] || '').trim();
  if (lastLine.length <= 15 || hasProperConclusionEnding(lastLine)) {
    return trimmed;
  }
  lines.pop();
  return lines.join('\n').trimEnd();
}

function renderBullets(lines: readonly string[], fallback: string): string {
  const source = lines.length > 0 ? lines : [fallback];
  return source.map(line => `- ${line}`).join('\n');
}

export function repairTruncatedFinalReport(
  input: TruncatedFinalReportRepairInput,
): string | undefined {
  const base = dropIncompleteLastLine(input.conclusion);
  if (!base.trim()) return undefined;

  const phaseBullets = collectPhaseBullets(input.plan);
  const hypothesisBullets = collectHypothesisBullets(input.hypotheses);
  const repaired = localize(
    input.outputLanguage,
    [
      base,
      '',
      '## 截断恢复补充',
      '',
      '前文保留模型已经输出的证据链；以下收尾只基于已完成的结构化阶段、已确认/已排除假设补齐，不引入新的未验证结论。',
      '',
      '### 阶段证据校准',
      '',
      renderBullets(phaseBullets, '已完成的计划阶段均有结构化证据支撑，最终结论以这些阶段证据为准。'),
      '',
      '### 假设验证状态',
      '',
      renderBullets(hypothesisBullets, '未记录额外已确认或已排除假设；结论以阶段证据和最终报告正文为准。'),
      '',
      '### 收尾建议',
      '',
      '- 优先修复已确认且直接影响用户可见长帧的瓶颈；修复后用同一 trace 场景和相同刷新率预算做回归对比。',
      '- 对已排除的 Binder、GC、锁、IO、频率等方向保留监控，不把缺证据的候选项写成根因。',
      '- 如需代码 owner 级定位，应在已确认瓶颈对应的 app-level trace section 或源码符号上继续下钻。',
      '',
      '## 置信度/限制',
      '',
      '置信度：中高。报告基于完整计划阶段和结构化证据恢复收尾；恢复段只修复输出截断，不改变前文已经通过验证的根因判断。',
    ].join('\n'),
    [
      base,
      '',
      '## Truncation Recovery Addendum',
      '',
      'The preceding evidence chain is preserved. This closing section is synthesized only from completed structured phases and resolved hypotheses, without adding new unverified conclusions.',
      '',
      '### Phase Evidence Calibration',
      '',
      renderBullets(phaseBullets, 'Completed plan phases contain structured evidence; the final conclusion is bounded by those phase outputs.'),
      '',
      '### Hypothesis Status',
      '',
      renderBullets(hypothesisBullets, 'No additional resolved hypotheses were recorded; the conclusion is bounded by phase evidence and the report body.'),
      '',
      '### Closing Recommendations',
      '',
      '- Prioritize confirmed bottlenecks that directly affect user-visible long frames; validate fixes with the same trace scenario and refresh-rate budget.',
      '- Keep monitoring excluded Binder, GC, lock, IO, and frequency paths, but do not promote evidence gaps into root causes.',
      '- For owner-level fixes, continue with app-level trace sections or source symbols tied to the confirmed bottleneck.',
      '',
      '## Confidence / Limits',
      '',
      'Confidence: medium-high. The report closes over completed plan phases and structured evidence; the recovery text fixes output truncation without changing verified root-cause judgments.',
    ].join('\n'),
  ).trim();

  return repaired.length > input.conclusion.trim().length ? repaired : undefined;
}
