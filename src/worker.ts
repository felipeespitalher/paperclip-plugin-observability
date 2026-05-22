import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import type { PluginSecretsClient } from "@paperclipai/plugin-sdk";
import {
  DEFAULT_NAMESPACE,
  fetchCloudWatchMetrics,
  type CloudWatchNamespace,
  type CloudWatchResource,
} from "./cloudwatch-metrics.js";
import type {
  CloudWatchMetricsOverview,
  ObservabilityConfig,
  ObservabilityOverview,
  ObservabilityProvider,
} from "./types.js";

export type {
  CloudWatchMetricsOverview,
  ObservabilityConfig,
  ObservabilityOverview,
  ObservabilityProvider,
} from "./types.js";

/** Only HTTPS origins without embedded credentials; kiosk mode for chromeless embed. */
export function buildGrafanaEmbedUrl(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    const embed = new URL(parsed.origin);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (path && path !== "/") embed.pathname = path;
    embed.search = parsed.search;
    embed.searchParams.set("kiosk", "tv");
    return embed.toString();
  } catch {
    return null;
  }
}

function buildCloudWatchUrl(region: string | undefined): string | null {
  const r = region?.trim();
  if (!r || !/^[a-z]{2}-[a-z]+-\d$/.test(r)) return null;
  return `https://${r}.console.aws.amazon.com/cloudwatch/home?region=${encodeURIComponent(r)}`;
}

function normalizeConfig(raw: unknown): ObservabilityConfig {
  const config = (raw ?? { provider: "none" }) as ObservabilityConfig;
  const namespace = config.cloudwatchNamespace ?? DEFAULT_NAMESPACE;
  const selectedMetricIds = Array.isArray(config.selectedMetricIds)
    ? config.selectedMetricIds.filter((id) => typeof id === "string" && id.trim())
    : undefined;

  return {
    provider: config.provider ?? "none",
    grafanaUrl: config.grafanaUrl,
    cloudwatchRegion: config.cloudwatchRegion,
    awsAccessKeySecretRef: config.awsAccessKeySecretRef?.trim() || undefined,
    awsSecretAccessKeySecretRef: config.awsSecretAccessKeySecretRef?.trim() || undefined,
    cloudwatchNamespace: namespace,
    selectedMetricIds: selectedMetricIds?.length ? selectedMetricIds : undefined,
    elasticBeanstalkEnvironmentName: config.elasticBeanstalkEnvironmentName?.trim() || undefined,
    ecsClusterName: config.ecsClusterName?.trim() || undefined,
    ecsServiceName: config.ecsServiceName?.trim() || undefined,
    rdsDbInstanceIdentifier: config.rdsDbInstanceIdentifier?.trim() || undefined,
  };
}

function awsAccessConfigured(config: ObservabilityConfig): boolean {
  return Boolean(config.awsAccessKeySecretRef && config.awsSecretAccessKeySecretRef);
}

function buildCloudWatchResource(config: ObservabilityConfig): CloudWatchResource | null {
  const namespace = config.cloudwatchNamespace ?? DEFAULT_NAMESPACE;
  switch (namespace) {
    case "AWS/ElasticBeanstalk":
      if (!config.elasticBeanstalkEnvironmentName) return null;
      return {
        namespace,
        target: { environmentName: config.elasticBeanstalkEnvironmentName },
      };
    case "AWS/ECS":
      if (!config.ecsClusterName) return null;
      return {
        namespace,
        target: {
          clusterName: config.ecsClusterName,
          serviceName: config.ecsServiceName,
        },
      };
    case "AWS/RDS":
      if (!config.rdsDbInstanceIdentifier) return null;
      return {
        namespace,
        target: { dbInstanceIdentifier: config.rdsDbInstanceIdentifier },
      };
    default:
      return null;
  }
}

function metricsImportReady(config: ObservabilityConfig): boolean {
  return (
    config.provider === "cloudwatch" &&
    awsAccessConfigured(config) &&
    Boolean(config.cloudwatchRegion?.trim()) &&
    buildCloudWatchResource(config) !== null
  );
}

async function resolveAwsCredentials(
  secrets: PluginSecretsClient,
  config: ObservabilityConfig,
): Promise<{ accessKeyId: string; secretAccessKey: string }> {
  const accessKeyId = await secrets.resolve(config.awsAccessKeySecretRef!);
  const secretAccessKey = await secrets.resolve(config.awsSecretAccessKeySecretRef!);
  return { accessKeyId, secretAccessKey };
}

async function loadCompanyConfig(
  ctx: { state: { get: (key: { scopeKind: "company"; scopeId: string; stateKey: string }) => Promise<unknown> } },
  companyId: string,
): Promise<ObservabilityConfig> {
  const raw = await ctx.state.get({
    scopeKind: "company",
    scopeId: companyId,
    stateKey: "observability.config",
  });
  return normalizeConfig(raw);
}

function emptyMetricsOverview(
  config: ObservabilityConfig,
  status: "not_configured" | "error",
  message: string,
): CloudWatchMetricsOverview {
  const namespace = config.cloudwatchNamespace ?? DEFAULT_NAMESPACE;
  return {
    status,
    message,
    namespace,
    resourceLabel: "",
    region: config.cloudwatchRegion ?? "",
    fetchedAt: new Date().toISOString(),
    series: [],
  };
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("overview", async ({ companyId }) => {
      const config = await loadCompanyConfig(ctx, String(companyId));
      const provider = config.provider ?? "none";
      const configured = provider !== "none";
      const needsAws =
        provider === "cloudwatch" &&
        Boolean(config.awsAccessKeySecretRef || config.awsSecretAccessKeySecretRef);
      const awsReady = !needsAws || awsAccessConfigured(config);
      const importReady = metricsImportReady(config);
      const namespace = config.cloudwatchNamespace ?? DEFAULT_NAMESPACE;

      const grafanaEmbedUrl =
        provider === "grafana" ? buildGrafanaEmbedUrl(config.grafanaUrl) : null;
      const grafanaUrlInvalid =
        provider === "grafana" && Boolean(config.grafanaUrl?.trim()) && !grafanaEmbedUrl;

      return {
        provider,
        status: configured && awsReady && !grafanaUrlInvalid ? "ok" : "not_configured",
        message: !configured
          ? "Configure Grafana or CloudWatch to embed dashboards"
          : grafanaUrlInvalid
            ? "Grafana URL must be a valid HTTPS origin (no credentials in URL)"
            : provider === "cloudwatch" && needsAws && !awsReady
              ? "Set both AWS access key and secret secret references in plugin settings"
              : provider === "cloudwatch" && awsReady && !importReady
                ? `Add resource identifiers for ${namespace} to import CloudWatch graphs`
                : provider === "cloudwatch" && importReady
                  ? `CloudWatch metrics import ready (${namespace})`
                  : `Connected to ${provider}`,
        config,
        grafanaEmbedUrl,
        cloudWatchConsoleUrl:
          provider === "cloudwatch" ? buildCloudWatchUrl(config.cloudwatchRegion) : null,
        awsAccessConfigured: awsAccessConfigured(config),
        metricsImportReady: importReady,
        checkedAt: new Date().toISOString(),
      } satisfies ObservabilityOverview;
    });

    ctx.data.register("cloudwatchMetrics", async ({ companyId }) => {
      const companyKey = String(companyId);
      const config = await loadCompanyConfig(ctx, companyKey);
      if (config.provider !== "cloudwatch") {
        const overview = emptyMetricsOverview(
          config,
          "not_configured",
          "Set provider to CloudWatch to import metrics",
        );
        await recordCloudWatchFetchMetrics(ctx.metrics, companyKey, overview);
        return overview;
      }
      const resource = buildCloudWatchResource(config);
      if (!metricsImportReady(config) || !resource) {
        const overview = emptyMetricsOverview(
          config,
          "not_configured",
          "Configure AWS region, secret references, namespace resource, and save",
        );
        await recordCloudWatchFetchMetrics(ctx.metrics, companyKey, overview);
        return overview;
      }

      try {
        const credentials = await resolveAwsCredentials(ctx.secrets, config);
        const metrics = await fetchCloudWatchMetrics({
          region: config.cloudwatchRegion!,
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
          resource,
          selectedMetricIds: config.selectedMetricIds,
        });
        const hasPoints = metrics.series.some((series) => series.points.length > 0);
        const overview = {
          ...metrics,
          status: "ok" as const,
          message: hasPoints
            ? `Imported ${metrics.series.length} metric series from ${metrics.namespace}`
            : `CloudWatch returned no datapoints for ${metrics.resourceLabel} (check name/region/IAM)`,
        } satisfies CloudWatchMetricsOverview;
        await recordCloudWatchFetchMetrics(ctx.metrics, companyKey, overview);
        return overview;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch CloudWatch metrics";
        const overview = {
          ...emptyMetricsOverview(config, "error", message),
          resourceLabel: resource ? buildResourceLabel(resource) : "",
        } satisfies CloudWatchMetricsOverview;
        await recordCloudWatchFetchMetrics(ctx.metrics, companyKey, overview);
        return overview;
      }
    });

    ctx.actions.register("saveConfig", async (input) => {
      const companyId = (input as { companyId?: string })?.companyId;
      if (!companyId) {
        throw new Error("companyId is required");
      }
      const config = normalizeConfig((input as { config?: ObservabilityConfig })?.config);
      if (!config || typeof config !== "object") {
        throw new Error("config is required");
      }
      await ctx.state.set(
        {
          scopeKind: "company",
          scopeId: companyId,
          stateKey: "observability.config",
        },
        config,
      );
      return { saved: true, at: new Date().toISOString() };
    });

    ctx.actions.register("testAwsAccess", async (input) => {
      const companyId = (input as { companyId?: string })?.companyId;
      if (!companyId) {
        throw new Error("companyId is required");
      }
      const config = await loadCompanyConfig(ctx, companyId);
      if (!awsAccessConfigured(config)) {
        return { ok: false, message: "Configure AWS access key and secret secret references first." };
      }
      try {
        const credentials = await resolveAwsCredentials(ctx.secrets, config);
        const resource = buildCloudWatchResource(config);
        if (resource && config.cloudwatchRegion?.trim()) {
          const metrics = await fetchCloudWatchMetrics({
            region: config.cloudwatchRegion,
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            resource,
            selectedMetricIds: config.selectedMetricIds,
            lookbackHours: 1,
          });
          const points = metrics.series.reduce((sum, series) => sum + series.points.length, 0);
          return {
            ok: true,
            message:
              points > 0
                ? `AWS credentials OK — fetched ${points} datapoints for ${metrics.resourceLabel} (${metrics.namespace})`
                : `AWS credentials OK — no datapoints yet for ${metrics.resourceLabel} (verify resource identifiers)`,
          };
        }
        return { ok: true, message: "AWS secret references resolve for this company." };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to reach CloudWatch";
        return { ok: false, message };
      }
    });
  },

  async onHealth() {
    return { status: "ok", message: "Observability plugin worker is running" };
  },
});

function buildResourceLabel(resource: CloudWatchResource): string {
  switch (resource.namespace) {
    case "AWS/ElasticBeanstalk":
      return resource.target.environmentName;
    case "AWS/ECS":
      return resource.target.serviceName
        ? `${resource.target.clusterName}/${resource.target.serviceName}`
        : resource.target.clusterName;
    case "AWS/RDS":
      return resource.target.dbInstanceIdentifier;
  }
}

async function recordCloudWatchFetchMetrics(
  metrics: { write: (name: string, value: number, tags?: Record<string, string>) => Promise<void> },
  companyId: string,
  overview: CloudWatchMetricsOverview,
): Promise<void> {
  const tags = {
    company_id: companyId,
    namespace: overview.namespace,
    status: overview.status,
  };
  const datapoints = overview.series.reduce((sum, series) => sum + series.points.length, 0);
  await metrics.write("observability.cloudwatch.series_count", overview.series.length, tags);
  await metrics.write("observability.cloudwatch.datapoints", datapoints, tags);
}

export default plugin;
runWorker(plugin, import.meta.url);
