---
title: "Dockerizing .NET API and Angular for Reproducible Local Dev"
description: "How I Docker Compose a .NET API, Angular SPA, and SQL Server for marketplace and eCommerce stacks — reproducible local environments without the 'works on my machine' tax."
date: "2026-04-02"
category: "architecture"
tags: ["Docker", ".NET", "Angular", "Docker Compose"]
---

When I join a marketplace or eCommerce project, the first week often includes someone discovering their local SQL schema is two migrations behind, the Angular app points at a staging API by accident, and the .NET API runs on a different port than the README claims. Docker does not fix architecture problems, but it does fix environment drift — which is one of the fastest ways to slow a product team down.

This post describes how I Dockerize a .NET API and Angular front end for **local and dev** environments. Production images are related but not identical; the goal here is reproducibility for every developer on the team.

## Why Docker for local dev on a .NET + Angular stack

Marketplace stacks typically include:

- ASP.NET Core API (catalog, cart, orders, payments webhooks)
- Angular SPA (buyer and seller portals)
- SQL Server (or Azure SQL locally via container)
- Sometimes Redis, RabbitMQ, or a mock payment gateway

Without containers, onboarding reads like a checklist: install .NET 8 SDK, Node 20, Angular CLI, SQL Server Express, create database, run migrations, copy `.env` from Slack. With containers, onboarding is `docker compose up` and a documented `.env.example`.

The win is not "we use Docker." The win is **the same topology** on every laptop — stable service names, same ports inside the network, same SQL version.

## Project layout I stick with

```text
/
  src/
    Api/                 # ASP.NET Core
    Web/                 # Angular workspace
  docker/
    api.Dockerfile.dev
    web.Dockerfile.dev
  docker-compose.yml
  docker-compose.override.yml   # optional local-only tweaks
  .dockerignore
  .env.example
```

I keep dev Dockerfiles separate from production multi-stage builds. Dev images optimize for **fast feedback** (volume mounts, `dotnet watch`, `ng serve`). Production images optimize for **small size and security** — a different file in CI.

## docker-compose.yml for API + Angular + SQL Server

A compose file that mirrors how eCommerce teams actually work:

```yaml
services:
  db:
    image: mcr.microsoft.com/mssql/server:2022-latest
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: "${SA_PASSWORD}"
    ports:
      - "1433:1433"
    volumes:
      - sqldata:/var/opt/mssql
    healthcheck:
      test: /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$${MSSQL_SA_PASSWORD}" -C -Q "SELECT 1" || exit 1
      interval: 10s
      timeout: 5s
      retries: 10

  api:
    build:
      context: .
      dockerfile: docker/api.Dockerfile.dev
    environment:
      ASPNETCORE_ENVIRONMENT: Development
      ConnectionStrings__Default: "Server=db;Database=Marketplace;User Id=sa;Password=${SA_PASSWORD};TrustServerCertificate=True"
      IdentityServer__Authority: "https://localhost:5001"
      Cors__AllowedOrigins__0: "http://localhost:4200"
    ports:
      - "5080:8080"
    volumes:
      - ./src/Api:/src/Api
    depends_on:
      db:
        condition: service_healthy

  web:
    build:
      context: .
      dockerfile: docker/web.Dockerfile.dev
    environment:
      API_URL: "http://localhost:5080"
    ports:
      - "4200:4200"
    volumes:
      - ./src/Web:/app
      - /app/node_modules
    depends_on:
      - api

volumes:
  sqldata:
```

Notes that matter in real projects:

- **Service name `db`** becomes the SQL hostname inside the network. Connection strings use `Server=db`, not `localhost`, from the API container.
- **Health check on SQL** prevents the API from crashing on startup while SQL is still initializing. SQL Server containers are slow on first boot.
- **Anonymous volume for `node_modules`** stops the host from overwriting Linux-installed packages when the dev mounts the Angular folder from Windows or macOS.

## Dev Dockerfile for ASP.NET Core

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:8.0
WORKDIR /src/Api
COPY src/Api/*.csproj .
RUN dotnet restore
COPY src/Api .
EXPOSE 8080
ENTRYPOINT ["dotnet", "watch", "run", "--urls", "http://0.0.0.0:8080"]
```

`dotnet watch` inside the container gives reasonable reload times for controller and handler changes. For large solutions, mount only the API project or use a solution filter to keep restore fast.

Run EF Core migrations as an explicit step — either a compose `migrate` service or a documented `docker compose run --rm api dotnet ef database update`. Auto-migrate on every API start works for solo dev; it gets messy when three developers hit the same local database.

## Dev Dockerfile for Angular

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY src/Web/package*.json ./
RUN npm ci
COPY src/Web .
EXPOSE 4200
CMD ["npm", "run", "start", "--", "--host", "0.0.0.0", "--poll", "2000"]
```

`--host 0.0.0.0` is required so the browser on the host can reach `ng serve` inside the container. File polling helps hot reload when source is bind-mounted from Windows filesystems.

Wire the API URL through environment at build time or runtime depending on your Angular setup. For local Docker, I often use `environment.docker.ts` swapped in via compose env vars, or proxy configuration pointing `ng serve` at `http://api:8080` for same-network calls during SSR or proxy mode.

## Networking: host vs container URLs

This trips up every marketplace team once.

- **Browser → Angular:** `http://localhost:4200`
- **Browser → API (from Angular HttpClient):** usually `http://localhost:5080` because the browser runs on the host
- **API container → SQL:** `Server=db;...`
- **API container → IdentityServer on host:** `host.docker.internal` on Docker Desktop, or run IdentityServer in compose too

When auth uses IdentityServer cookies or silent refresh iframes, mismatched URLs cause failures that look like CORS bugs but are really redirect URI problems. Align ports in IdentityServer client config with what the browser actually uses.

## .env and secrets hygiene

Commit `.env.example`:

```env
SA_PASSWORD=Your_local_SA_password_123!
```

Never commit `.env`. For local Docker, weak passwords are fine. For compose files that touch shared dev servers, treat `.env` like production-lite.

Payment sandbox keys (Stripe test mode, Adyen sandbox) belong in `.env` and map into API environment variables. Marketplace teams often need webhook tunneling (ngrok, Cloudflare Tunnel) for payment callbacks — document that Docker local does not expose webhooks to the internet without a tunnel.

## Making local feel like staging without cloning Azure

Docker local will not replicate Azure App Service cold start, Key Vault references, or Application Insights sampling. That is fine. Match **shape**, not **scale**:

| Concern | Local Docker | Staging Azure |
|--------|--------------|---------------|
| SQL | Container SQL Server | Azure SQL |
| Files | Local volume or Azurite | Azure Blob Storage |
| Auth | IdentityServer in compose or dev tenant | Entra / IdentityServer staging |
| Config | `.env` + environment vars | App Service settings + Key Vault |

Use Azurite for blob upload features so catalog image uploads behave similarly to Azure Blob without cloud dependency. Swap connection strings via configuration the same way you would in App Service.

## Common failures and fixes

**"Login works locally without Docker but not in compose."** Check IdentityServer authority URL, HTTPS vs HTTP, and whether the Angular app calls `localhost` vs `api`. Token validation fails if the API cannot reach discovery document at the configured authority.

**"SQL connection refused."** API started before SQL was ready — add `depends_on` with health condition. Wrong hostname — use `db` inside network, `localhost` only from host tools like SSMS.

**"Angular changes do not reload."** Bind mount on Windows needs polling. Node modules overwritten — use anonymous volume.

**"Migrations fail on shared team database."** Pin migration order in CI; locally, reset database with `docker compose down -v` when experimental branches diverge. Document the reset command so nobody assumes data loss is a bug.

**"Compose is slow on Apple Silicon / Windows."** Allocate enough Docker memory (SQL Server wants 2 GB+). Use WSL2 backend on Windows for tolerable file watch performance.

## When not to Dockerize everything

If the team is two people and one API with no database, Docker may be overhead. If the team ships a multi-service marketplace with SQL Server, background jobs, and an Angular seller dashboard, Docker pays back quickly.

I also keep **IDE debugging** available: attach to the API container or run API on host with `dotnet run` while SQL stays in compose. Forcing every developer through containers for debugger attach sometimes hurts more than it helps. Compose should be the default, not a prison.

## Handoff documentation that clients actually use

When I deliver a Dockerized local stack, the README includes:

1. Prerequisites (Docker Desktop, WSL2 on Windows)
2. Copy `.env.example` to `.env`
3. `docker compose up --build`
4. Run migrations command
5. Default URLs for buyer app, seller app, Swagger
6. How to reset database volume
7. How production deploy differs (Azure App Service, not compose on a VM)

That page reduces Slack questions more than any architecture diagram.

## Bottom line

Docker Compose for .NET and Angular is about **reproducible dev environments** for complex product stacks — especially marketplace and eCommerce codebases where SQL schema, auth, and front-end API URLs must stay aligned. Get service names, health checks, and host-vs-container URLs right, and the team spends less time fixing laptops and more time shipping features.

If you want a Docker-based local dev setup for your .NET API and Angular front end — or help aligning it with Azure staging — [get in touch](/contact).
