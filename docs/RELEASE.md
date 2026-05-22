# Release — publicar no npmjs a cada versão

Pacote: **`@gaud_erp/papperclip_observability`** em [registry.npmjs.org](https://www.npmjs.com/package/@gaud%2Ferp%2Fpapperclip_observability).

Plugin id no Paperclip (não muda): `paperclip.observability`.

## Fluxo recomendado (CI)

1. Atualize `version` em `package.json` e `src/manifest.ts` (mesmo semver).
2. Commit na `main` e push.
3. Crie uma **GitHub Release** com tag `vX.Y.Z` (ex.: `v0.3.3`).
4. O workflow [`.github/workflows/publish-npm.yml`](../.github/workflows/publish-npm.yml) executa:
   - `npm ci` → `typecheck` → `test` → `build`
   - `npm publish` para o registry público

### Pré-requisito (uma vez)

No repositório GitHub → **Settings → Secrets → Actions**, configure:

| Secret | Valor |
|--------|--------|
| `NPM_TOKEN` | Token de automação npm com permissão **Publish** no escopo `@gaud_erp` (bypass 2FA se a org exigir) |

Não commite o token no repositório.

## Instalar na instância Paperclip (após publish)

Pin exato (recomendado):

```powershell
paperclipai plugin install @gaud_erp/papperclip_observability@X.Y.Z --api-base http://127.0.0.1:3100
paperclipai plugin inspect paperclip.observability --api-base http://127.0.0.1:3100
```

Em `local_trusted` (loopback), o board também pode usar:

```powershell
$body = '{"packageName":"@gaud_erp/papperclip_observability","version":"X.Y.Z"}'
Invoke-WebRequest -Method POST -Uri "http://127.0.0.1:3100/api/plugins/install" -ContentType "application/json" -Body $body
```

## Publish manual (fallback)

```powershell
cd paperclip-plugin-observability
$env:NPM_TOKEN = "<token>"   # ou npm login
npm run typecheck
npm run test
npm run build
npm publish --access public
```

## Nota sobre `@paperclip/observability`

O nome canônico desejado no epic é `@paperclip/observability`. Publicação nesse escopo exige permissão na org npm `@paperclip`. Até lá, releases usam `@gaud_erp/papperclip_observability` (mesmo plugin id `paperclip.observability`).
