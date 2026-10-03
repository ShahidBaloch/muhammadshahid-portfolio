---
title: "AKS vs Azure App Service for ASP.NET Core APIs"
description: "Choose AKS or Azure App Service for a .NET API. Compares operations, deployment slots, and networking, without invented prices or a kubectl guide."
date: "2026-10-03"
category: "architecture"
tags: ["AKS", "Azure App Service", "ASP.NET Core", "Kubernetes", "Azure"]
related:
  - azure-app-service-aspnet-core
  - github-actions-cicd-aspnet-core-angular
  - modular-monolith-vs-microservices-dotnet
  - aspnet-core-health-checks
faq:
  - q: "Should an ASP.NET Core API run on AKS or App Service?"
    a: "Use App Service when you have a handful of APIs, want slots and patches with less cluster work, and the team is application developers. Use AKS when you run many services, need custom networking or sidecars, and someone owns the cluster every week, not once a year."
  - q: "Is AKS cheaper because it is more efficient?"
    a: "Not by default. You pay for nodes that sit there, plus the time to upgrade them. App Service plans waste money when oversized and idle too. Compare your real SKUs and headcount. This page does not invent a winner on price."
  - q: "Can I move an ASP.NET Core API from App Service to AKS later?"
    a: "Yes if it is already a container that reads configuration from the environment and signs in with managed identity. Deployment slots and Easy Auth do not move with the image."
---

**AKS versus Azure App Service for ASP.NET Core APIs** is a choice about who runs the platform. App Service runs a web app you publish. AKS runs a Kubernetes cluster you patch, on which your API is one set of pods. The C# can be identical. The on-call rotation will not be.

```text
App Service                         AKS
  plan / SKU                          node pool
  app + slot                          deployment + ingress
  platform TLS, patching              you: ingress, certs, upgrades
  scale out instances                 HPA + node scale
  one team can own it                 needs a platform owner
```

Metaphor: App Service is a serviced office. You bring desks (the app) and they keep the elevators. AKS is a floor you leased as concrete. You can build any layout, and you also own the elevators. A single API does not need a custom elevator.


**New to this** stay here for the decision. **If App Service wins**, follow [App Service for ASP.NET Core](/blog/azure-app-service-aspnet-core). **CI that pushes either target** see [GitHub Actions](/blog/github-actions-cicd-aspnet-core-angular). **Whether you should have many services at all** see [modular monolith vs microservices](/blog/modular-monolith-vs-microservices-dotnet). **Probes both platforms need** see [health checks](/blog/aspnet-core-health-checks).

You want a rule for an API you are about to deploy, not a kubectl tutorial and not a pricing spreadsheet with made-up dollars.

## AKS vs Azure App Service for a .NET API

Pick App Service when you want slots and a managed web host. Pick AKS when you already run Kubernetes and will staff it. Either way, the app is still ASP.NET Core. It still reads configuration from the environment, still exposes health endpoints, still uses managed identity if you are on Azure. Containers are optional on App Service (you can publish a runtime app) and usual on AKS. Do not let "we dockerized it" decide the platform. Both can run a container image. The question is the control plane around the image.

Health: App Service uses health check path configuration to pull a bad instance out of rotation. AKS uses readiness and liveness probes. Implement one honest ready endpoint and map it to both. A probe that always returns 200 is how both platforms route traffic to a dead database pool. Details of the endpoint are the health-check post.

Configuration: App Service application settings versus Kubernetes secrets and config maps. Secrets belong in Key Vault either way, with the app's identity reading them. AKS does not make a secret safer because it lives in etcd. Treat cluster access as production access.

## What an API team actually changes

The C# host can be the same image on either platform. The reviewable difference is the platform file: a small Bicep resource for App Service, or a Deployment plus Service for AKS. Both call `GET /health/ready`. The choose-sections below are how you decide which file you are willing to own.

Shared `Program.cs`. Liveness does not touch SQL. Readiness does. That split is what keeps a database blip from restarting every pod, which is the failure mode described later.

```csharp
builder.Services.AddHealthChecks()
    .AddDbContextCheck<ClinicDbContext>("sql", tags: ["ready"]);

var app = builder.Build();

app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = _ => false
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready")
});
```

`AddDbContextCheck<T>` is `Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore`. It ships with current ASP.NET Core shared framework. If the extension does not resolve on the target framework you build, confirm that package name for the TFM before you add a different SQL probe.

The container listens on 8080. Put that in the image so you do not fork `Program.cs` per host. In the Dockerfile:

The image contract is three lines in the Dockerfile: `FROM mcr.microsoft.com/dotnet/aspnet:8.0`, then `ENV ASPNETCORE_URLS=http://+:8080`, then `EXPOSE 8080`.

If you are on a newer runtime image, change the tag and confirm App Service accepts it. The port contract stays. Verify the tag rather than assuming `8.0` is still the one you deploy.

App Service, Linux, custom container. `linuxFxVersion` uses the `DOCKER|<image>` form. This snippet does not grant `AcrPull` to the site identity. Without that role, or an equivalent registry credential, the pull fails and the health path never runs. If `2024-04-01` is rejected, use the `Microsoft.Web` API version your subscription already deploys.

```bicep
param location string = resourceGroup().location
param image string = 'contoso.azurecr.io/clinic-api:1.4.2'

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'clinic-plan'
  location: location
  sku: {
    name: 'P1v3'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource api 'Microsoft.Web/sites@2024-04-01' = {
  name: 'clinic-api'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'DOCKER|${image}'
      healthCheckPath: '/health/ready'
      alwaysOn: true
      appSettings: [
        {
          name: 'WEBSITES_PORT'
          value: '8080'
        }
      ]
    }
  }
}
```

The same path from the CLI, when you are not applying Bicep. `--generic-configurations` is where `healthCheckPath` is set. If your CLI build rejects the JSON, read `az webapp config set -h` before you invent another flag.

```powershell
az webapp config set `
  --resource-group clinic-rg `
  --name clinic-api `
  --generic-configurations '{"healthCheckPath": "/health/ready"}'
```

AKS. The CPU and memory figures are placeholders so the manifest is valid. Replace them with a measured working set. This page still does not claim they are the right size for your API. The startup probe is the piece .NET teams forget: readiness alone restarts a process that is still booting. Thirty failures at two seconds is a 60-second window to edit after you time a cold start, not a recommended delay.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: clinic-api
  namespace: clinic
spec:
  replicas: 2
  selector:
    matchLabels:
      app: clinic-api
  template:
    metadata:
      labels:
        app: clinic-api
    spec:
      containers:
        - name: api
          image: contoso.azurecr.io/clinic-api:1.4.2
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 8080
            periodSeconds: 10
          startupProbe:
            httpGet:
              path: /health/ready
              port: 8080
            periodSeconds: 2
            failureThreshold: 30
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              memory: "512Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: clinic-api
  namespace: clinic
spec:
  selector:
    app: clinic-api
  ports:
    - name: http
      port: 80
      targetPort: 8080
```

There is no Ingress here on purpose. Ingress, TLS, and the certificate controller are the platform work the staffing test asks you to name. A Service only shows the pod is reachable inside the cluster.

## Choose App Service when

- You are deploying one API, or a few APIs that do not need to share a process namespace, a service mesh, or a custom scheduler.
- The team is the same people who write the API. There is no platform group, and you do not want to become one during an incident.
- Deployment slots matter to you: warm the new build, swap, swap back. Slots are the feature teams miss most when they leave for AKS without replacing them (blue-green in Kubernetes is possible and is now your job).
- Patches of the OS and the .NET runtime host are something you would rather buy than schedule. You still own your package upgrades. You do not own node image CVE night.
- Autoscale is "add instances of this app when CPU or HTTP queue is high", not "design a node pool, a max surge, and a pod disruption budget".
- The network need is "VNet integration outbound, maybe a private endpoint on SQL", which App Service does. That path is the private endpoint post if you need it. It does not require Kubernetes.

App Service is the wrong place if you need many sidecars, host network tricks, DaemonSets, or a workload that is not HTTP and not a WebJob you would be proud of. A long-running background worker can be a second App Service, a Container App, or a Function. Do not stand up AKS only to host one `BackgroundService`.

## Choose AKS when

- You already have many deployable services, or you are honestly on the microservices side of the architecture decision, and they need a shared cluster: one ingress, one policy for network, one way to roll out.
- You need capabilities App Service will not grow: service mesh, custom admission policy, mixed Windows and Linux node pools, GPU pools, tight egress control through an appliance you already operate.
- Someone named owns upgrades. AKS still needs a monthly habit: node image updates, Kubernetes version, ingress chart, cert manager. "We'll learn it when it breaks" is how you learn it on a Friday.
- Scale is not uniform. One API spikes, another must stay pinned, and you want that expressed as pod requests and a scaler, not as five App Service plans that you resize by hand.

AKS is the wrong place for a single customer-facing API from a team of four who have never run a cluster. The resume value is not worth the first certificate outage. I have no metric to offer for "worth". I have the staffing test below, which is the real gate.

> **Watch:** AKS for one API and a team that has never run a cluster fails on certificates and upgrades, not on C#. If nobody owns the next upgrade, you wanted App Service.

## A third option, briefly

Azure Container Apps sits between them: you bring a container, the platform runs a scale rule, and you do not operate nodes. If the "AKS" column in your notes is really "I want containers and a replica count", look at Container Apps before you accept a cluster. This page will not become a three-way buyer's guide. If Container Apps fits, you are done deciding and you should stop reading cluster blogs.

> **Watch:** Treating "we might need Kubernetes later" as a reason to start a cluster is how a small team inherits nodes. If you only want a container and a replica count, Container Apps is the decision and this comparison is over.

Functions are for event and short HTTP work, not for a large OpenAPI surface you already run in Kestrel. The Functions posts cover that hosting model.

## Operations you will feel in month two

| Work | App Service | AKS |
|---|---|---|
| Ship a new build | Deploy slot, swap | Roll the deployment, watch probes |
| Roll back | Swap back | Roll back the deployment / image |
| TLS cert | Platform or Key Vault binding | Ingress plus cert manager, your alert |
| Scale | Plan autoscale rules | HPA and cluster autoscaler |
| Drain one bad node | Not your node | You cordon and drain |
| See logs | App Service logs / Log Analytics | Container logs, you wired the agent |
| Identity | System or user assigned | Workload identity, annotated account |
| Preview env | A slot or a second app | A namespace, if you built that |

CI is GitHub Actions or Azure DevOps in both cases. The pipeline post shows a sensible ASP.NET Core workflow. The AKS difference is: build an image, push to a registry, then a deploy step that is not `azure/webapps-deploy`. Keep tests in the workflow before either deploy. AKS does not make a skipped `dotnet test` safer.

Cost, qualitatively: an App Service plan has a floor per instance you reserve. An AKS cluster has a floor per node, and the system pods eat some of each node before your API does. A quiet API on a three-node cluster is you paying for the cluster's hobbies. A busy set of APIs on one oversized App Service plan is you paying for a neighbor's CPU. Model it with the Azure pricing page and your own replica counts. Do not trust a blog that says one is "always 40 percent cheaper". That number would be fiction here.

## Failure modes

App Service fails as: the plan is out of instances, a slot swap pointed at the wrong settings, VNet integration was not applied to the slot, or a platform incident in one region. Your mitigation is a second region only if you actually built it. Most teams have not, on either platform.

AKS fails as: a bad node pool upgrade, an ingress misroute, a probe that restarts a slow-starting .NET app before it is ready (`initialDelaySeconds` / startup probe too tight for JIT and cold OpenTelemetry), or a `ClusterIP` service name typo. The API code is innocent and the users still see 502.

.NET on Kubernetes needs a startup probe that allows the process to boot, and resource requests that match a real dump of working set. A request of 64 MiB for an ASP.NET Core app is how the kubelet kills it. Measure. Do not copy a tutorial's numbers. This page refuses to print a fake "correct" memory request.

> **Watch:** Copying the manifest numbers, or a 64 MiB request from another post, gets the kubelet to kill a healthy ASP.NET Core process. Those figures are placeholders until you measure a working set.

## The staffing test

Write the names, not the job titles.

1. Who gets paged when nodes are `NotReady`? If the answer is "the API developer who has a product deadline", choose App Service.
2. Who approves a Kubernetes upgrade in the next 90 days? If nobody, choose App Service.
3. Do you need a capability from the AKS list above within six months, with a named project? If yes, plan AKS or Container Apps with a person attached. If the capability is "we might need it someday", that is App Service.
4. How many services in production eighteen months from now, honestly? One to five HTTP APIs is not a cluster strategy. It is a plan strategy.

If you already run AKS well for other products, putting the next API there can be right because the platform cost is paid. "We already have a cluster" is the one good reason a small API belongs on AKS. "We should start a cluster" is not.

## Pitfalls

- **Moving to AKS to escape a messy App Service config.** You will recreate the mess as Helm values. Clean the configuration first. The App Service article is the cleanup if you stay.
- **One cluster per environment per team with no standard.** Cost and drift explode. That is an argument for fewer clusters or for not having one, not for a blog-sized Helm chart.
- **Ignoring slots and then hand-editing production** because rollback on AKS felt abstract until you needed it.
- **Health checks that hit the database so hard** that a blip restarts every pod or drains every instance. Readiness should mean "can serve", and it should fail fast, not start a chain reaction. The health-check post is the nuance.
- **Choosing on price from a single calculator screenshot** taken at the wrong region and the wrong SKU.

## Verification

You decided correctly if, on paper before you migrate:

- The deploy and rollback steps fit on one page and someone other than the author performed them in a non-prod subscription.
- A failed health endpoint removes the instance or pod from traffic, and you watched that happen.
- Secrets are not in the pipeline log.
- The paging name in the staffing test agreed they own the platform half.

You decided badly if the first production incident's action item is "learn Kubernetes" or, the other direction, "rebuild on AKS" while the actual bug was a bad SQL query. The platform will not fix the query. [SQL performance](/blog/ef-core-sql-performance) is still your problem on both.

**Related:** [App Service](/blog/azure-app-service-aspnet-core) | [GitHub Actions](/blog/github-actions-cicd-aspnet-core-angular) | [Modular monolith vs microservices](/blog/modular-monolith-vs-microservices-dotnet) | [Health checks](/blog/aspnet-core-health-checks)
