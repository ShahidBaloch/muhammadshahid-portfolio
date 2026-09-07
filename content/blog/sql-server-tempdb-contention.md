---
title: "SQL Server TempDB Contention on .NET APIs"
description: "PAGELATCH_UP on database id 2 is TempDB allocation contention. Multiple equal data files fix it. EF does not need a #temp table to cause this."
date: "2026-09-07"
category: "ef-core"
tags: ["SQL Server", "Performance", "Diagnostics", "EF Core"]
related:
  - sql-server-deadlocks-snapshot-isolation
  - ef-core-sql-server-parameter-sniffing
  - ef-core-sql-performance
faq:
  - q: "What wait type means TempDB contention?"
    a: "PAGELATCH_UP or PAGELATCH_EX on database id 2. CPU can look idle while the API hangs. That is threads queued on PFS/SGAM pages, not a slow LINQ compile."
  - q: "How many TempDB files should I add?"
    a: "Start with one equal-sized file per logical CPU, cap at eight, then measure. Unequal sizes recreate the hotspot on the largest file."
  - q: "Can EF Core cause TempDB contention without #temp tables?"
    a: "Yes. Large sorts and hashes spill. RCSI versions rows in TempDB. Table variables and spills from ungovered ORDER BY on a hub clinic are enough."
---

![Many workers colliding on one TempDB PFS page versus allocations spread across eight equal files](/images/blog/sql-server-tempdb.png)

The API spiked to seconds of latency. CPU on SQL Server was quiet. Memory was fine. Wait stats showed **`PAGELATCH_UP`** on **database id 2**. That id is always **TempDB**. Threads were queuing to update the same PFS/SGAM allocation page.

This is not [parameter sniffing](/blog/ef-core-sql-server-parameter-sniffing) (wrong plan, high CPU or reads). It is not a missing index you fix in EF. It is a **file layout** problem that a busy ASP.NET Core app will trigger with sorts, spills, and [RCSI versioning](/blog/sql-server-deadlocks-snapshot-isolation).

## Why a .NET API hits this without #temp

EF does not have to write `CREATE TABLE #t`. SQL Server uses TempDB for:

- Sorts and hash joins when the plan cannot use an index (the [performance](/blog/ef-core-sql-performance) unbounded `OrderBy` on a hub clinic)
- Row versions after you enable RCSI to stop deadlocks
- Table variables and some spills from TVPs

Thousands of concurrent clinic requests allocate at once. One TempDB data file means one set of PFS/SGAM pages. Latch waits, API hangs, Angular timeouts.

## Fix: multiple equal files

Split TempDB so allocations round-robin:

1. **Count:** one file per logical CPU, **stop at eight**, add more only if latch waits remain.
2. **Size:** every file the **same** size and the **same** autogrowth. A larger file becomes the new hotspot.
3. **Growth:** fixed MB, not 10%. Tiny growth under load is another latch storm.
4. **Old instances:** SQL Server 2016+ already behaves like trace flags 1117/1118. Do not chase those flags on 2019+ as the first step.

I do this on the VM or in the SQL configuration, not in `OnModelCreating`. Azure SQL and some managed offerings hide TempDB; if you cannot add files, you reduce spills (indexes, tighter date windows) and watch whether RCSI is worth the version-store traffic.

## What I measure after

- `PAGELATCH_UP` on tempdb should collapse
- Version store size if RCSI is on — a fee import that versions every row will still pressure TempDB even with eight files if the disk is slow
- I do not “fix TempDB” by adding `AsNoTracking` in C#. That does not create extra files.

If PAGELATCH_UP on database id 2 showed up after you turned on snapshot isolation, [contact me](/contact). File count, file size equality, and whether RCSI is new are the three facts I want.
