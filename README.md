# Paperclip Observability Plugin

Sidebar module for viewing **Grafana** and **AWS CloudWatch** metrics inside [Paperclip](https://github.com/paperclipai/paperclip).

## Features (v0.1)

- **Observability** sidebar nav slot (`observability-nav`) linking to the plugin page
- Full page at `/:company/observability` (manifest `routePath: observability`)
- Per-company provider configuration (Grafana URL or CloudWatch region)
- Worker health and overview data via the Paperclip plugin bridge

Planned follow-ups: embedded dashboards, auth/secrets integration, telemetry contracts.

## Requirements

- Paperclip host `2026.517` or newer
- Node.js 20+

## Development

```bash
pnpm install
pnpm dev      # watch-build worker, manifest, and UI into dist/
pnpm typecheck
pnpm test
pnpm build
```

## Install locally

```bash
paperclipai plugin install /absolute/path/to/paperclip-plugin-observability
```

Paperclip watches `dist/` for local-path installs and reloads the worker after rebuilds.

## Configuration

Open **Observability** in the sidebar, pick Grafana or CloudWatch, and save. Settings are stored in plugin state scoped to the active company.

## License

MIT — see [LICENSE](./LICENSE).

## Repository

Public source: [github.com/felipeespitalher/paperclip-plugin-observability](https://github.com/felipeespitalher/paperclip-plugin-observability)
