---
title: "Error Establishing a Redis Connection in ASP.NET Core (Fix Guide)"
description: "Fix 'error establishing a Redis connection' in ASP.NET Core — connection string, TLS, Azure Cache for Redis, Docker networking, timeout, and fail-open IDistributedCache patterns."
date: "2026-09-08"
updated: "2026-09-08"
category: "caching"
tags: ["Redis", "ASP.NET Core", "Caching", "Azure", "Docker", "Troubleshooting"]
related:
  - redis-caching-aspnet-core
  - what-is-a-cache-miss
  - docker-dotnet-angular-local
  - azure-app-service-aspnet-core
faq:
  - q: "What causes error establishing a Redis connection?"
    a: "Wrong host or port, Redis not running, firewall blocking 6379/6380, missing password, TLS mismatch (Azure requires SSL on 6380), Docker hostname wrong (use service name not localhost from another container), or connection string typo in appsettings."
  - q: "How do I fix Redis connection errors in ASP.NET Core?"
    a: "Verify Redis is running, test with redis-cli, match TLS and port in StackExchange.Redis connection string, use Azure access keys correctly, and wrap IDistributedCache in try/catch to fail-open to SQL when cache is optional."
  - q: "Why does Redis work locally but fail on Azure App Service?"
    a: "Local Docker uses localhost:6379 without TLS. Azure Cache for Redis requires SSL (port 6380), correct hostname, and firewall rules allowing App Service outbound IPs or VNet integration."
  - q: "Should my API crash when Redis is down?"
    a: "For read-through caches, usually no — fail-open to SQL and log warnings. For rate limiting or required coordination, Redis may be fail-closed by design."
---

**Error establishing a Redis connection** is the message you see when StackExchange.Redis (behind `IDistributedCache`) cannot open a socket to the server — wrong host, TLS mismatch, firewall, or Redis simply not running. This guide walks through fixes on **local Docker**, **Azure Cache for Redis**, and **ASP.NET Core** configuration.

Caching concepts: [what is a cache miss](/blog/what-is-a-cache-miss). Production cache design: [Redis caching ASP.NET Core](/blog/redis-caching-aspnet-core).

## What the error looks like

Typical logs or exceptions:

```text
StackExchange.Redis.RedisConnectionException:
  It was not possible to connect to the redis server(s).
  Error connecting to Redis.

WordPress / plugin messages (same root cause):
  Error establishing a Redis connection
```

ASP.NET Core surfaces this on first `GetStringAsync` / `SetStringAsync` if the multiplexer cannot connect.

## Quick diagnosis checklist

```text
□ Is Redis running? (docker ps / Azure portal status)
□ Host and port correct? (6379 plain, 6380 TLS on Azure)
□ Password / access key in connection string?
□ TLS enabled when server requires SSL?
□ From Docker Compose: hostname = service name, not localhost
□ Firewall / NSG allows outbound to Redis
□ Connection string in appsettings / Key Vault — no stale copy
```

## Connection string examples

### Local Docker Redis (no TLS)

```json
{
  "Redis": {
    "Connection": "localhost:6379"
  }
}
```

```csharp
builder.Services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = builder.Configuration["Redis:Connection"];
    options.InstanceName = "myapp:";
});
```

### Azure Cache for Redis (TLS required)

```json
{
  "Redis": {
    "Connection": "yourcache.redis.cache.windows.net:6380,password=YOUR_ACCESS_KEY,ssl=True,abortConnect=False"
  }
}
```

| Setting | Local | Azure |
|---|---|---|
| Port | `6379` | `6380` (SSL) |
| SSL | `false` / omitted | `ssl=True` |
| Password | optional | access key required |
| `abortConnect` | optional | often `False` so app starts even if Redis briefly unavailable |

**Common mistake:** using port `6379` against Azure without SSL — connection fails immediately.

## Docker Compose: wrong hostname

From **another container**, `localhost` is the container itself, not the Redis service:

```yaml
services:
  api:
    environment:
      - Redis__Connection=redis:6379   # service name
  redis:
    image: redis:7-alpine
```

Using `localhost:6379` inside the API container → **error establishing a Redis connection**.

See also: [Docker .NET + Angular local](/blog/docker-dotnet-angular-local).

## Test Redis before blaming ASP.NET Core

```bash
# Local
redis-cli -h localhost -p 6379 ping
# PONG

# Azure (TLS)
redis-cli -h yourcache.redis.cache.windows.net -p 6380 -a YOUR_KEY --tls ping
```

If `redis-cli` fails, fix infrastructure first — no C# change will help.

## Azure App Service specific fixes

1. **Connection string** in Configuration → Application settings (not only `appsettings.Production.json` in repo)
2. **Firewall** — allow App Service outbound IPs or use **VNet integration** + private endpoint
3. **TLS 1.2+** — enabled by default on modern stacks; very old clients rare on .NET 8+
4. **Non-SSL port disabled** — Azure often disables 6379; use 6380 + SSL

Deploy notes: [Azure App Service ASP.NET Core](/blog/azure-app-service-aspnet-core).

## Fail-open so Redis outages do not take the API down

If cache is an optimization, not a requirement:

```csharp
public async Task<ProviderListDto> GetProvidersAsync(ProviderQuery query, CancellationToken ct)
{
    var key = BuildKey(query);

    try
    {
        var cached = await _cache.GetStringAsync(key, ct);
        if (cached is not null)
            return JsonSerializer.Deserialize<ProviderListDto>(cached)!;
    }
    catch (RedisConnectionException ex)
    {
        _logger.LogWarning(ex, "Redis unavailable — cache miss path via SQL");
    }

    return await LoadFromSqlAsync(query, ct);
}
```

Every request becomes a **cache miss** while Redis is down — SQL must handle load. That is usually better than 500 on every read.

## Timeouts and connection storms

```text
yourhost:6380,password=...,ssl=True,abortConnect=False,connectTimeout=5000,syncTimeout=5000
```

- **`connectTimeout`** — how long to wait for initial connection
- **`abortConnect=False`** — allow app to start; retry in background (common on Azure)

Avoid creating a **new ConnectionMultiplexer per request** — register `IDistributedCache` once in DI.

## When the error is not Redis at all

| Symptom | Real cause |
|---|---|
| Works in Swagger, fails in Angular | CORS / wrong API URL — not Redis |
| Intermittent timeouts | SQL slow; mistaken for cache |
| After deploy only | Wrong slot settings / missing Key Vault reference |
| WordPress plugin message | PHP Redis extension — out of scope; same network fixes apply |

## Production checklist

1. Redis health in staging mirrors prod (TLS, firewall)
2. Connection string from secure config — never commit keys
3. Fail-open for optional read caches
4. Alert on Redis connection exceptions + miss-rate spike
5. Load test **with Redis down** — API should degrade, not die

## If an interviewer asks

**"Redis connection fails on startup?"**  
Check host, port, TLS, password; `abortConnect=False` for Azure; verify with `redis-cli`.

**"Cache required vs optional?"**  
Read-through catalog → fail-open. Global rate limit counter in Redis → may need fallback policy or edge limiting.

Hub: [caching](/learning/caching).
