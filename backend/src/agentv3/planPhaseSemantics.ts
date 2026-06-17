// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import type { PlanPhase } from './types';

type PlanPhaseIdentity = Pick<PlanPhase, 'id' | 'name' | 'goal'>;

const CONCLUSION_LIKE_PHASE_PATTERN =
  /(综合结论|最终结论|结论输出|输出结论|输出最终报告|最终报告|综合报告|优化建议|final conclusion|\bconclusion\b|final report|analysis report|final answer|write final answer|overall summary|final summary|recommendations?|optimization recommendations?|synthesis)/i;

export function isConclusionLikePlanPhase(phase: PlanPhaseIdentity): boolean {
  return CONCLUSION_LIKE_PHASE_PATTERN.test(`${phase.id} ${phase.name} ${phase.goal}`);
}
