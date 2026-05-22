import type { CloudWatchNamespace, FetchCloudWatchMetricsResult } from "./cloudwatch-metrics.js";

export type ObservabilityProvider = "grafana" | "cloudwatch" | "none";

export type ObservabilityConfig = {
  provider: ObservabilityProvider;
  grafanaUrl?: string;
  cloudwatchRegion?: string;
  awsAccessKeySecretRef?: string;
  awsSecretAccessKeySecretRef?: string;
  cloudwatchNamespace?: CloudWatchNamespace;
  selectedMetricIds?: string[];
  elasticBeanstalkEnvironmentName?: string;
  ecsClusterName?: string;
  ecsServiceName?: string;
  rdsDbInstanceIdentifier?: string;
};

export type ObservabilityOverview = {
  provider: ObservabilityProvider;
  status: "ok" | "not_configured";
  message: string;
  config: ObservabilityConfig;
  grafanaEmbedUrl: string | null;
  cloudWatchConsoleUrl: string | null;
  awsAccessConfigured: boolean;
  metricsImportReady: boolean;
  checkedAt: string;
};

export type CloudWatchMetricsOverview = FetchCloudWatchMetricsResult & {
  status: "ok" | "not_configured" | "error";
  message: string;
};
