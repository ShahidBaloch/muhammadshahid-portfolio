---
title: "Azure Blob Storage with ASP.NET Core File Uploads"
description: "Practical ASP.NET Core patterns for uploading files to Azure Blob Storage — validation, private containers, SAS, metadata, and Angular-friendly APIs."
date: "2026-06-20"
category: "architecture"
tags: ["Azure", "Blob Storage", "ASP.NET Core", "Files"]
---

File uploads look simple until they meet production constraints: large payloads, private documents, virus scanning expectations, mobile networks, and Angular apps that need progress feedback. Azure Blob Storage is a solid default for ASP.NET Core products, but the API design around the blob matters as much as the SDK calls.

This is the checklist I use when adding uploads to .NET backends that serve Angular clients — especially documents and images in SaaS and healthcare-style portals where “public container + direct URL” is the wrong default.

## Choose the upload path on purpose

There are three common patterns:

1. **Browser → ASP.NET Core → Blob** — simplest security model; API validates and streams
2. **Browser → Blob via SAS** — API mints a short-lived write URL; browser uploads directly
3. **Browser → API for small files, SAS for large files** — hybrid used by many real products

Use (1) when files are modest, you need server-side inspection before persistence, or compliance wants every byte to touch your API first. Use (2) when payloads are large and you want to keep web app CPU and memory off the hot path. Use (3) when product reality is mixed.

Do not start with SAS because it feels “more cloud native.” Start with the threat model and file size profile.

## Containers, access tiers, and naming

Prefer private containers. Serve reads through:

- Your API streaming the blob after authorization, or
- Short-lived read SAS URLs minted only after the user passes the same authorization checks as your download endpoint

Public containers are for genuinely public assets, not “we will hide the URL.” URLs leak through logs, referrers, screenshots, and support tickets.

Blob names should be opaque and unique (`{tenantId}/{documentId}/{guid}{ext}` or similar), never raw user filenames as the sole key. Store the original filename, content type, size, uploader, and created time in your database. The database row is the product object; the blob is the payload.

Set content type explicitly when uploading. Do not trust that every client sends a perfect `Content-Type`. Derive a safe type from allow-listed extensions and server-side checks.

## Validation before money and storage

Validate early:

- Authenticated user and tenant scope
- Feature permission (who may upload this document type)
- Extension allow-list
- Maximum size
- Maximum count per parent resource when relevant
- Content type allow-list

For images, consider dimension limits. For documents, consider rejecting encrypted or macro-heavy formats if your product cannot handle them.

Never accept unlimited multipart bodies. Configure request size limits in Kestrel/IIS/App Service and in the endpoint. Angular progress bars do not help if the server hard-fails at the gateway with an opaque 413 and no correlation id.

Stream to blob storage when you can. Loading large files into `byte[]` on the server works in demos and hurts under concurrency.

## ASP.NET Core API shape that Angular can use

For API-mediated uploads, a clear multipart endpoint beats clever custom protocols. Return a stable DTO:

- Document id
- Original file name
- Size
- Content type
- Created timestamp
- Optional preview metadata

The Angular app should not need to know container names or blob URIs for private files.

For SAS direct upload, split the flow:

1. Angular asks API to start an upload (filename, size, content type, parent resource)
2. API validates quotas and permissions, creates a pending DB row, returns write SAS + blob path + upload id
3. Angular uploads to Azure
4. Angular calls API to complete/confirm
5. API verifies blob exists, size matches expectations, marks the row active, and enqueues post-processing

Without the confirm step, you accumulate orphaned blobs and pending rows from abandoned uploads.

## Security details people skip

- Scope SAS to the single blob, not the container, whenever possible
- Keep write SAS lifetimes measured in minutes, not hours
- Use HTTPS only
- Store connection strings and account keys in Key Vault or managed identity — prefer managed identity to the storage account from App Service
- Authorize downloads the same way you authorize metadata reads
- Do not put long-lived SAS tokens in your database as the permanent access plan

If documents are sensitive, consider encryption settings and retention policies with the client early. Soft-delete on the storage account has saved me from accidental wipe mistakes more than once.

Also separate malware scanning policy from upload success. Either block until scanned (stricter UX) or accept as pending and hide content until clean (common compromise). Whatever you choose, make the state visible in the API and UI (`PendingScan`, `Available`, `Rejected`).

## Metadata and lifecycle

Product features almost always need more than a file binary:

- Who uploaded it
- Which entity it belongs to
- Version or replace semantics
- Soft delete vs hard delete
- Retention / export requirements

When replacing a document, decide whether old blobs are deleted immediately, versioned, or retained for audit. Healthcare and financial clients often need retention language in writing before you “just overwrite.”

Use lifecycle management rules for incomplete multipart uploads and temp prefixes. Temporary upload areas without a janitor become a silent cost center.

## Angular UX that feels finished

Users need:

- File picker constraints that match server allow-lists
- Client-side size checks before the network trip
- Upload progress for larger files
- Cancel where feasible
- Clear error messages for type/size rejection
- Disabled double-submit on the confirm action

For images, show a local preview from the selected file while upload runs. For private documents, do not bind `<img src>` to a permanent private URI. Fetch via authorized API or temporary read SAS.

Retry carefully. A retry after a successful blob write but failed confirm should call an idempotent complete endpoint, not create a second document row.

## Failure modes and operations

Plan for:

- Storage outage during upload
- Confirm called when blob is missing
- Partial network drop on mobile
- Redeploys mid-upload
- Cost alerts when a client script loops uploads

Log account, container, blob name hash or document id, duration, and outcome. Do not log full SAS URLs.

Backup and disaster recovery conversations should include whether blob data is in the same recovery plan as SQL. Files orphaned from metadata — or metadata without files — are both production incidents.

## A pragmatic rollout order

1. Private container + managed identity
2. DB metadata model + authorize checks
3. Small-file API upload path with streaming
4. Angular form integration and error mapping
5. SAS path only if size/performance demand it
6. Scanning, lifecycle rules, and retention last-mile

That order keeps early demos honest without painting you into a public-container corner.

If you need Azure Blob uploads implemented cleanly in an ASP.NET Core API with an Angular client — private containers, validation, and deployable configuration — [get in touch](/contact).
