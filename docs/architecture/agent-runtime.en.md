# Agent Runtime Architecture

[English](agent-runtime.en.md) | [中文](agent-runtime.md)

SmartPerfetto separates model SDK mechanics from Perfetto analysis capability.
The HTTP and CLI session layers depend on the shared `IOrchestrator` contract;
the concrete runtime is selected from the request provider, Provider Manager,
or environment.

| Runtime | SDK | Provider family | Notes |
|---|---|---|---|
| `claude-agent-sdk` | Claude Agent SDK | Anthropic, Bedrock, Vertex, DeepSeek, Anthropic-compatible gateways | Default runtime; supports local Claude Code auth fallback for source runs, MCP server, verifier, and sub-agent behavior |
| `openai-agents-sdk` | OpenAI Agents SDK | OpenAI, Ollama, OpenAI-compatible gateways | Native OpenAI runtime; adapts the same SmartPerfetto tools as function tools |

## Entry Points

HTTP analysis:

```text
POST /api/agent/v1/analyze
  -> AgentAnalyzeSessionService.prepareSession()
  -> createAgentOrchestrator()
  -> ClaudeRuntime.analyze() | OpenAIRuntime.analyze()
```

Resume and scene reconstruction use the same runtime factory:

```text
POST /api/agent/v1/resume
POST /api/agent/v1/scene-reconstruct
  -> createAgentOrchestrator()
```

The npm CLI is a standalone terminal product exposed as `smp` /
`smartperfetto`. It does not start the Web UI, but it reuses the same runtime,
MCP tools, Skills, reports, and session snapshots.

## Runtime Selection

Priority, highest first:

1. `providerId` from the request or session.
2. The Provider Manager active provider.
3. `SMARTPERFETTO_AGENT_RUNTIME`.
4. Default `claude-agent-sdk`.

`SMARTPERFETTO_AGENT_RUNTIME` only accepts `claude-agent-sdk` or
`openai-agents-sdk`. Provider names such as `deepseek` or `openai` are not valid
runtime values. Provider Manager active profiles override env fallback, and a
resumed session keeps the provider/runtime it was created with.

Provider mapping:

| Provider type | Runtime | Protocol |
|---|---|---|
| `anthropic` / `bedrock` / `vertex` / `deepseek` | `claude-agent-sdk` | Claude/Anthropic |
| `openai` | `openai-agents-sdk` | OpenAI Responses |
| `ollama` | `openai-agents-sdk` | OpenAI-compatible Chat Completions |
| `custom` | selected by `connection.agentRuntime` or `connection.openaiProtocol` | explicit configuration |

## Tool Layer

SmartPerfetto analysis capability is registered through
`createClaudeMcpServer()` and described through `McpToolRegistry`: SQL
execution, Skill invocation, SQL schema lookup, planning/hypothesis tools,
artifacts, memory, code-aware lookup, baselines, and comparison tools.

Claude runtime exposes these tools as an in-process MCP server. OpenAI runtime
does not duplicate tool logic; it reads the same `McpToolRegistry` and adapts
tool descriptors into OpenAI Agents SDK function tools. Both runtimes normalize
their output into the same SSE events, `AnalysisResult`, and HTML report
contract, although their SDK resume and streaming mechanics differ.

The tool surface is not a fixed-size list. Quick/full mode, artifact store
availability, codebase permission, `referenceTraceId`, comparison context, and
runtime allowlists shape the request-visible set.

## Final Result And Quality Artifacts

Both runtimes normalize their raw output into a shared `AnalysisResult`, then
run through the same quality and persistence chain:

```text
runtime result
  -> agentResultNormalizer
  -> finalReportContractGate
  -> evidence contract / claim verification / identity resolutions
  -> HTML report / CLI turn files / analysis-result snapshot
  -> frontend visible projection
```

`final_report_contract` comes from strategy frontmatter. Claim verification and
identity resolution depend on structured Skill/DataEnvelope evidence. The
frontend may filter noise from the visible chat conclusion, but it must not
remove provenance needed by reports, CLI artifacts, or snapshots.

## Sessions And Resume

The route layer calls `orchestrator.takeSnapshot()` and restores with
`restoreFromSnapshot()`.

Claude runtime persists the Claude SDK session id. OpenAI runtime persists
OpenAI history, the last response id, and reserved run state. Responses API can
resume with `previousResponseId`; Chat Completions-compatible providers resume
from full history.

Snapshots also carry final-result quality fields such as conclusion contracts,
claim verification results, and identity resolutions so resume, report export,
and analysis-result comparison can reuse them.

Raw trace comparison sessions must also persist `referenceTraceId`,
`comparisonSource`, and `comparisonReportSection`. A comparison session cannot
silently downgrade to single-trace mode or switch to a different reference
trace. Claude/OpenAI SDK session keys must be read and written with the
comparison identity.

## Platform Boundaries

- Source runs and the npm CLI require Node.js `>=24 <25`.
- Portable packages bundle Node.js 24, backend runtime files, committed
  `frontend/`, and the pinned trace processor.
- Docker does not read host Claude Code local auth; use Provider Manager or env
  provider configuration.
- Runtime/provider/session changes must be checked against Web UI, CLI, API,
  reports, Docker, and portable packages. See
  [`../../.claude/rules/product-surface.md`](../../.claude/rules/product-surface.md).

## Health Check

`GET /health` exposes the selected runtime:

```json
{
  "aiEngine": {
    "runtime": "openai-agents-sdk",
    "providerMode": "openai_responses",
    "diagnostics": {
      "protocol": "responses",
      "model": "gpt-5.5"
    }
  }
}
```

This distinguishes provider connectivity from the runtime that will actually
execute analysis.
