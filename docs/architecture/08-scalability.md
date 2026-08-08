# Scalability

Growth path assumes ~50-500 employees per org on average, so "10,000 organizations" implies
roughly 1-5M total employee records platform-wide at the top end. Each stage below lists what
actually breaks first and the specific change that addresses it — not a generic "add more
servers."

## 10 organizations (~thousands of employees)

- Single Postgres primary, no read replica needed yet.
- Single Redis instance.
- All services on shared Workers deployment + one small Payroll container.
- Bottleneck: none yet. This stage is about correctness (RLS actually isolating tenants,
  event flows actually consistent), not throughput.

## 100 organizations (~tens of thousands of employees)

- First real load pattern emerges: **attendance write bursts** (clock-in around shift start
  times) and **payroll month-end batch runs** overlapping across tenants on the same calendar
  day.
- Address: attendance ingestion already decoupled via Queue (see
  [07-infrastructure-devops.md](07-infrastructure-devops.md)) — this is where that decision
  starts paying for itself. Add a Postgres **read replica** for Reporting/Analytics so
  dashboard queries stop competing with transactional writes.
- Redis: introduce cache-aside for leave balances and tenant settings (both read constantly,
  written rarely) to cut repeat-query load on Postgres.

## 1,000 organizations (~hundreds of thousands of employees)

- `attendance_records` and `audit_logs` are now large enough that unpartitioned tables would
  have unacceptable index bloat — monthly range partitioning (already in the schema, see
  [04-database-design.md](04-database-design.md)) keeps queries fast; old partitions
  (12+ months) move to cheaper storage or are archived to R2 as compressed exports.
- **Payroll** graduates from "one dedicated container" to a **worker pool** consuming a queue
  of per-tenant payroll-run jobs, scaled horizontally — payroll runs are naturally
  parallelizable per tenant since each tenant's run is independent.
- Connection pooling becomes the real constraint: with this many concurrent tenants, direct
  Postgres connections from every service instance would exhaust `max_connections`. Hyperdrive
  (already in place for Workers) plus PgBouncer in front of the Payroll/Reporting containers
  keeps connection count flat regardless of instance count.
- Start moving the largest 1-2% of tenants (by data volume or contractual requirement) to the
  **isolated tier** (dedicated schema/DB) described in [03-multi-tenancy.md](03-multi-tenancy.md)
  — not because the pooled model is failing, but because a handful of large tenants'
  maintenance windows (bulk imports, big reports) start being visible to their neighbors on a
  shared pool.

## 10,000 organizations (~1-5M employees)

- **Database sharding** by tenant becomes necessary — the pooled single-primary model has a
  ceiling regardless of replica count once write volume (attendance + payroll + audit combined)
  exceeds one primary's capacity. Shard by `tenant_id` hash across N Postgres clusters; the
  Gateway/connection layer already resolves `tenant_id` per request, so routing to the correct
  shard is a lookup addition, not an architectural rewrite.
- **Event bus** graduates from Cloudflare Queues to a dedicated streaming platform
  (Kafka/Redpanda) if consumer fan-out (Notification, Audit, Payroll, Reporting all consuming
  the same event stream) outgrows Queues' throughput/retention guarantees.
- **Search**: employee/candidate search across a tenant's full history moves from Postgres
  full-text to a dedicated search index (Typesense/Meilisearch/OpenSearch) fed by the same
  event stream, since cross-field fuzzy search at this row count degrades in Postgres well
  before this point.
- **CDN**: static assets and R2-served documents (payslips, resumes) are already behind
  Cloudflare's CDN by default at this stage — no change needed, just confirms the earlier
  choice of R2 over S3 was right for egress cost at this volume.
- **Worker/container scaling**: Workers scale automatically with no action needed; dedicated
  containers (Payroll, Reporting) are on autoscaling groups keyed to queue depth, not CPU —
  queue depth is the leading indicator of "falling behind," CPU is lagging.

## Summary: what scales itself vs. what needs a deliberate change

| Layer | Scales automatically | Needs a deliberate change, and when |
|---|---|---|
| Workers (Gateway, CRUD services) | Yes | — |
| R2/CDN | Yes | — |
| Postgres primary | No | Read replicas at ~100 orgs, partitioning at ~1,000, sharding at ~10,000 |
| Redis | Mostly (managed clustering) | Cluster mode once single-node memory/throughput is exceeded |
| Cloudflare Queues | Yes, to a point | Dedicated streaming platform if fan-out/retention needs exceed Queues at ~10,000-org scale |
| Payroll/Reporting compute | No | Container pool sized to queue depth from ~1,000 orgs onward |
| Search | N/A until needed | Dedicated search index once full-text on Postgres degrades, ~10,000-org scale |
