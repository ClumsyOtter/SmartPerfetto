<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Copyright (C) 2024-2026 Gracker (Chris) | SmartPerfetto -->

---
scene: power
priority: 4
effort: medium
required_capabilities:
  - cpu_scheduling
optional_capabilities:
  - power_rails
  - battery_counters
  - cpu_freq_idle
  - gpu_work_period
  - thermal_throttling
  - device_state
keywords:
  - 功耗
  - 耗电
  - 电池
  - 掉电
  - 发热
  - wattson
  - power
  - battery
  - drain
  - energy
  - thermal
compound_patterns:
  - "电池.*掉"
  - "耗电.*原因"
  - "功耗.*分析"
  - "battery.*drain"
  - "power.*analysis"

phase_hints:
  - id: power_data_gate
    keywords: ['power', 'battery', 'wattson', '功耗', '耗电', '电池', '数据', '采集']
    constraints: '先检查 Trace 数据完整度中的 power_rails、battery_counters、cpu_freq_idle、gpu_work_period。缺失时必须输出数据采集建议，禁止把空表解释为“没有功耗问题”。需要总览时优先调用 power_consumption_overview；拆开看时先调用 power_rails_energy_breakdown 和 battery_drain_rate_summary。'
    critical_tools: ['power_consumption_overview', 'power_rails_energy_breakdown', 'battery_drain_rate_summary', 'lookup_knowledge']
    critical: true
  - id: wattson_attribution
    keywords: ['wattson', 'rail', 'thread', '归因', '能耗', 'energy', 'power_rails']
    constraints: 'Wattson 是估算，不是 ODPM 实测。只有 power_rails/cpu_freq_idle 数据可用时才用 Wattson 归因。先用 power_rails_energy_breakdown 看硬件 rail，再用 wattson_rails_power_breakdown / wattson_thread_power_attribution 做 CPU/线程估算；启动窗口问题再加 wattson_app_startup_power。'
    critical_tools: ['wattson_rails_power_breakdown', 'wattson_thread_power_attribution', 'wattson_app_startup_power']
    critical: false
  - id: battery_drain_chain
    keywords: ['battery drain', 'standby drain', '掉电', '待机耗电', '后台耗电', 'wakelock', 'doze', 'job', 'network']
    constraints: '用户问掉电/待机耗电时优先调用 battery_drain_attribution，把 battery drain rate、Doze、suspend/wakeup、wakelock、screen-off CPU、job、network 串起来；缺 rail 数据时只能给事件链归因。'
    critical_tools: ['battery_drain_attribution', 'wakeup_frequency_summary', 'screen_off_background_cpu_attribution', 'modem_network_correlation_summary']
    critical: false
  - id: thermal_chain
    keywords: ['thermal', 'throttling', '发热', '温控', '降频', '热节流', 'gpu work period', 'mali']
    constraints: '用户问发热、降频、热导致卡顿时优先调用 thermal_throttling_chain；同时说明温度传感器/DVFS/GPU work period 哪些数据存在，哪些缺失。'
    critical_tools: ['thermal_throttling_chain']
    critical: false
  - id: fallback_state_power
    keywords: ['wakelock', 'doze', 'battery', 'dvfs', 'thermal', '唤醒', '待机', '降频']
    constraints: '如果 Wattson 前置数据缺失，退化为状态/事件链分析：battery_drain_rate_summary、battery_charge_timeline、battery_doze_state_timeline、wakeup_frequency_summary、android_kernel_wakelock_summary、screen_off_background_cpu_attribution、android_dvfs_counter_stats、suspend_wakeup_analysis。结论必须标注这是定性分析，不是 rail 级能耗归因。'
    critical_tools: ['battery_drain_rate_summary', 'battery_charge_timeline', 'battery_doze_state_timeline', 'wakeup_frequency_summary', 'android_kernel_wakelock_summary', 'screen_off_background_cpu_attribution', 'android_dvfs_counter_stats', 'suspend_wakeup_analysis']
    critical: false

plan_template:
  mandatory_aspects:
    - id: power_data_availability
      match_keywords: ['power', 'battery', 'wattson', '功耗', '耗电', '电池', '数据完整度', '采集']
      suggestion: '功耗场景必须先确认 power_rails/battery_counters/cpu_freq_idle/gpu_work_period 是否可用'
    - id: power_attribution_or_fallback
      match_keywords: ['wattson', 'rail', 'thread', 'wakelock', 'doze', '归因', '唤醒', '降频']
      suggestion: '功耗场景需要包含 Wattson 归因或状态事件 fallback 分析阶段'
    - id: power_composite_entrypoint
      match_keywords: ['power_consumption_overview', 'battery_drain_attribution', 'thermal_throttling_chain', '总览', '掉电', '温控链路']
      suggestion: '复杂功耗问题建议先用 power_consumption_overview / battery_drain_attribution / thermal_throttling_chain 建立统一证据链'
    - id: power_vitals_threshold_context
      match_keywords: ['wakelock', 'vitals', 'excessive', 'stuck', 'P90', 'P99', '后台']
      suggestion: 'Wakelock 阈值必须说明时间基准：24h 累计 >=2h excessive，单后台 wakelock >=1h stuck，P90/P99 >60min 重点排查；短 trace 只能作为局部证据或换算参考'
---

#### 功耗 / 电池 / Wattson 分析（用户提到 功耗、耗电、电池、掉电、wattson）

功耗分析的第一原则：**先判数据能不能支撑结论**。Wattson/rail 级归因依赖 `android.power`、power rails、CPU freq/idle、GPU work period 等采集源。缺失这些数据时，不能把空结果解释为“没有耗电”；只能输出采集建议，或退化为状态/事件链分析。

#### 功耗场景关键 Stdlib 表

写 execute_sql 时优先使用（完整列表见方法论模板）：`android_power_rails_counters`、`android_power_rails_metadata`、`wattson_rails_aggregation!(window)`、`wattson_threads_aggregation!(window)`、`wattson_window_app_startup`、`android_battery_charge`、`android_screen_state`、`android_deep_idle_state`、`android_wakeups`、`android_kernel_wakelocks`、`android_network_packets`、`android_network_uptime_spans!`、`android_dvfs_counter_stats`、`android_gpu_work_period_track`、`cpu_idle_counters`、`cpu_frequency_counters`

#### 固定执行顺序

1. **数据完整度**：先判断 `power_rails` / `battery_counters` / `cpu_freq_idle` / `gpu_work_period` 是否可用。
2. **全局量纲**：优先用 `power_rails_energy_breakdown` 看硬件 rail 实测 mWh，再用 `battery_drain_rate_summary` 看 trace 窗口掉电趋势。
3. **待机健康度**：screen-off / standby 问题必须看 `suspend_wakeup_analysis` 和 `wakeup_frequency_summary`，再看 `android_kernel_wakelock_summary`。
4. **归因链路**：CPU 用 `screen_off_background_cpu_attribution` / `wattson_thread_power_attribution` / `cpu_freq_residency_summary`；网络只用 `modem_network_correlation_summary` 做 correlation；GPU/温控再走 GPU/thermal 链。
5. **可信度分层**：结论必须标注 `hardware_power_rails` / `wattson_estimate` / `battery_counter_trend` / `event_chain_fallback` / `insufficient_data`。

#### Wakelock / Vitals 阈值语义

- partial wakelock 24h 累计 >= 2h：Android vitals excessive 参考阈值。
- 单个后台 partial wakelock >= 1h：stuck wakelock 参考阈值。
- P90/P99 > 60min：重点排查。
- SmartPerfetto 的单条 trace 通常不是 24h 数据；除非 trace 覆盖完整统计周期，否则只能输出“局部证据 / 换算参考 / 需长期采样确认”，不能直接判定 Play vitals 违规。

**Phase 0 — 数据完整度门禁：**

先读取系统提示中的 Trace 数据完整度结果：

| capability | 缺失时含义 | 处理 |
|---|---|---|
| `power_rails` | 无 rail 级能耗估算 | 不调用 Wattson rail/thread 能耗结论；输出 `collect_power_rails` 采集建议 |
| `battery_counters` | 无电量/电流采样 | 不计算掉电速率；输出 `battery_poll_ms` 采集建议 |
| `cpu_freq_idle` | 无 CPU idle/freq 完整状态 | 不做 Wattson CPU 能耗归因；可退化为 CPU 频率/DVFS 定性分析 |
| `gpu_work_period` | 无 GPU active region | 不做 GPU work period/能耗归因；可退化为 GPU 频率或 Mali power state 分析 |

如果用户明确问“怎么采集”，优先调用：
```
lookup_knowledge("data-sources")
```

**Phase 1 — Wattson rail/thread 归因（数据可用时）：**

复杂功耗问题优先使用总览入口：
```
invoke_skill("power_consumption_overview", { package: "<包名>" })
```

需要拆开看时再调用：
```
invoke_skill("power_rails_energy_breakdown")
invoke_skill("wattson_rails_power_breakdown")
invoke_skill("wattson_thread_power_attribution", { process_name: "<包名>" })
```

分析顺序：
1. 看 rail 总能耗排序：CPU/GPU/DDR/Modem 哪个是主耗能源
2. 看线程级归因：是否是目标 App 线程、system_server、RenderThread、Binder 线程池或后台进程消耗
3. 如果能耗集中在某一时间窗口，结合 `cpu_thread_utilization_period` / `cpu_process_utilization_period` 做 CPU 利用率交叉验证

**Phase 2 — 启动期功耗（用户提到启动耗电时）：**

```
invoke_skill("wattson_app_startup_power", { package: "<包名>" })
invoke_skill("app_process_starts_summary")
```

把启动窗口能耗与启动类型、进程创建、CPU/DVFS 状态关联。不能只给总能耗，必须说明能耗集中在哪个阶段或线程。

**Phase 3 — 电池/Doze/Wakelock fallback（Wattson 数据缺失或用户问待机耗电时）：**

掉电/待机耗电优先使用组合入口：
```
invoke_skill("battery_drain_attribution", { package: "<包名>" })
```

需要拆开看时再调用：
```
invoke_skill("battery_drain_rate_summary")
invoke_skill("battery_charge_timeline")
invoke_skill("battery_doze_state_timeline")
invoke_skill("wakeup_frequency_summary")
invoke_skill("android_kernel_wakelock_summary")
invoke_skill("suspend_wakeup_analysis")
invoke_skill("screen_off_background_cpu_attribution", { package: "<包名>" })
invoke_skill("modem_network_correlation_summary")
```

输出要明确标注：这是状态/事件链证据，能说明“是否频繁唤醒、是否无法进入 Doze、是否有 wakelock”，但不是 rail 级功耗量化。

**Phase 4 — GPU/温控/频率交叉验证（按需）：**

温控/降频/发热导致性能问题时优先：
```
invoke_skill("thermal_throttling_chain", { package: "<包名>" })
```

| 信号 | 调用 |
|---|---|
| GPU work period 可用 | `invoke_skill("android_gpu_work_period_track")` |
| Mali power state 可用 | `invoke_skill("mali_gpu_power_state")` |
| DVFS 频率异常 | `invoke_skill("android_dvfs_counter_stats")` |
| CPU 高频驻留 | `invoke_skill("cpu_freq_residency_summary")` |
| 热降频/发热 | `invoke_skill("thermal_throttling")` |
| CPU idle residency | `invoke_skill("cpu_idle_state_residency")` |

**输出结构：**

1. **数据完整度判定**：power_rails / battery_counters / cpu_freq_idle / gpu_work_period 哪些可用，哪些缺失
2. **全局能量/掉电趋势**：硬件 rail mWh、Wattson 估算 mWh、battery drain rate 分开列
3. **待机健康度**：suspend 占比、wakeup/min、wakelock Top、screen-off CPU 是否异常
4. **时间窗口关联**：耗电/唤醒/降频发生在什么阶段，是否与启动、滑动、后台任务、网络活动重叠
5. **结论可信度**：hardware_power_rails / wattson_estimate / battery_counter_trend / event_chain_fallback / insufficient_data
6. **采集建议**：缺哪些数据就给具体 Perfetto 配置方向，不泛泛而谈；CLI 可建议 `smp capture android --preset power --app <pkg> --duration <sec>`
