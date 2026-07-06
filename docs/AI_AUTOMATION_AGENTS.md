# REOS Enterprise v3.0 Sprint 20 — AI Automation Agents

Sprint 20 adds the AI orchestration layer for REOS Enterprise v3.0 production release.

## Added Files

| File | Purpose |
| --- | --- |
| `src/AIAgents.gs` | Agent registry, run engine, recommendation queue, agent tasks, and production release summary. |
| `src/AIAgents.html` | AI Agents command center UI. |

## New Sheets

| Sheet | Purpose |
| --- | --- |
| `AI_AGENTS` | Stores configured cross-module agents. |
| `AI_AGENT_RUNS` | Stores run history and model/recommendation output. |
| `AI_AGENT_TASKS` | Stores agent-created operational tasks. |

## Default Agents

- Lead Qualification Agent
- Follow-up Recovery Agent
- Property Operations Agent
- Vendor Performance Agent
- Release Readiness Agent

## Operating Flow

1. Open `REOS → Open AI Agents`.
2. Click `Seed Agents`.
3. Run one agent or `Run All Active`.
4. Review generated recommendations and agent tasks.
5. Complete or route agent tasks into module workflows.
6. Generate the production release summary.

## Acceptance Criteria

- Agents can be seeded.
- Active agents can be run manually.
- Agent runs are logged.
- Recommendations are converted into agent tasks.
- Release readiness can be summarized from hardening reports.
- The command center exposes KPIs, agents, runs, and tasks.
