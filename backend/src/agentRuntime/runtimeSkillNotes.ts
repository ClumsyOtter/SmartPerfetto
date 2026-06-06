// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

import { SkillNotesBudget } from '../agentv3/selfImprove/skillNotesInjector';

function parseQuickBudgetEnv(): number | undefined {
  const v = process.env.SELF_IMPROVE_QUICK_NOTES_BUDGET;
  if (!v) return undefined;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function createRuntimeSkillNotesBudget(lightweight: boolean): SkillNotesBudget | undefined {
  if (process.env.SELF_IMPROVE_NOTES_INJECT_ENABLED !== '1') return undefined;
  if (!lightweight) return new SkillNotesBudget({ mode: 'full' });
  return new SkillNotesBudget({
    mode: 'quick',
    quickOverrideTotal: parseQuickBudgetEnv(),
  });
}
