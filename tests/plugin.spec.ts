import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("paperclip observability plugin", () => {
  it("registers Observability sidebar nav and page", () => {
    const sidebar = manifest.ui?.slots?.find((slot) => slot.id === "observability-nav");
    const page = manifest.ui?.slots?.find((slot) => slot.id === "observability");
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
    expect(manifest.capabilities).toContain("ui.sidebar.register");
    expect(manifest.capabilities).toContain("ui.page.register");
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
});
