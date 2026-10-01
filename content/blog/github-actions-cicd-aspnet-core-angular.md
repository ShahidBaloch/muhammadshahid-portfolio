---
title: "GitHub Actions CI/CD for ASP.NET Core + Angular"
description: "A portable GitHub Actions workflow for ASP.NET Core + Angular — restore/build/test caching, npm ci and budget gates, artifacts, environment protection, EF migration job pointers, and secrets you never put in YAML."
date: "2026-10-01"
category: "devops"
tags: ["GitHub Actions", "CI/CD", "ASP.NET Core", "Angular", "DevOps"]
related:
  - azure-app-service-aspnet-core
  - ef-core-migrations-production
  - docker-dotnet-angular-local
  - git-merge-vs-rebase
faq:
  - q: "How do I CI/CD ASP.NET Core and Angular with GitHub Actions?"
    a: "Use a workflow that builds and tests both stacks (dotnet + npm), publishes artifacts, and deploys from a protected environment. Cache NuGet and npm, fail on Angular budgets/tests, and keep secrets in GitHub Environments — not in YAML."
  - q: "Should .NET and Angular be one job or two?"
    a: "Prefer parallel jobs for speed (api and web), then a deploy job that needs both artifacts. Monorepos can path-filter so unrelated changes skip half the graph."
  - q: "Is this the same as deploying from the App Service deployment center?"
    a: "No. This is a portable pipeline you own in GitHub Actions. App Service remains a deploy target; portal-only deploy is a different habit covered in the App Service post."
---

**GitHub Actions CI/CD for ASP.NET Core + Angular** is a repeatable workflow: restore, build, test, artifact, and deploy both stacks with caching and environment protections — without stuffing connection strings into YAML or treating the Azure portal as your only pipeline.

```text
PR / main
  ├─ job api:  dotnet restore/build/test → api artifact
  ├─ job web:  npm ci/build/test → web artifact
  └─ job deploy (main only, environment: prod)
         download artifacts → publish API + static web → Azure
```

**New to this** → stay here. **App Service target** → [Azure App Service ASP.NET Core](/blog/azure-app-service-aspnet-core). **Migrations** → [EF migrations production](/blog/ef-core-migrations-production).

Search intent for **github actions asp.net core angular** is how-to pipeline shape.

## Monorepo vs two-project workflow shapes

**Monorepo (common):**

```text
/src/Clinic.Api
/src/Clinic.Web   # Angular
/.github/workflows/ci.yml
```

**Two repos:** workflow_call or separate pipelines; deploy contract is artifact versions.

Path filters:

```yaml
on:
  push:
    branches: [main]
    paths:
      - "src/Clinic.Api/**"
      - "src/Clinic.Web/**"
      - ".github/workflows/**"
  pull_request:
    paths:
      - "src/Clinic.Api/**"
      - "src/Clinic.Web/**"
      - ".github/workflows/**"
```

## Sample workflow annotated

```yaml
name: ci-cd

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  api:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: src/Clinic.Api
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-dotnet@v4
        with:
          global-json-file: global.json

      - name: Cache NuGet
        uses: actions/cache@v4
        with:
          path: ~/.nuget/packages
          key: nuget-${{ hashFiles('**/*.csproj') }}
          restore-keys: nuget-

      - run: dotnet restore
      - run: dotnet build --no-restore -c Release
      - run: dotnet test --no-build -c Release --logger trx --results-directory TestResults

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: api-test-results
          path: src/Clinic.Api/TestResults

      - run: dotnet publish -c Release -o "${{ github.workspace }}/artifacts/api" --no-build

      - uses: actions/upload-artifact@v4
        with:
          name: api-publish
          path: artifacts/api

  web:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: src/Clinic.Web
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: src/Clinic.Web/package-lock.json

      - run: npm ci
      - run: npm run test -- --watch=false --browsers=ChromeHeadless
      - run: npm run build -- --configuration production

      - uses: actions/upload-artifact@v4
        with:
          name: web-dist
          path: src/Clinic.Web/dist/web/browser

  deploy:
    needs: [api, web]
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: api-publish
          path: api

      - uses: actions/download-artifact@v4
        with:
          name: web-dist
          path: web

      - name: Merge SPA into wwwroot
        run: |
          mkdir -p api/wwwroot
          cp -R web/* api/wwwroot/

      # Prefer OIDC federation to Azure (see next-step note) over long-lived publish profiles in YAML
      - name: Deploy to Azure Web App
        uses: azure/webapps-deploy@v3
        with:
          app-name: ${{ vars.AZURE_WEBAPP_NAME }}
          publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
          package: api
```

Adjust paths to your Angular `dist` output and whether the SPA is merged into the API or hosted separately.

## dotnet restore/build/test with caching

- Pin SDK via `global.json`  
- Cache NuGet packages by csproj hash  
- `Restore` → `Build` → `Test --no-build` → `Publish --no-build` keeps the graph honest  
- Upload TRX for failed PR diagnosis  

For integration tests needing SQL, prefer Testcontainers in a later hardening pass — keep PR signal fast first.

## npm ci + Angular build and budgets gate

Always `npm ci` with a committed lockfile — not `npm install` on CI.

Angular budgets in `angular.json` should fail the build when bundles bloat:

```json
"budgets": [
  { "type": "initial", "maximumWarning": "750kb", "maximumError": "1mb" }
]
```

That gate protects LCP more than another markdown performance essay. Fail the job on budget errors.

Lint optionally as a separate job so typecheck failures stay visible.

## Artifacts and environment protection rules

- **Artifacts** pass bits between jobs without rebuilding in deploy  
- **Environments** (`production`) add required reviewers and wait timers in GitHub settings  
- Use `vars` for non-secret names; `secrets` for credentials  

Protect `main` with PR reviews ([merge vs rebase habits](/blog/git-merge-vs-rebase) for branch hygiene).

## Deploy job patterns (App Service pointer; OIDC sibling)

`azure/webapps-deploy` with a publish profile works for small teams. Prefer **OIDC federation** (GitHub → Entra ID federated credential → Azure RBAC) so you are not rotating publish profiles forever. Treat OIDC as the next hardening step when this pipeline is green.

Separate slots: deploy to staging slot, smoke test, swap. Details of App Service ops live in [App Service ASP.NET Core](/blog/azure-app-service-aspnet-core).

Container path: build/push image in CI, deploy to App Service containers or Kubernetes — still keep the same api+web job split.

## EF migrations as a gated job (pointer)

Do **not** silently run `dotnet ef database update` from the app on startup in production as your only strategy. Prefer:

1. Generate SQL in CI  
2. Review / apply as a controlled release step  

See [EF migrations in production](/blog/ef-core-migrations-production). Example gated job (sketch):

```yaml
  migrate:
    needs: [api]
    if: github.ref == 'refs/heads/main'
    environment: production-db
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
      - run: dotnet tool restore
      - run: dotnet ef migrations script --idempotent -o migrate.sql --project src/Clinic.Api
      # apply with trusted runner + secret connection — never echo connection string
```

## Secrets: what never belongs in YAML

Never commit:

- SQL connection strings  
- JWT signing keys  
- Publish profiles (store as GitHub secrets only)  
- npm tokens in plain checkout logs  

Avoid `echo ${{ secrets.X }}`. Masked secrets still leak via creative printing — don’t.

Local parity: [Docker .NET + Angular](/blog/docker-dotnet-angular-local) for developer machines; CI is the source of truth for release artifacts.

## PR checklist for the pipeline itself

1. API tests fail the PR  
2. Angular tests/budgets fail the PR  
3. Deploy does not run on forks/PRs  
4. Production environment requires approval  
5. Artifacts retained long enough for hotfix republish  
6. `concurrency` prevents overlapping deploys stomping each other  

## Common mistakes I still see

1. **`npm install` without lockfile** — non-deterministic CI  
2. **Building Angular inside the Dockerfile only** with no PR budget gate  
3. **Deploying from PR builds** to shared environments  
4. **One giant job** that rebuilds everything serially for 40 minutes  
5. **Connection strings in workflow files “temporarily”**  
6. **Ignoring failed tests because publish profile deploy “worked”**  

## Verification

- Open a PR that breaks a unit test → CI red  
- Open a PR that blows Angular budget → CI red  
- Merge to main → artifacts uploaded → deploy waits for environment approval if configured  
- Site serves new `main-*.js` hash after deploy  
- Rollback plan: redeploy previous artifact version  

## Freelance / delivery note

If you hand off to a client, include this workflow in the delivery checklist ([freelance checklist](/blog/freelance-dotnet-project-checklist)) so they are not stuck clicking Publish from Visual Studio on a Friday.

## If an interviewer asks

How do you CI/CD Angular + ASP.NET Core on GitHub Actions?

**Strong answer:** Parallel api/web jobs with caching, tests and Angular budgets as gates, artifacts into a protected deploy job, secrets in Environments, prefer OIDC to Azure. Migrations gated separately. Portal-only deploy is not a pipeline.

**Related:** [App Service](/blog/azure-app-service-aspnet-core) · [EF migrations](/blog/ef-core-migrations-production) · [Docker local](/blog/docker-dotnet-angular-local) · [Git merge vs rebase](/blog/git-merge-vs-rebase) · [Freelance checklist](/blog/freelance-dotnet-project-checklist)


## Matrix testing optional SDKs

```yaml
strategy:
  matrix:
    dotnet: ['8.0.x', '9.0.x']
```

Use sparingly — double minutes. Prefer one pinned SDK matching production plus a nightly matrix.

## Caching gotchas

- NuGet cache keys must change when PackageReference versions change  
- npm `cache: npm` needs the correct lockfile path in monorepos  
- Clear caches when CI acts “possessed” after tooling upgrades  

## Smoke test after deploy

```yaml
- name: Smoke
  run: |
    curl -fsS "${{ vars.APP_URL }}/health/live"
    curl -fsS "${{ vars.APP_URL }}/" | grep -qi "<app-root"
```

Fail the job on smoke failure so a bad deploy does not look green.

## Branching strategy note

`main` deploys to production; `develop` to staging if you use long-lived branches. Many teams prefer trunk-based + environment approvals instead. Pick one; document it next to [merge vs rebase](/blog/git-merge-vs-rebase).

## Permissions block

```yaml
permissions:
  contents: read
  id-token: write   # for OIDC
```

Least privilege — do not grant write to all products by default.

## Artifact retention

Keep at least the last N production artifacts for rollback. GitHub retention settings matter when compliance asks “what was deployed on date X.”

## Local vs CI parity

Developers run Docker Compose ([local guide](/blog/docker-dotnet-angular-local)); CI builds production configuration. Catch `environment.ts` mistakes with an explicit production build job — `ng serve` never proves prod budgets.

## Expanded secrets checklist

| Item | Store as |
|---|---|
| Publish profile / client secret | GitHub Environment secret |
| App name | Variable |
| Feature flags default | Variable or App Config |
| SQL admin password | Key Vault + MI; not GitHub if avoidable |

## Extra pitfalls

- Using `latest` tags for actions without pinning major versions  
- Forgetting `working-directory` in monorepo steps  
- Deploying API without copying Angular into wwwroot (blank UI, API OK)  


## Annotated job timing expectations (honest)

On ubuntu-latest without cache cold starts, expect several minutes for NuGet + npm. With warm caches, many portfolios finish PR CI in the 5–12 minute range depending on tests. Optimize by:

- Parallel api/web  
- Skipping deploy on PRs  
- Path filters  
- Not building Docker images on every PR unless Dockerfile changed  

## Promoting the same artifact

Build once on main, deploy the same `api-publish` artifact to staging then production. Rebuilding per environment lets “works in staging” differ from prod bits.

## Status checks required

In branch protection, require `api` and `web` jobs. Do not allow merge with failing budgets. This is the enforcement mechanism behind the workflow YAML.

## Hand-off package for clients

Include:

- Workflow file  
- Required secrets list (names only)  
- Environment protection screenshot/notes  
- Rollback steps  

Fits [freelance delivery checklist](/blog/freelance-dotnet-project-checklist).


## Docker build in Actions (optional job)

```yaml
  docker:
    needs: [api, web]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ${{ vars.REGISTRY }}
          username: ${{ secrets.REGISTRY_USER }}
          password: ${{ secrets.REGISTRY_TOKEN }}
      - uses: docker/build-push-action@v6
        with:
          push: true
          tags: ${{ vars.REGISTRY }}/clinic-api:${{ github.sha }}
```

Only when containers are the deploy unit — otherwise stick to `webapps-deploy` zip/folder publish.

## Workflow linting

Enable actionlint in a job or pre-commit to catch expression typos before they fail at runtime.
