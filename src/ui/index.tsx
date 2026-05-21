import { useState } from "react";
import {
  useHostContext,
  useHostNavigation,
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginSidebarProps,
} from "@paperclipai/plugin-sdk/ui";
import type { ObservabilityOverview } from "../worker.js";

/** Company-scoped plugin page route (manifest `routePath: observability`). */
const OBSERVABILITY_ROUTE = "/observability";

export function ObservabilitySidebar(_props: PluginSidebarProps) {
  const nav = useHostNavigation();

  return (
    <a
      {...nav.linkProps(OBSERVABILITY_ROUTE)}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: "transparent",
        border: "none",
        padding: "0.5rem 0.75rem",
        cursor: "pointer",
        font: "inherit",
        color: "inherit",
        textDecoration: "none",
      }}
    >
      Observability
    </a>
  );
}

export function ObservabilityPage(_props: PluginPageProps) {
  const hostContext = useHostContext();
  const companyId = hostContext.companyId;
  const { data, loading, error, refresh } = usePluginData<ObservabilityOverview>("overview", {
    companyId: companyId ?? undefined,
  });
  const saveConfig = usePluginAction("saveConfig");
  const [provider, setProvider] = useState<"grafana" | "cloudwatch" | "none">("none");
  const [grafanaUrl, setGrafanaUrl] = useState("");
  const [cloudwatchRegion, setCloudwatchRegion] = useState("us-east-1");
  const [saving, setSaving] = useState(false);

  if (!companyId) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Observability</h1>
        <p>Select a company to configure metrics providers.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Observability</h1>
        <p>Loading observability status…</p>
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

  const statusLabel =
    data?.status === "ok"
      ? "OK"
      : data?.status === "not_configured"
        ? "Not configured"
        : (data?.status ?? "unknown");

  async function handleSave() {
    setSaving(true);
    try {
      await saveConfig({
        companyId,
        config: {
          provider,
          grafanaUrl: provider === "grafana" ? grafanaUrl : undefined,
          cloudwatchRegion: provider === "cloudwatch" ? cloudwatchRegion : undefined,
        },
      });
      refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: "1.5rem", display: "grid", gap: "1.25rem", maxWidth: 960 }}>
      <header style={{ display: "grid", gap: "0.35rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Observability</h1>
        <p style={{ margin: 0, opacity: 0.8 }}>
          Grafana embed and CloudWatch console links per company. Configure a provider below, then
          view metrics in the panel.
        </p>
      </header>

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
        <span>{data?.message}</span>
        <span style={{ opacity: 0.6, fontSize: "0.85rem" }}>Checked {data?.checkedAt}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem" }}>
        <div
          style={{
            border: "1px solid rgba(128,128,128,0.25)",
            borderRadius: 8,
            padding: "0.75rem",
          }}
        >
          <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>Provider</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>{data?.provider ?? "none"}</div>
        </div>
        <div
          style={{
            border: "1px solid rgba(128,128,128,0.25)",
            borderRadius: 8,
            padding: "0.75rem",
          }}
        >
          <div style={{ fontSize: "0.75rem", opacity: 0.7 }}>Company</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600 }}>{companyId.slice(0, 8)}…</div>
        </div>
      </div>

      <section
        style={{
          border: "1px solid rgba(128,128,128,0.25)",
          borderRadius: 8,
          padding: "1rem",
          display: "grid",
          gap: "0.75rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Provider configuration</h2>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span>Provider</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>
            <option value="none">Not configured</option>
            <option value="grafana">Grafana</option>
            <option value="cloudwatch">CloudWatch</option>
          </select>
        </label>
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
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span>AWS region</span>
            <input
              type="text"
              placeholder="us-east-1"
              value={cloudwatchRegion}
              onChange={(e) => setCloudwatchRegion(e.target.value)}
            />
          </label>
        )}
        <button type="button" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </section>

      {data?.grafanaEmbedUrl ? (
        <section
          style={{
            border: "1px solid rgba(128,128,128,0.25)",
            borderRadius: 8,
            padding: "0.5rem",
            minHeight: 420,
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.1rem", padding: "0.5rem" }}>Grafana</h2>
          <iframe
            title="Grafana dashboard"
            src={data.grafanaEmbedUrl}
            style={{ flex: 1, width: "100%", minHeight: 360, border: "1px solid rgba(128,128,128,0.2)" }}
          />
        </section>
      ) : null}

      {data?.cloudWatchConsoleUrl ? (
        <section
          style={{
            border: "1px solid rgba(128,128,128,0.25)",
            borderRadius: 8,
            padding: "1rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>CloudWatch</h2>
          <p style={{ margin: "0.5rem 0", opacity: 0.8 }}>
            CloudWatch does not support reliable iframe embed; open the AWS console.
          </p>
          <a href={data.cloudWatchConsoleUrl} target="_blank" rel="noreferrer">
            Open CloudWatch console
          </a>
        </section>
      ) : null}
    </div>
  );
}
