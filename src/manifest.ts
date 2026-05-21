import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "paperclip.observability",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Observability",
  description: "View Grafana and CloudWatch metrics inside Paperclip",
  author: "Paperclip",
  categories: ["ui"],
  capabilities: [
    "plugin.state.read",
    "plugin.state.write",
    "ui.sidebar.register",
    "ui.page.register",
    "metrics.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "sidebar",
        id: "observability-nav",
        displayName: "Observability",
        routePath: "observability",
        exportName: "ObservabilitySidebar",
        order: 40,
      },
      {
        type: "page",
        id: "observability",
        displayName: "Observability",
        routePath: "observability",
        exportName: "ObservabilityPage",
        order: 40,
      },
    ],
  },
};

export default manifest;
