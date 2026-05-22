import { useEffect, useState } from "react";
import {
  useHostContext,
  useHostLocation,
  useHostNavigation,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginSettingsPageProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import {
  DEFAULT_NAMESPACE,
  METRIC_CATALOG,
  type CloudWatchNamespace,
} from "../cloudwatch-metrics.js";
import type {
  CloudWatchMetricsOverview,
  ObservabilityConfig,
  ObservabilityOverview,
  ObservabilityProvider,
} from "../types.js";
import { MetricChart } from "./MetricChart.js";

const OBSERVABILITY_ROUTE = "/observability";
const SOURCES_HASH = "#sources";

type ObservabilityTab = "dashboard" | "sources";

function useObservabilityTab(): ObservabilityTab {
  const { hash } = useHostLocation();
  return hash === SOURCES_HASH ? "sources" : "dashboard";
}

const panelStyle = {
  border: "1px solid rgba(128,128,128,0.25)",
  borderRadius: 8,
  padding: "1rem",
  display: "grid" as const,
  gap: "0.75rem",
};

const NAMESPACE_OPTIONS: { value: CloudWatchNamespace; label: string }[] = [
  { value: "AWS/ElasticBeanstalk", label: "Elastic Beanstalk" },
  { value: "AWS/ECS", label: "ECS" },
  { value: "AWS/RDS", label: "RDS" },
];

const sidebarLinkClass =
  "flex w-full items-center gap-2.5 px-3 py-2 text-[13px] font-medium transition-colors no-underline";
const sidebarLinkActiveClass = "bg-accent text-foreground";
const sidebarLinkIdleClass = "text-foreground/80 hover:bg-accent/50 hover:text-foreground";

export function ObservabilitySidebar(_props: PluginSidebarProps) {
  const nav = useHostNavigation();
  const { pathname } = useHostLocation();
  const href = nav.resolveHref(OBSERVABILITY_ROUTE);
  const isActive = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <a
      {...nav.linkProps(OBSERVABILITY_ROUTE)}
      className={`${sidebarLinkClass} ${isActive ? sidebarLinkActiveClass : sidebarLinkIdleClass}`}
    >
      <span className="flex-1 truncate">Observability</span>
    </a>
  );
}

/** Shown when Layout replaces the company sidebar on /:company/observability routes. */
export function ObservabilityRouteSidebar(_props: PluginSidebarProps) {
  const nav = useHostNavigation();
  const { hash } = useHostLocation();
  const onDashboard = hash !== SOURCES_HASH;
  const onSources = hash === SOURCES_HASH;

  return (
    <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem", padding: "0.5rem 0" }}>
      <a
        {...nav.linkProps("/dashboard")}
        className={`${sidebarLinkClass} ${sidebarLinkIdleClass}`}
      >
        <span className="flex-1 truncate">← Company dashboard</span>
      </a>
      <div
        style={{
          padding: "0.75rem 0.75rem 0.25rem",
          fontSize: "0.7rem",
          fontWeight: 600,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          opacity: 0.55,
        }}
      >
        Observability
      </div>
      <a
        {...nav.linkProps(OBSERVABILITY_ROUTE)}
        className={`${sidebarLinkClass} ${onDashboard ? sidebarLinkActiveClass : sidebarLinkIdleClass}`}
      >
        <span className="flex-1 truncate">Metrics dashboard</span>
      </a>
      <a
        {...nav.linkProps(`${OBSERVABILITY_ROUTE}${SOURCES_HASH}`)}
        className={`${sidebarLinkClass} ${onSources ? sidebarLinkActiveClass : sidebarLinkIdleClass}`}
      >
        <span className="flex-1 truncate">Data sources</span>
      </a>
    </nav>
  );
}

function ObservabilityTabBar({ active }: { active: ObservabilityTab }) {
  const nav = useHostNavigation();
  const tabLinkClass =
    "rounded-md px-3 py-1.5 text-sm font-medium no-underline transition-colors";
  const tabActiveClass = "bg-accent text-foreground";
  const tabIdleClass = "text-foreground/70 hover:bg-accent/40 hover:text-foreground";

  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      <a
        {...nav.linkProps(OBSERVABILITY_ROUTE)}
        className={`${tabLinkClass} ${active === "dashboard" ? tabActiveClass : tabIdleClass}`}
      >
        Dashboard
      </a>
      <a
        {...nav.linkProps(`${OBSERVABILITY_ROUTE}${SOURCES_HASH}`)}
        className={`${tabLinkClass} ${active === "sources" ? tabActiveClass : tabIdleClass}`}
      >
        Data sources
      </a>
    </div>
  );
}

function MetricSelector({
  namespace,
  selectedIds,
  onChange,
}: {
  namespace: CloudWatchNamespace;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const catalog = METRIC_CATALOG[namespace];

  function toggle(id: string) {
    const allIds = catalog.map((def) => def.id);
    const effective = selectedIds.length === 0 ? allIds : selectedIds;
    const set = new Set(effective);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const next = [...set];
    onChange(next.length === allIds.length ? [] : next);
  }

  return (
    <fieldset style={{ border: "none", margin: 0, padding: 0, display: "grid", gap: "0.35rem" }}>
      <legend style={{ fontSize: "0.9rem", marginBottom: "0.25rem" }}>Metrics to import</legend>
      {catalog.map((def) => (
        <label key={def.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={selectedIds.length === 0 || selectedIds.includes(def.id)}
            onChange={() => toggle(def.id)}
          />
          <span>{def.label}</span>
        </label>
      ))}
      <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.7 }}>
        Leave all checked to import every metric in this namespace.
      </p>
    </fieldset>
  );
}

function ObservabilityConfigForm({
  companyId,
  initialConfig,
  onSaved,
  compact,
}: {
  companyId: string;
  initialConfig?: ObservabilityConfig;
  onSaved?: () => void;
  compact?: boolean;
}) {
  const saveConfig = usePluginAction("saveConfig");
  const testAwsAccess = usePluginAction("testAwsAccess");
  const [provider, setProvider] = useState<ObservabilityProvider>("none");
  const [grafanaUrl, setGrafanaUrl] = useState("");
  const [cloudwatchRegion, setCloudwatchRegion] = useState("us-east-1");
  const [awsAccessKeySecretRef, setAwsAccessKeySecretRef] = useState("");
  const [awsSecretAccessKeySecretRef, setAwsSecretAccessKeySecretRef] = useState("");
  const [cloudwatchNamespace, setCloudwatchNamespace] =
    useState<CloudWatchNamespace>(DEFAULT_NAMESPACE);
  const [selectedMetricIds, setSelectedMetricIds] = useState<string[]>([]);
  const [elasticBeanstalkEnvironmentName, setElasticBeanstalkEnvironmentName] = useState("");
  const [ecsClusterName, setEcsClusterName] = useState("");
  const [ecsServiceName, setEcsServiceName] = useState("");
  const [rdsDbInstanceIdentifier, setRdsDbInstanceIdentifier] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingAws, setTestingAws] = useState(false);
  const [awsTestMessage, setAwsTestMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!initialConfig) return;
    setProvider(initialConfig.provider ?? "none");
    setGrafanaUrl(initialConfig.grafanaUrl ?? "");
    setCloudwatchRegion(initialConfig.cloudwatchRegion ?? "us-east-1");
    setAwsAccessKeySecretRef(initialConfig.awsAccessKeySecretRef ?? "");
    setAwsSecretAccessKeySecretRef(initialConfig.awsSecretAccessKeySecretRef ?? "");
    setCloudwatchNamespace(initialConfig.cloudwatchNamespace ?? DEFAULT_NAMESPACE);
    setSelectedMetricIds(initialConfig.selectedMetricIds ?? []);
    setElasticBeanstalkEnvironmentName(initialConfig.elasticBeanstalkEnvironmentName ?? "");
    setEcsClusterName(initialConfig.ecsClusterName ?? "");
    setEcsServiceName(initialConfig.ecsServiceName ?? "");
    setRdsDbInstanceIdentifier(initialConfig.rdsDbInstanceIdentifier ?? "");
  }, [initialConfig]);

  useEffect(() => {
    const catalogIds = METRIC_CATALOG[cloudwatchNamespace].map((def) => def.id);
    setSelectedMetricIds((prev) => prev.filter((id) => catalogIds.includes(id)));
  }, [cloudwatchNamespace]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveConfig({
        companyId,
        config: {
          provider,
          grafanaUrl: provider === "grafana" ? grafanaUrl : undefined,
          cloudwatchRegion: provider === "cloudwatch" ? cloudwatchRegion : undefined,
          awsAccessKeySecretRef:
            provider === "cloudwatch" ? awsAccessKeySecretRef || undefined : undefined,
          awsSecretAccessKeySecretRef:
            provider === "cloudwatch" ? awsSecretAccessKeySecretRef || undefined : undefined,
          cloudwatchNamespace: provider === "cloudwatch" ? cloudwatchNamespace : undefined,
          selectedMetricIds:
            provider === "cloudwatch" && selectedMetricIds.length > 0
              ? selectedMetricIds
              : undefined,
          elasticBeanstalkEnvironmentName:
            provider === "cloudwatch" && cloudwatchNamespace === "AWS/ElasticBeanstalk"
              ? elasticBeanstalkEnvironmentName || undefined
              : undefined,
          ecsClusterName:
            provider === "cloudwatch" && cloudwatchNamespace === "AWS/ECS"
              ? ecsClusterName || undefined
              : undefined,
          ecsServiceName:
            provider === "cloudwatch" && cloudwatchNamespace === "AWS/ECS"
              ? ecsServiceName || undefined
              : undefined,
          rdsDbInstanceIdentifier:
            provider === "cloudwatch" && cloudwatchNamespace === "AWS/RDS"
              ? rdsDbInstanceIdentifier || undefined
              : undefined,
        },
      });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleTestAws() {
    setTestingAws(true);
    setAwsTestMessage(null);
    try {
      const result = (await testAwsAccess({ companyId })) as { ok?: boolean; message?: string };
      setAwsTestMessage(result?.message ?? (result?.ok ? "OK" : "Test failed"));
    } catch (error) {
      setAwsTestMessage(error instanceof Error ? error.message : "Test failed");
    } finally {
      setTestingAws(false);
    }
  }

  return (
    <section style={panelStyle}>
      <h2 style={{ margin: 0, fontSize: compact ? "1rem" : "1.1rem" }}>Data sources</h2>
      {!compact ? (
        <p style={{ margin: 0, opacity: 0.8, fontSize: "0.9rem" }}>
          Choose where metrics are collected from (AWS CloudWatch, Grafana; Prometheus planned). For
          CloudWatch API access, create secrets under Company → Secrets first.
        </p>
      ) : null}
      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span>Data source</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
          <option value="none">Not configured</option>
          <option value="grafana">Grafana</option>
          <option value="cloudwatch">AWS CloudWatch</option>
        </select>
      </label>
      <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.65 }}>
        Prometheus support is planned for a future release.
      </p>
      {provider === "none" ? (
        <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.8 }}>
          To configure AWS API access (region, secret references, namespaces), choose{" "}
          <strong>AWS CloudWatch</strong> above. Create credentials first under{" "}
          <strong>Company → Secrets</strong>, then use <strong>Test AWS access</strong> after save.
        </p>
      ) : null}
      {provider === "grafana" && (
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span>Grafana base URL</span>
          <input
            type="url"
            placeholder="https://grafana.example.com"
            value={grafanaUrl}
            onChange={(e) => setGrafanaUrl(e.target.value)}
          />
        </label>
      )}
      {provider === "cloudwatch" && (
        <>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>AWS region</span>
            <input
              type="text"
              placeholder="us-east-1"
              value={cloudwatchRegion}
              onChange={(e) => setCloudwatchRegion(e.target.value)}
            />
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>AWS access key id (secret reference)</span>
            <input
              type="text"
              placeholder="secret name or id from Company → Secrets"
              value={awsAccessKeySecretRef}
              onChange={(e) => setAwsAccessKeySecretRef(e.target.value)}
            />
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>AWS secret access key (secret reference)</span>
            <input
              type="text"
              placeholder="secret name or id from Company → Secrets"
              value={awsSecretAccessKeySecretRef}
              onChange={(e) => setAwsSecretAccessKeySecretRef(e.target.value)}
            />
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>CloudWatch namespace</span>
            <select
              value={cloudwatchNamespace}
              onChange={(e) => setCloudwatchNamespace(e.target.value as CloudWatchNamespace)}
            >
              {NAMESPACE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          {cloudwatchNamespace === "AWS/ElasticBeanstalk" && (
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Elastic Beanstalk environment name</span>
              <input
                type="text"
                placeholder="my-app-prod"
                value={elasticBeanstalkEnvironmentName}
                onChange={(e) => setElasticBeanstalkEnvironmentName(e.target.value)}
              />
            </label>
          )}
          {cloudwatchNamespace === "AWS/ECS" && (
            <>
              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span>ECS cluster name</span>
                <input
                  type="text"
                  placeholder="my-cluster"
                  value={ecsClusterName}
                  onChange={(e) => setEcsClusterName(e.target.value)}
                />
              </label>
              <label style={{ display: "grid", gap: "0.35rem" }}>
                <span>ECS service name (optional)</span>
                <input
                  type="text"
                  placeholder="my-service"
                  value={ecsServiceName}
                  onChange={(e) => setEcsServiceName(e.target.value)}
                />
              </label>
            </>
          )}
          {cloudwatchNamespace === "AWS/RDS" && (
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>RDS DB instance identifier</span>
              <input
                type="text"
                placeholder="my-db-prod"
                value={rdsDbInstanceIdentifier}
                onChange={(e) => setRdsDbInstanceIdentifier(e.target.value)}
              />
            </label>
          )}
          <MetricSelector
            namespace={cloudwatchNamespace}
            selectedIds={selectedMetricIds}
            onChange={setSelectedMetricIds}
          />
          <p style={{ margin: 0, fontSize: "0.85rem", opacity: 0.75 }}>
            Graphs are imported via <code>cloudwatch:GetMetricData</code> for namespace{" "}
            <code>{cloudwatchNamespace}</code>.
          </p>
        </>
      )}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save configuration"}
        </button>
        {provider === "cloudwatch" ? (
          <button type="button" disabled={testingAws || saving} onClick={() => void handleTestAws()}>
            {testingAws ? "Testing…" : "Test AWS access"}
          </button>
        ) : null}
      </div>
      {awsTestMessage ? (
        <p style={{ margin: 0, fontSize: "0.85rem" }}>{awsTestMessage}</p>
      ) : null}
    </section>
  );
}

function useObservabilityOverview(companyId: string | null | undefined) {
  return usePluginData<ObservabilityOverview>("overview", {
    companyId: companyId ?? undefined,
  });
}

function CloudWatchMetricsPanel({ companyId }: { companyId: string }) {
  const { data, loading, error, refresh } = usePluginData<CloudWatchMetricsOverview>(
    "cloudwatchMetrics",
    { companyId },
  );

  if (loading) {
    return <p style={{ margin: 0, opacity: 0.8 }}>Loading CloudWatch metrics…</p>;
  }

  if (error) {
    return <p style={{ margin: 0 }}>Metrics error: {error.message}</p>;
  }

  if (!data || data.status === "not_configured") {
    return (
      <p style={{ margin: 0, opacity: 0.8 }}>
        {data?.message ?? "Configure CloudWatch to import metrics."}
      </p>
    );
  }

  return (
    <section style={panelStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>CloudWatch metrics</h2>
        <button type="button" onClick={() => refresh()}>
          Refresh
        </button>
      </div>
      <p style={{ margin: 0, opacity: 0.8, fontSize: "0.9rem" }}>
        {data.message} — {data.namespace} / {data.resourceLabel} ({data.region}), last{" "}
        {formatFetchedAt(data.fetchedAt)}
      </p>
      {data.status === "error" ? null : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {data.series.map((series) => (
            <MetricChart key={series.id} series={series} />
          ))}
        </div>
      )}
    </section>
  );
}

function formatFetchedAt(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function ObservabilitySettingsPage(_props: PluginSettingsPageProps) {
  const hostContext = useHostContext();
  const companyId = hostContext.companyId;
  const nav = useHostNavigation();
  const { data, loading, error, refresh } = useObservabilityOverview(companyId);

  if (!companyId) {
    return (
      <p style={{ margin: 0, fontSize: "0.9rem" }}>
        Select a company in the header to configure data sources (Grafana / AWS CloudWatch).
      </p>
    );
  }

  if (loading) {
    return <p style={{ margin: 0, fontSize: "0.9rem" }}>Loading data source settings…</p>;
  }

  if (error) {
    return <p style={{ margin: 0, fontSize: "0.9rem" }}>Plugin error: {error.message}</p>;
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <p style={{ margin: 0, fontSize: "0.9rem", opacity: 0.85 }}>
        Instance plugin settings mirror the company{" "}
        <a {...nav.linkProps(`${OBSERVABILITY_ROUTE}${SOURCES_HASH}`)}>Data sources</a> tab on the
        Observability page.
      </p>
      <ObservabilityConfigForm
        companyId={companyId}
        initialConfig={data?.config}
        onSaved={refresh}
        compact
      />
    </div>
  );
}

function ObservabilityDashboardView({
  companyId,
  data,
}: {
  companyId: string;
  data: ObservabilityOverview;
}) {
  const nav = useHostNavigation();
  const statusLabel =
    data.status === "ok"
      ? "OK"
      : data.status === "not_configured"
        ? "Not configured"
        : data.status;

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      {data.status === "not_configured" ? (
        <section style={panelStyle}>
          <p style={{ margin: 0 }}>
            No data source configured yet. Open{" "}
            <a {...nav.linkProps(`${OBSERVABILITY_ROUTE}${SOURCES_HASH}`)}>Data sources</a> to connect
            Grafana or AWS CloudWatch.
          </p>
        </section>
      ) : null}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            padding: "0.15rem 0.5rem",
            borderRadius: 4,
            border: "1px solid rgba(128,128,128,0.35)",
          }}
        >
          {statusLabel}
        </span>
        <span>{data.message}</span>
        <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>Updated {data.checkedAt}</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "0.75rem",
        }}
      >
        <div style={{ ...panelStyle, padding: "0.75rem" }}>
          <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>Data source</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>{data.provider}</div>
        </div>
        {data.provider === "cloudwatch" ? (
          <div style={{ ...panelStyle, padding: "0.75rem" }}>
            <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>AWS namespace</div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>
              {data.config.cloudwatchNamespace ?? "—"}
            </div>
          </div>
        ) : null}
      </div>

      {data.provider === "cloudwatch" && data.metricsImportReady ? (
        <CloudWatchMetricsPanel companyId={companyId} />
      ) : null}

      {data.grafanaEmbedUrl ? (
        <section style={{ ...panelStyle, padding: "0.5rem", minHeight: 420 }}>
          <h2 style={{ margin: 0, fontSize: "1.1rem", padding: "0.5rem" }}>Grafana dashboard</h2>
          <iframe
            title="Grafana dashboard"
            src={data.grafanaEmbedUrl}
            style={{
              flex: 1,
              width: "100%",
              minHeight: 360,
              border: "1px solid rgba(128,128,128,0.2)",
            }}
          />
        </section>
      ) : null}

      {data.cloudWatchConsoleUrl ? (
        <section style={panelStyle}>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>CloudWatch console</h2>
          <p style={{ margin: "0.5rem 0", opacity: 0.8 }}>
            Imported charts above use the API; open the console for drill-down.
          </p>
          <a href={data.cloudWatchConsoleUrl} target="_blank" rel="noreferrer">
            Open CloudWatch console
          </a>
        </section>
      ) : null}
    </div>
  );
}

export function ObservabilityPage(_props: PluginPageProps) {
  const hostContext = useHostContext();
  const companyId = hostContext.companyId;
  const tab = useObservabilityTab();
  const { data, loading, error, refresh } = useObservabilityOverview(companyId);

  if (!companyId) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Observability</h1>
        <p>Select a company to view metrics dashboards and configure data sources.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Observability</h1>
        <p>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Observability</h1>
        <p>Plugin error: {error.message}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div style={{ padding: "1.5rem", display: "grid", gap: "1.25rem", maxWidth: 1100 }}>
      <header style={{ display: "grid", gap: "0.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Observability</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Dashboard for imported metrics and Grafana embeds. Configure origins under Data sources.
        </p>
        <ObservabilityTabBar active={tab} />
      </header>

      {tab === "sources" ? (
        <ObservabilityConfigForm
          companyId={companyId}
          initialConfig={data.config}
          onSaved={refresh}
        />
      ) : (
        <ObservabilityDashboardView companyId={companyId} data={data} />
      )}
    </div>
  );
}
