// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import type { TraceDataset } from '../agent/core/orchestratorTypes';
import type { Finding, ConversationTurn } from '../agent/types';
import {
  DEFAULT_OUTPUT_LANGUAGE,
  localize,
  type OutputLanguage,
} from '../agentv3/outputLanguage';

export function formatTraceContext(
  datasets: TraceDataset[] | undefined,
  outputLanguage: OutputLanguage = DEFAULT_OUTPUT_LANGUAGE,
): string {
  if (!datasets || datasets.length === 0) return '';
  const parts = datasets.map((d) => {
    const header = `| ${d.columns.join(' | ')} |`;
    const sep = `| ${d.columns.map(() => '---').join(' | ')} |`;
    const rows = d.rows.slice(0, 100).map(
      (r) => `| ${r.map((v) => String(v ?? '-')).join(' | ')} |`,
    );
    const truncNote = d.rows.length > 100
      ? localize(outputLanguage, `\n*(前 100 行，共 ${d.rows.length} 行)*`, `\n*(first 100 rows out of ${d.rows.length})*`)
      : '';
    return `### ${d.label}\n${header}\n${sep}\n${rows.join('\n')}${truncNote}`;
  });
  return localize(
    outputLanguage,
    `## 前端预查询 Trace 数据\n\n以下数据已由前端查询完毕，直接使用，无需重复 SQL 查询：\n\n${parts.join('\n\n')}`,
    `## Frontend Pre-queried Trace Data\n\nThe frontend has already queried the following data. Use it directly; do not repeat the same SQL query.\n\n${parts.join('\n\n')}`,
  );
}

function compactForPrompt(value: unknown, maxChars: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1))}...`;
}

export function buildQuickConversationContext(
  previousTurns: ConversationTurn[],
  outputLanguage: OutputLanguage = DEFAULT_OUTPUT_LANGUAGE,
): string | undefined {
  const turns = previousTurns.filter(turn => turn.completed).slice(-3);
  if (turns.length === 0) return undefined;

  const lines = [
    localize(
      outputLanguage,
      '## 最近对话上下文\n\n以下是 SmartPerfetto 本地保存的最近问答，用于理解“继续/刚才/这个”等指代；不要把它当作当前问题的新证据。',
      '## Recent Conversation Context\n\nThe following recent SmartPerfetto turns are local context for references like "continue", "earlier", or "this"; do not treat them as new evidence for the current question.',
    ),
  ];

  for (const turn of turns) {
    const query = compactForPrompt(turn.query, 220);
    const answer = compactForPrompt(turn.result?.message || '', 700);
    const findings = turn.findings
      .slice(0, 3)
      .map(f => `[${f.severity}] ${compactForPrompt(f.title, 160)}`)
      .filter(Boolean);

    lines.push(`### Turn ${turn.turnIndex + 1}`);
    lines.push(`- ${localize(outputLanguage, '用户', 'User')}: ${query}`);
    if (answer) {
      lines.push(`- ${localize(outputLanguage, '上轮回答', 'Previous answer')}: ${answer}`);
    }
    if (findings.length > 0) {
      lines.push(`- ${localize(outputLanguage, '上轮发现', 'Previous findings')}: ${findings.join('; ')}`);
    }
  }

  return lines.join('\n');
}

export function collectRecentFindings(
  sessionContext: any,
  options: { maxTurns?: number; maxFindings?: number } = {},
): Finding[] {
  try {
    let turns = sessionContext.getAllTurns?.() || [];
    if (options.maxTurns && options.maxTurns > 0) {
      turns = turns.slice(-options.maxTurns);
    }
    return turns.flatMap((turn: any) => turn.findings || []).slice(-(options.maxFindings ?? 5));
  } catch {
    return [];
  }
}
