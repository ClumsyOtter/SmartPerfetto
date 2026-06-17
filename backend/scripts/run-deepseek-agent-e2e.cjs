#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 Gracker (Chris)
// This file is part of SmartPerfetto. See LICENSE for details.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const backendRoot = path.resolve(__dirname, '..');
const verifierPath = path.join(backendRoot, 'src/scripts/verifyAgentSseScrolling.ts');
const tsxCliPath = path.join(backendRoot, 'node_modules/tsx/dist/cli.mjs');

loadBackendEnv();

const DEFAULT_RUNTIME = 'openai-agents-sdk';
const DEEPSEEK_RUNTIME_KINDS = [
  'openai-agents-sdk',
  'pi-agent-core',
  'opencode',
];

const suites = {
  startup: {
    label: 'startup final-report gate',
    output: 'test-output/e2e-deepseek-startup-real.json',
    args: [
      '--mode',
      'full',
      '--provider-id',
      'env',
      '--trace',
      '../test-traces/lacunh_heavy.pftrace',
      '--query',
      '分析启动性能',
      '--output',
      'test-output/e2e-deepseek-startup-real.json',
      '--keep-session',
      '--require-conclusion-evidence',
      '--require-claim-verifier-ok',
      '--require-non-partial',
      '--require-final-report-heading',
      '--forbid-process-narration',
      '--forbid-degraded-fallback',
      'completed_plan_summary_fallback',
      '--require-text',
      '冷启动',
      '--require-text',
      'ChaosTask',
      '--forbid-text',
      '完成综合结论输出',
      '--forbid-text',
      '分阶段证据摘要',
      '--forbid-text',
      '完整结构化报告已生成',
      '--forbid-text',
      '应维持温启动',
      '--forbid-text',
      'bindApplication 不存在',
    ],
  },
  scrolling: {
    label: 'scrolling full analysis gate',
    output: 'test-output/e2e-deepseek-scrolling-real.json',
    args: [
      '--mode',
      'full',
      '--provider-id',
      'env',
      '--trace',
      '../test-traces/scroll-demo-customer-scroll.pftrace',
      '--query',
      '分析滑动性能',
      '--output',
      'test-output/e2e-deepseek-scrolling-real.json',
      '--keep-session',
      '--require-non-partial',
      '--require-tool',
      'invoke_skill',
      '--require-skill',
      'scrolling_analysis',
      '--require-skill',
      'jank_frame_detail',
      '--require-skill',
      'frame_blocking_calls',
      '--require-skill',
      'blocking_chain_analysis',
      '--forbid-degraded-fallback',
      'verification_failed',
    ],
  },
};

main();

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  assertFile(tsxCliPath, 'tsx CLI');
  assertFile(verifierPath, 'Agent SSE verifier');

  const credential = resolveDeepseekCredential();
  const suiteNames = options.suite === 'all' ? ['startup', 'scrolling'] : [options.suite];
  const runtimeKinds = resolveRuntimeKinds(options.runtime);

  for (const runtimeKind of runtimeKinds) {
    for (const suiteName of suiteNames) {
      runSuite(suiteName, credential, runtimeKind, runtimeKinds.length > 1 || options.runtime !== DEFAULT_RUNTIME);
    }
  }

  console.log(`\nDeepseek Agent SSE E2E passed: ${runtimeKinds.join(', ')} / ${suiteNames.join(', ')}`);
}

function parseArgs(argv) {
  let suite = 'all';
  let runtime = DEFAULT_RUNTIME;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return { suite, runtime, help: true };
    }
    if (arg === '--suite') {
      const value = argv[i + 1];
      if (!value) throw new Error('--suite requires a value: all, startup, or scrolling');
      suite = parseSuite(value);
      i += 1;
      continue;
    }
    if (arg === '--runtime') {
      const value = argv[i + 1];
      if (!value) {
        throw new Error('--runtime requires a value: openai-agents-sdk, pi-agent-core, opencode, or all-deepseek');
      }
      runtime = parseRuntime(value);
      i += 1;
      continue;
    }
    if (!arg.startsWith('-')) {
      suite = parseSuite(arg);
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return { suite, runtime, help: false };
}

function parseSuite(value) {
  if (value === 'all' || value === 'startup' || value === 'scrolling') return value;
  throw new Error(`Invalid suite: ${value}. Expected all, startup, or scrolling.`);
}

function parseRuntime(value) {
  if (
    value === 'all' ||
    value === 'all-deepseek' ||
    value === 'openai' ||
    value === 'openai-agents-sdk' ||
    value === 'pi' ||
    value === 'pi-agent-core' ||
    value === 'opencode'
  ) {
    return value;
  }
  throw new Error(
    `Invalid runtime: ${value}. Expected openai-agents-sdk, pi-agent-core, opencode, or all-deepseek.`,
  );
}

function resolveRuntimeKinds(value) {
  if (value === 'all' || value === 'all-deepseek') return DEEPSEEK_RUNTIME_KINDS;
  if (value === 'openai') return ['openai-agents-sdk'];
  if (value === 'pi') return ['pi-agent-core'];
  return [value];
}

function printUsage() {
  console.log('Usage: node scripts/run-deepseek-agent-e2e.cjs [--suite all|startup|scrolling] [--runtime openai-agents-sdk|pi-agent-core|opencode|all-deepseek]');
  console.log('');
  console.log('Runs SmartPerfetto Agent SSE E2E with Deepseek-backed SmartPerfetto runtimes.');
  console.log('');
  console.log('Credential precedence: DEEPSEEK_API_KEY, then OPENAI_API_KEY.');
  console.log('OpenAI receives OPENAI_* pins; Pi/OpenCode receive generated Deepseek model JSON unless env already overrides it.');
}

function loadBackendEnv() {
  const envPath = path.join(backendRoot, '.env');
  if (!fs.existsSync(envPath)) return;
  // Load local untracked provider credentials before this wrapper validates them.
  require('dotenv').config({ path: envPath, quiet: true });
}

function resolveDeepseekCredential() {
  const source = process.env.DEEPSEEK_API_KEY ? 'DEEPSEEK_API_KEY' : 'OPENAI_API_KEY';
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(
      'DEEPSEEK_API_KEY or OPENAI_API_KEY is required. Use a local untracked env file or GitHub secret DEEPSEEK_API_KEY; do not commit provider keys.',
    );
  }
  return { apiKey, source };
}

function runSuite(suiteName, credential, runtimeKind, runtimeSpecificOutput) {
  const suite = suites[suiteName];
  const args = runtimeSpecificOutput
    ? withRuntimeOutputPath(suite.args, suite.output, runtimeKind)
    : suite.args;
  console.log(`\n[deepseek-e2e] suite=${suiteName} (${suite.label})`);
  console.log(`[deepseek-e2e] runtime=${runtimeKind}`);
  console.log(`[deepseek-e2e] output=${getOutputPathFromArgs(args) || suite.output}`);
  console.log(`[deepseek-e2e] credential=${credential.source}`);

  const result = spawnSync(process.execPath, [tsxCliPath, verifierPath, ...args], {
    cwd: backendRoot,
    env: buildChildEnv(credential.apiKey, runtimeKind),
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function withRuntimeOutputPath(args, outputPath, runtimeKind) {
  const next = [...args];
  const index = next.indexOf('--output');
  const runtimeOutput = outputPath.replace(/-real\.json$/, `-${runtimeKind}-real.json`);
  if (index >= 0 && next[index + 1]) {
    next[index + 1] = runtimeOutput;
  } else {
    next.push('--output', runtimeOutput);
  }
  return next;
}

function getOutputPathFromArgs(args) {
  const index = args.indexOf('--output');
  return index >= 0 ? args[index + 1] : undefined;
}

function buildChildEnv(apiKey, runtimeKind) {
  const deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
  const deepseekModel = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
  const deepseekLightModel = process.env.DEEPSEEK_LIGHT_MODEL || 'deepseek-v4-flash';
  const baseEnv = {
    ...process.env,
    DEEPSEEK_API_KEY: apiKey,
    OPENAI_API_KEY: apiKey,
    OPENAI_BASE_URL: deepseekBaseUrl,
    OPENAI_MODEL: deepseekModel,
    OPENAI_LIGHT_MODEL: deepseekLightModel,
    OPENAI_MAX_OUTPUT_TOKENS: '8192',
    DOTENV_CONFIG_QUIET: 'true',
  };

  if (runtimeKind === 'openai-agents-sdk') {
    return {
      ...baseEnv,
      SMARTPERFETTO_AGENT_RUNTIME: 'openai-agents-sdk',
      OPENAI_AGENTS_PROTOCOL: 'chat_completions',
    };
  }

  if (runtimeKind === 'pi-agent-core') {
    return {
      ...baseEnv,
      SMARTPERFETTO_AGENT_RUNTIME: 'pi-agent-core',
      SMARTPERFETTO_PI_AGENT_CORE_MODEL_JSON:
        process.env.SMARTPERFETTO_PI_AGENT_CORE_MODEL_JSON || createPiAgentCoreDeepseekModelJson({
          model: deepseekModel,
          baseUrl: deepseekBaseUrl,
        }),
    };
  }

  if (runtimeKind === 'opencode') {
    return {
      ...baseEnv,
      SMARTPERFETTO_AGENT_RUNTIME: 'opencode',
      SMARTPERFETTO_OPENCODE_MODEL_JSON:
        process.env.SMARTPERFETTO_OPENCODE_MODEL_JSON || JSON.stringify({
          providerID: 'deepseek',
          modelID: deepseekModel,
          baseURL: deepseekBaseUrl,
          apiKeyEnv: 'DEEPSEEK_API_KEY',
          smallModel: deepseekLightModel,
        }),
    };
  }

  throw new Error(`Unsupported runtime: ${runtimeKind}`);
}

function createPiAgentCoreDeepseekModelJson({ model, baseUrl }) {
  return JSON.stringify({
    id: model,
    name: model,
    api: 'openai-completions',
    provider: 'deepseek',
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    thinkingLevel: 'off',
  });
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}
