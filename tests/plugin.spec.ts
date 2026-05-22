import { describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin, { buildGrafanaEmbedUrl } from "../src/worker.js";

vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: vi.fn(() => ({
    send: vi.fn().mockResolvedValue({ MetricDataResults: [] }),
  })),
  GetMetricDataCommand: vi.fn((input: unknown) => input),
}));

describe("paperclip observability plugin", () => {
  it("registers Observability sidebar, page, and settings UI", () => {
    const sidebar = manifest.ui?.slots?.find((slot) => slot.id === "observability-nav");
    const page = manifest.ui?.slots?.find((slot) => slot.id === "observability");
    const settings = manifest.ui?.slots?.find((slot) => slot.id === "observability-settings");
    expect(sidebar).toMatchObject({
      type: "sidebar",
      displayName: "Observability",
      exportName: "ObservabilitySidebar",
    });
    expect(page).toMatchObject({
      type: "page",
      displayName: "Observability",
      routePath: "observability",
      exportName: "ObservabilityPage",
    });
    expect(settings).toMatchObject({
      type: "settingsPage",
      displayName: "Observability",
      exportName: "ObservabilitySettingsPage",
    });
    const routeSidebar = manifest.ui?.slots?.find((slot) => slot.id === "observability-route-nav");
    expect(routeSidebar).toMatchObject({
      type: "routeSidebar",
      routePath: "observability",
      exportName: "ObservabilityRouteSidebar",
    });
    expect(manifest.capabilities).toContain("ui.sidebar.register");
    expect(manifest.capabilities).toContain("ui.page.register");
    expect(manifest.capabilities).toContain("instance.settings.register");
    expect(manifest.capabilities).toContain("secrets.read-ref");
    expect(manifest.capabilities).toContain("metrics.write");
  });

  it("resolves AWS secret refs via testAwsAccess", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    harness.ctx.secrets.resolve = async (ref: string) => `resolved:${ref}`;

    await harness.performAction("saveConfig", {
      companyId: "co-1",
      config: {
        provider: "cloudwatch",
        cloudwatchRegion: "us-east-1",
        awsAccessKeySecretRef: "AWS_ACCESS_KEY_ID",
        awsSecretAccessKeySecretRef: "AWS_SECRET_ACCESS_KEY",
      },
    });

    const test = (await harness.performAction("testAwsAccess", {
      companyId: "co-1",
    })) as { ok: boolean; message: string };
    expect(test.ok).toBe(true);
  });

  it("stores ECS config and reports metrics import ready", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    await harness.performAction("saveConfig", {
      companyId: "co-2",
      config: {
        provider: "cloudwatch",
        cloudwatchRegion: "us-east-1",
        awsAccessKeySecretRef: "key",
        awsSecretAccessKeySecretRef: "secret",
        cloudwatchNamespace: "AWS/ECS",
        ecsClusterName: "prod-cluster",
        selectedMetricIds: ["cpu", "memory"],
      },
    });

    const overview = await harness.getData<{
      metricsImportReady: boolean;
      config: { cloudwatchNamespace?: string; ecsClusterName?: string };
    }>("overview", { companyId: "co-2" });

    expect(overview.metricsImportReady).toBe(true);
    expect(overview.config.cloudwatchNamespace).toBe("AWS/ECS");
    expect(overview.config.ecsClusterName).toBe("prod-cluster");
  });

  it("buildGrafanaEmbedUrl only allows HTTPS without credentials", () => {
    expect(buildGrafanaEmbedUrl("https://grafana.example.com/d/abc")).toContain(
      "grafana.example.com/d/abc",
    );
    expect(buildGrafanaEmbedUrl("https://grafana.example.com/d/abc")).toContain("kiosk=tv");
    expect(buildGrafanaEmbedUrl("http://grafana.example.com")).toBeNull();
    expect(buildGrafanaEmbedUrl("javascript:alert(1)")).toBeNull();
    expect(buildGrafanaEmbedUrl("https://user:pass@grafana.example.com")).toBeNull();
  });

  it("rejects invalid Grafana URL in overview", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    await harness.performAction("saveConfig", {
      companyId: "co-bad-grafana",
      config: { provider: "grafana", grafanaUrl: "http://grafana.example.com" },
    });

    const overview = await harness.getData<{
      status: string;
      grafanaEmbedUrl: string | null;
      message: string;
    }>("overview", { companyId: "co-bad-grafana" });

    expect(overview.grafanaEmbedUrl).toBeNull();
    expect(overview.status).toBe("not_configured");
    expect(overview.message).toContain("HTTPS");
  });

  it("stores and reads company observability config", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    await harness.performAction("saveConfig", {
      companyId: "co-1",
      config: { provider: "grafana", grafanaUrl: "https://grafana.example.com" },
    });

    const overview = await harness.getData<{
      provider: string;
      status: string;
      grafanaEmbedUrl: string | null;
    }>("overview", {
      companyId: "co-1",
    });
    expect(overview.provider).toBe("grafana");
    expect(overview.status).toBe("ok");
    expect(overview.grafanaEmbedUrl).toContain("grafana.example.com");
  });

  it("records host metrics after cloudwatchMetrics fetch", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    harness.ctx.secrets.resolve = async (ref: string) => `resolved:${ref}`;

    await harness.performAction("saveConfig", {
      companyId: "co-metrics",
      config: {
        provider: "cloudwatch",
        cloudwatchRegion: "us-east-1",
        awsAccessKeySecretRef: "key",
        awsSecretAccessKeySecretRef: "secret",
        cloudwatchNamespace: "AWS/ECS",
        ecsClusterName: "prod",
      },
    });

    await harness.getData("cloudwatchMetrics", { companyId: "co-metrics" });

    const metricNames = harness.metrics.map((m) => m.name);
    expect(metricNames).toContain("observability.cloudwatch.series_count");
    expect(metricNames).toContain("observability.cloudwatch.datapoints");
    expect(harness.metrics.every((m) => m.tags?.company_id === "co-metrics")).toBe(true);
  });
});
