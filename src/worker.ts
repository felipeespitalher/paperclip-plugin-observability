import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";

export type ObservabilityProvider = "grafana" | "cloudwatch" | "none";

export type ObservabilityConfig = {
  provider: ObservabilityProvider;
  grafanaUrl?: string;
  cloudwatchRegion?: string;
};

export type ObservabilityOverview = {
  provider: ObservabilityProvider;
  status: "ok" | "not_configured";
  message: string;
  grafanaEmbedUrl: string | null;
  cloudWatchConsoleUrl: string | null;
  checkedAt: string;
};

function buildGrafanaEmbedUrl(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  const base = url.trim().replace(/\/+$/, "");
  return `${base}${base.includes("?") ? "&" : "?"}kiosk=tv`;
}

function buildCloudWatchUrl(region: string | undefined): string | null {
  const r = region?.trim();
  if (!r) return null;
  return `https://${r}.console.aws.amazon.com/cloudwatch/home?region=${encodeURIComponent(r)}`;
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.data.register("overview", async ({ companyId }) => {
      const raw = await ctx.state.get({
        scopeKind: "company",
        scopeId: String(companyId),
        stateKey: "observability.config",
      });
      const config = (raw ?? { provider: "none" }) as ObservabilityConfig;
      const provider = config.provider ?? "none";
      const configured = provider !== "none";
      return {
        provider,
        status: configured ? "ok" : "not_configured",
        message: configured
          ? `Connected to ${provider}`
          : "Configure Grafana or CloudWatch to embed dashboards",
        grafanaEmbedUrl: provider === "grafana" ? buildGrafanaEmbedUrl(config.grafanaUrl) : null,
        cloudWatchConsoleUrl:
          provider === "cloudwatch" ? buildCloudWatchUrl(config.cloudwatchRegion) : null,
        checkedAt: new Date().toISOString(),
      } satisfies ObservabilityOverview;
    });

    ctx.actions.register("saveConfig", async (input) => {
      const companyId = (input as { companyId?: string })?.companyId;
      if (!companyId) {
        throw new Error("companyId is required");
      }
      const config = (input as { config?: ObservabilityConfig })?.config;
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
  },

  async onHealth() {
    return { status: "ok", message: "Observability plugin worker is running" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
