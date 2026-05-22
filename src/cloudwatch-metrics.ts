import type { MetricDataResult, MetricDataQuery } from "@aws-sdk/client-cloudwatch";

export type MetricPoint = { timestamp: string; value: number };

export type MetricSeries = {
  id: string;
  label: string;
  unit: string;
  points: MetricPoint[];
};

export type CloudWatchNamespace =
  | "AWS/ElasticBeanstalk"
  | "AWS/ECS"
  | "AWS/RDS";

export type MetricDef = {
  id: string;
  label: string;
  metricName: string;
  stat: "Average" | "Sum" | "Maximum";
  unit: string;
};

export type EbResource = { environmentName: string };
export type EcsResource = { clusterName: string; serviceName?: string };
export type RdsResource = { dbInstanceIdentifier: string };

export type CloudWatchResource =
  | { namespace: "AWS/ElasticBeanstalk"; target: EbResource }
  | { namespace: "AWS/ECS"; target: EcsResource }
  | { namespace: "AWS/RDS"; target: RdsResource };

export const METRIC_CATALOG: Record<CloudWatchNamespace, readonly MetricDef[]> = {
  "AWS/ElasticBeanstalk": [
    {
      id: "cpu",
      label: "CPU utilization",
      metricName: "CPUUtilization",
      stat: "Average",
      unit: "Percent",
    },
    {
      id: "health",
      label: "Environment health",
      metricName: "EnvironmentHealth",
      stat: "Average",
      unit: "Count",
    },
    {
      id: "requests",
      label: "Application requests",
      metricName: "ApplicationRequestsTotal",
      stat: "Sum",
      unit: "Count",
    },
  ],
  "AWS/ECS": [
    {
      id: "cpu",
      label: "CPU utilization",
      metricName: "CPUUtilization",
      stat: "Average",
      unit: "Percent",
    },
    {
      id: "memory",
      label: "Memory utilization",
      metricName: "MemoryUtilization",
      stat: "Average",
      unit: "Percent",
    },
    {
      id: "running_tasks",
      label: "Running tasks",
      metricName: "RunningTaskCount",
      stat: "Average",
      unit: "Count",
    },
  ],
  "AWS/RDS": [
    {
      id: "cpu",
      label: "CPU utilization",
      metricName: "CPUUtilization",
      stat: "Average",
      unit: "Percent",
    },
    {
      id: "connections",
      label: "Database connections",
      metricName: "DatabaseConnections",
      stat: "Average",
      unit: "Count",
    },
    {
      id: "free_storage",
      label: "Free storage",
      metricName: "FreeStorageSpace",
      stat: "Average",
      unit: "Bytes",
    },
    {
      id: "read_latency",
      label: "Read latency",
      metricName: "ReadLatency",
      stat: "Average",
      unit: "Seconds",
    },
    {
      id: "write_latency",
      label: "Write latency",
      metricName: "WriteLatency",
      stat: "Average",
      unit: "Seconds",
    },
  ],
};

export const DEFAULT_NAMESPACE: CloudWatchNamespace = "AWS/ElasticBeanstalk";

export function listMetricDefs(
  namespace: CloudWatchNamespace,
  selectedIds?: string[],
): MetricDef[] {
  const catalog = METRIC_CATALOG[namespace];
  if (!selectedIds?.length) return [...catalog];
  const allowed = new Set(selectedIds);
  const picked = catalog.filter((def) => allowed.has(def.id));
  return picked.length > 0 ? [...picked] : [...catalog];
}

function buildDimensions(resource: CloudWatchResource): { Name: string; Value: string }[] {
  switch (resource.namespace) {
    case "AWS/ElasticBeanstalk":
      return [{ Name: "EnvironmentName", Value: resource.target.environmentName.trim() }];
    case "AWS/ECS": {
      const dims = [{ Name: "ClusterName", Value: resource.target.clusterName.trim() }];
      const service = resource.target.serviceName?.trim();
      if (service) dims.push({ Name: "ServiceName", Value: service });
      return dims;
    }
    case "AWS/RDS":
      return [
        { Name: "DBInstanceIdentifier", Value: resource.target.dbInstanceIdentifier.trim() },
      ];
  }
}

function resourceLabel(resource: CloudWatchResource): string {
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

export function mapMetricResults(
  metricDefs: readonly MetricDef[],
  results: MetricDataResult[] | undefined,
): MetricSeries[] {
  return metricDefs.map((def, index) => {
    const result = results?.find((row) => row.Id === `m${index}`);
    const points: MetricPoint[] =
      result?.Timestamps?.map((timestamp, i) => ({
        timestamp: timestamp.toISOString(),
        value: result.Values?.[i] ?? 0,
      }))
        .filter((point) => Number.isFinite(point.value))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)) ?? [];

    return {
      id: def.id,
      label: def.label,
      unit: def.unit,
      points,
    };
  });
}

export type FetchCloudWatchMetricsInput = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  resource: CloudWatchResource;
  selectedMetricIds?: string[];
  lookbackHours?: number;
};

export type FetchCloudWatchMetricsResult = {
  namespace: CloudWatchNamespace;
  resourceLabel: string;
  region: string;
  fetchedAt: string;
  series: MetricSeries[];
};

export async function fetchCloudWatchMetrics(
  input: FetchCloudWatchMetricsInput,
): Promise<FetchCloudWatchMetricsResult> {
  const resource = input.resource;
  const resourceLabelValue = resourceLabel(resource);
  if (!resourceLabelValue.trim()) {
    throw new Error("CloudWatch resource identifier is required");
  }

  const metricDefs = listMetricDefs(resource.namespace, input.selectedMetricIds);
  const { CloudWatchClient, GetMetricDataCommand } = await import("@aws-sdk/client-cloudwatch");
  const client = new CloudWatchClient({
    region: input.region.trim(),
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    },
  });

  const end = new Date();
  const lookbackHours = input.lookbackHours ?? 3;
  const start = new Date(end.getTime() - lookbackHours * 60 * 60 * 1000);
  const period = 300;
  const dimensions = buildDimensions(resource);

  const metricDataQueries: MetricDataQuery[] = metricDefs.map((def, index) => ({
    Id: `m${index}`,
    MetricStat: {
      Metric: {
        Namespace: resource.namespace,
        MetricName: def.metricName,
        Dimensions: dimensions,
      },
      Period: period,
      Stat: def.stat,
    },
    ReturnData: true,
  }));

  const response = await client.send(
    new GetMetricDataCommand({
      StartTime: start,
      EndTime: end,
      MetricDataQueries: metricDataQueries,
    }),
  );

  return {
    namespace: resource.namespace,
    resourceLabel: resourceLabelValue,
    region: input.region.trim(),
    fetchedAt: new Date().toISOString(),
    series: mapMetricResults(metricDefs, response.MetricDataResults),
  };
}

/** @deprecated Use fetchCloudWatchMetrics — kept for tests and EB-specific callers */
export const EB_METRIC_DEFS = METRIC_CATALOG["AWS/ElasticBeanstalk"];

export type FetchEbMetricsInput = {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  environmentName: string;
  lookbackHours?: number;
  selectedMetricIds?: string[];
};

export type FetchEbMetricsResult = FetchCloudWatchMetricsResult & {
  environmentName: string;
};

export async function fetchElasticBeanstalkMetrics(
  input: FetchEbMetricsInput,
): Promise<FetchEbMetricsResult> {
  const result = await fetchCloudWatchMetrics({
    region: input.region,
    accessKeyId: input.accessKeyId,
    secretAccessKey: input.secretAccessKey,
    lookbackHours: input.lookbackHours,
    selectedMetricIds: input.selectedMetricIds,
    resource: {
      namespace: "AWS/ElasticBeanstalk",
      target: { environmentName: input.environmentName },
    },
  });
  return {
    ...result,
    environmentName: result.resourceLabel,
  };
}
