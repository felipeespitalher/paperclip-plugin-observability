# Telemetry contract — Observability plugin ↔ Paperclip host

This document defines how `paperclip.observability` integrates with the Paperclip host for **embedded dashboards** (read path) and **telemetry** (write path). It is the acceptance artifact for host↔plugin observability contracts.

## Scope

| Surface | Direction | Capability | Purpose |
|---------|-----------|------------|---------|
| Plugin data handlers | Plugin → UI (via host bridge) | `plugin.state.read` | Company-scoped config + dashboard payloads |
| Plugin actions | UI → Plugin (via host bridge) | `plugin.state.write`, `secrets.read-ref` | Persist config; resolve AWS secret refs |
| Host metrics | Plugin → Host store | `metrics.write` | Numeric counters/gauges for import health |
| Host telemetry | Plugin → Host pipeline | `telemetry.track` *(optional, not declared in v0.3)* | Structured product events |
| Host-native agent telemetry | Host → external ingest | *(host-owned)* | `agent.first_heartbeat`, `agent.task_completed`, etc. |

The Observability UI **does not** call `metrics.write` or `telemetry.track` from the browser. All host writes happen in the **worker** after capability checks.

## Embedded dashboards (read contract)

### Data keys

| Key | Params | Response shape | When used |
|-----|--------|----------------|-----------|
| `overview` | `{ companyId }` | `ObservabilityOverview` | Status cards, Grafana iframe URL, CloudWatch console link, import readiness |
| `cloudwatchMetrics` | `{ companyId }` | `CloudWatchMetricsOverview` | In-app charts (`MetricChart`) for EB / ECS / RDS |

### `ObservabilityOverview`

```ts
{
  provider: "grafana" | "cloudwatch" | "none";
  status: "ok" | "not_configured";
  message: string;
  config: ObservabilityConfig;
  grafanaEmbedUrl: string | null;      // kiosk=tv when provider=grafana
  cloudWatchConsoleUrl: string | null; // regional console deep link
  awsAccessConfigured: boolean;
  metricsImportReady: boolean;         // true when CW API + resource IDs are complete
  checkedAt: string;                   // ISO timestamp
}
```

### `CloudWatchMetricsOverview`

Extends `FetchCloudWatchMetricsResult` with:

```ts
{
  status: "ok" | "not_configured" | "error";
  message: string;
  namespace: string;       // e.g. AWS/ECS
  resourceLabel: string;
  region: string;
  fetchedAt: string;
  series: Array<{
    id: string;
    label: string;
    unit: string;
    points: Array<{ timestamp: string; value: number }>;
  }>;
}
```

### Actions

| Action | Input | Result |
|--------|-------|--------|
| `saveConfig` | `{ companyId, config }` | `{ saved: true, at }` |
| `testAwsAccess` | `{ companyId }` | `{ ok, message }` |

### State

- **Key:** `observability.config` (company scope)
- **Shape:** `ObservabilityConfig` — see `src/types.ts`

### UI routes

| Route | Slot | Behavior |
|-------|------|----------|
| `/:company/observability` | `ObservabilityPage` | Dashboard tab: Grafana iframe or CloudWatch charts |
| `/:company/observability#sources` | same page | Data-source configuration form |
| Instance settings | `ObservabilitySettingsPage` | Same form, instance-admin context |

## Host metrics contract (`metrics.write`)

**Capability:** `metrics.write` (declared in manifest)

**Client:** `ctx.metrics.write(name, value, tags?)` in the worker only.

The host namespaces metric names per plugin. This plugin uses the `observability.*` prefix:

| Metric | Type | Tags | Emitted when |
|--------|------|------|--------------|
| `observability.cloudwatch.series_count` | gauge | `company_id`, `namespace`, `status` | After each `cloudwatchMetrics` data fetch |
| `observability.cloudwatch.datapoints` | gauge | `company_id`, `namespace`, `status` | Same — total points across all series |

**Tag semantics**

- `company_id` — Paperclip company UUID (never include secret values).
- `namespace` — CloudWatch namespace string (e.g. `AWS/ECS`).
- `status` — `ok`, `not_configured`, or `error` from the fetch result.

**Non-goals (v0.3)**

- No high-cardinality tags (issue id, agent id, resource name) — keeps host metric cardinality bounded.
- No PII or credential material in tags or values.

## Host telemetry contract (`telemetry.track`)

**Capability:** `telemetry.track` — **not** requested in v0.3.3 to limit blast radius.

When enabled in a future release, the host prefixes events as `plugin.paperclip.observability.<eventName>` and forwards them to the shared ingest pipeline (`TelemetryEventEnvelope`).

Recommended future events:

| Event slug | Dimensions | Use |
|------------|------------|-----|
| `config_saved` | `provider`, `namespace?` | Audit configuration changes |
| `aws_test` | `ok` | AWS credential validation outcomes |
| `cloudwatch_fetch` | `status`, `series_count` | Product analytics (complements metrics) |

## Host-native agent/run telemetry (read-only for this plugin)

Paperclip emits core product telemetry independently of plugins (`@paperclipai/shared/telemetry`):

- `agent.first_heartbeat`
- `agent.task_completed`
- `install.started` / `install.completed`
- `plugin.<custom>` — reserved pattern for plugin events

The Observability plugin **surfaces external** Grafana/CloudWatch metrics; it does not replace host agent telemetry. Operators should correlate:

1. Host agent events (Paperclip ingest) for workflow health.
2. Plugin `observability.cloudwatch.*` metrics for import reliability.
3. Embedded Grafana/CW charts for infrastructure health.

## Security and tenancy

- Config and fetched metrics are **company-scoped** via `companyId` on every data/action call.
- AWS credentials are **secret references** only; resolution happens in the worker via `ctx.secrets.resolve`.
- CloudWatch calls are outbound from the worker (`http.outbound` not required — AWS SDK uses Node fetch).
- Grafana embeds are iframe URLs supplied by the operator; CSP/frame-ancestors are a host/browser concern.

## Versioning

| Plugin version | Contract revision |
|----------------|-------------------|
| 0.1.x | Sidebar + URL-only Grafana/CW link |
| 0.2.x | Secret refs + AWS test action |
| 0.3.x | Embedded CW charts + `metrics.write` emission + this document |

Breaking changes to data keys or config shape require a manifest major bump and a migration note in the README.

## Verification

```bash
pnpm test    # harness asserts data/actions; extend tests for metrics array
pnpm build   # dist/ required for host install
```

Manual smoke: configure CloudWatch for a test company, open `/:company/observability`, confirm charts render and host metrics receive `observability.cloudwatch.*` writes (host metrics dashboard / logs).
