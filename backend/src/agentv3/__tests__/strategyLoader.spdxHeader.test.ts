// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

/**
 * Regression guard for a P0 hidden bug introduced by commit b8ad6fe
 * ("add AGPL v3 SPDX headers to 609 source files").
 *
 * That commit prepended an HTML SPDX comment block to every
 * `*.strategy.md` file. The frontmatter regex previously required the
 * file to begin with `---\n`, so `parseStrategyFile()` started returning
 * `null` for every strategy — silently disabling the entire scene-
 * strategy system until v2.1 Phase 0.2 caught it. All existing
 * `__tests__` mocked `strategyLoader`, so no test caught the regression.
 *
 * This suite intentionally exercises the real loader (no mock) against
 * the on-disk strategy files to ensure scenes load even when the files
 * carry leading SPDX/license comments.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import {
  getFinalReportContract,
  getRegisteredScenes,
  getStrategyContent,
  getPhaseHints,
  invalidateStrategyCache,
  loadPromptTemplate,
} from '../strategyLoader';

describe('strategyLoader tolerates leading SPDX HTML comments', () => {
  beforeAll(() => {
    invalidateStrategyCache();
  });

  it('loads at least 12 scenes from disk', () => {
    expect(getRegisteredScenes().length).toBeGreaterThanOrEqual(12);
  });

  it('returns non-empty content for known scenes', () => {
    for (const scene of ['scrolling', 'startup', 'anr', 'memory', 'general']) {
      const content = getStrategyContent(scene);
      expect(content).toBeDefined();
      expect((content || '').length).toBeGreaterThan(100);
    }
  });

  it('returns parsed phase_hints for scenes that declare them', () => {
    // Use ranges, not exact counts, so that strategy edits that add or remove
    // hints do not break this regression test (which only asserts that the
    // SPDX-tolerant parser still recognises phase_hints at all).
    expect(getPhaseHints('scrolling').length).toBeGreaterThan(0);
    expect(getPhaseHints('startup').length).toBeGreaterThan(0);
    expect(getPhaseHints('anr').length).toBeGreaterThan(0);
  });

  it('keeps network packet data optional so missing-data guidance can still run', () => {
    const network = getRegisteredScenes().find(scene => scene.scene === 'network');
    expect(network?.requiredCapabilities).not.toContain('network_packets');
    expect(network?.optionalCapabilities).toContain('network_packets');
  });

  it('loads declarative final report contracts from strategy frontmatter', () => {
    const contract = getFinalReportContract('scrolling');
    expect(contract?.requiredSections.map(section => section.id)).toEqual(expect.arrayContaining([
      'root_cause_distribution',
      'representative_frames',
      'peak_and_semantic_metrics',
    ]));
    expect(contract?.requiredSections.find(section =>
      section.id === 'representative_frames',
    )?.patternGroups.length).toBeGreaterThan(1);

    expect(getFinalReportContract('startup')?.requiredSections.map(section => section.id)).toEqual(expect.arrayContaining([
      'startup_type_and_metrics',
      'phase_breakdown',
      'root_cause_references',
      'audience_recommendations',
    ]));
  });

  it('keeps contract-only smart strategy out of normal scene registration', () => {
    const scenes = getRegisteredScenes();
    expect(scenes).not.toContain('smart');
    expect(getStrategyContent('smart')).toBeUndefined();
    expect(getPhaseHints('smart')).toEqual([]);

    const contract = getFinalReportContract('smart');
    expect(contract?.requiredSections.map(section => section.id)).toEqual(expect.arrayContaining([
      'scene_timeline',
      'per_scene_summary',
      'cross_scene_narrative',
      'bottleneck_ranking',
    ]));
  });

  it('returns empty phase_hints array for scenes without hints', () => {
    expect(getPhaseHints('general')).toEqual([]);
    expect(getPhaseHints('memory')).toEqual([]);
  });

  it('keeps the AgentV3 output template wired for machine-parseable claim provenance', () => {
    const content = loadPromptTemplate('prompt-output-format');
    expect(content).toContain('## 逐句数据引用（结构化来源）');
    expect(content).toContain('evidence_ref_id=<data:* 或 ev_* 证据 ID>');
    expect(content).toContain('source_tool_call_id=<工具调用 ID，如可见>');
    expect(content).toContain('row_index=<0-based 行号，如可见>');
  });

  it('loads the evidence provenance knowledge topic and global evidence contract', () => {
    const outputFormat = loadPromptTemplate('prompt-output-format');
    expect(outputFormat).toContain('证据来源、置信度与版本边界');
    expect(outputFormat).toContain('trace_direct');
    expect(outputFormat).toContain('missing_evidence');

    const methodology = loadPromptTemplate('prompt-methodology');
    expect(methodology).toContain('lookup_knowledge("evidence-provenance")');
    expect(methodology).toContain('packet-level 网络 trace');

    const knowledge = loadPromptTemplate('knowledge-evidence-provenance');
    expect(knowledge).toContain('## 证据来源与置信度边界');
    expect(knowledge).toContain('external_aggregate');
    expect(knowledge).toContain('版本敏感能力');
  });

  it('keeps the quick prompt wired for machine-parseable claim provenance', () => {
    const content = loadPromptTemplate('prompt-quick');
    expect(content).toContain('## 逐句数据引用（结构化来源）');
    expect(content).toContain('evidence_ref_id=<data:* 或 ev_* 证据 ID>');
    expect(content).toContain('source_ref=<表 1/摘要 1>');
    expect(content).toContain('column=<列名>; value=<原始值>');
  });

  it('keeps the quick prompt wired to fetch Skill artifacts instead of querying pseudo-tables', () => {
    const content = loadPromptTemplate('prompt-quick');
    expect(content).toContain('## Artifact 读取规则');
    expect(content).toContain('fetch_artifact(artifactId="art-N", detail="rows", offset=0, limit=50)');
    expect(content).toContain('__intrinsic_artifact_rows');
    expect(content).toContain('这些都不是 SQL 表');
  });
});
