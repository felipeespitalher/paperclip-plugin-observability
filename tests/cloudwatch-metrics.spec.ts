import { describe, expect, it, vi, beforeEach } from "vitest";

const send = vi.fn();

vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: vi.fn(function CloudWatchClient() {
    return { send };
  }),
  GetMetricDataCommand: vi.fn((input: unknown) => input),
}));

import {
  fetchCloudWatchMetrics,
  fetchElasticBeanstalkMetrics,
  listMetricDefs,
  mapMetricResults,
  METRIC_CATALOG,
} from "../src/cloudwatch-metrics.js";
import type { MetricDataResult } from "@aws-sdk/client-cloudwatch";

describe("cloudwatch-metrics", () => {
  beforeEach(() => {
    send.mockReset();
  });

  it("maps GetMetricData results into chart series", () => {
    const defs = METRIC_CATALOG["AWS/ElasticBeanstalk"];
    const results: MetricDataResult[] = [
      {
        Id: "m0",
        Timestamps: [new Date("2026-05-22T10:00:00Z"), new Date("2026-05-22T10:05:00Z")],
        Values: [12.5, 18.2],
      },
    ];
    const series = mapMetricResults(defs, results);
    expect(series[0]?.points).toHaveLength(2);
    expect(series[0]?.points[0]?.value).toBe(12.5);
  });

  it("filters metrics by selected ids", () => {
    const picked = listMetricDefs("AWS/RDS", ["cpu", "connections"]);
    expect(picked).toHaveLength(2);
    expect(picked.map((d) => d.id)).toEqual(["cpu", "connections"]);
  });

  it("fetches Elastic Beanstalk metrics via CloudWatch client", async () => {
    send.mockResolvedValue({
      MetricDataResults: [
        {
          Id: "m0",
          Timestamps: [new Date("2026-05-22T10:00:00Z")],
          Values: [42],
        },
      ],
    });

    const result = await fetchElasticBeanstalkMetrics({
      region: "us-east-1",
      accessKeyId: "AKIA_TEST",
      secretAccessKey: "secret",
      environmentName: "gaud-prod",
      lookbackHours: 1,
      selectedMetricIds: ["cpu"],
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.environmentName).toBe("gaud-prod");
    expect(result.series).toHaveLength(1);
    expect(result.series[0]?.points[0]?.value).toBe(42);
  });

  it("fetches ECS metrics with cluster and service dimensions", async () => {
    send.mockResolvedValue({ MetricDataResults: [] });

    await fetchCloudWatchMetrics({
      region: "us-east-1",
      accessKeyId: "AKIA_TEST",
      secretAccessKey: "secret",
      resource: {
        namespace: "AWS/ECS",
        target: { clusterName: "prod", serviceName: "api" },
      },
      selectedMetricIds: ["cpu"],
    });

    const command = send.mock.calls[0]?.[0] as {
      MetricDataQueries?: { MetricStat?: { Metric?: { Dimensions?: { Name: string }[] } } }[];
    };
    const dimensions = command.MetricDataQueries?.[0]?.MetricStat?.Metric?.Dimensions ?? [];
    expect(dimensions.map((d) => d.Name)).toEqual(["ClusterName", "ServiceName"]);
  });

  it("fetches RDS metrics with DBInstanceIdentifier dimension", async () => {
    send.mockResolvedValue({ MetricDataResults: [] });

    await fetchCloudWatchMetrics({
      region: "us-east-1",
      accessKeyId: "AKIA_TEST",
      secretAccessKey: "secret",
      resource: {
        namespace: "AWS/RDS",
        target: { dbInstanceIdentifier: "gaud-db" },
      },
    });

    const command = send.mock.calls[0]?.[0] as {
      MetricDataQueries?: { MetricStat?: { Metric?: { Namespace?: string; Dimensions?: { Name: string; Value: string }[] } } }[];
    };
    const metric = command.MetricDataQueries?.[0]?.MetricStat?.Metric;
    expect(metric?.Namespace).toBe("AWS/RDS");
    expect(metric?.Dimensions?.[0]).toEqual({
      Name: "DBInstanceIdentifier",
      Value: "gaud-db",
    });
  });
});
