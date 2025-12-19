# Database Schema Patterns for Activity/Event Tracking

## 1. Architectural Paradigms

### Event Sourcing vs Traditional CRUD

**Event Sourcing** captures full history as immutable append-only log; every action creates new event. State reconstructed by replaying events. Retains temporal queries ("state at time T?") and complete audit trail.

**CRUD** stores only current state snapshot. Fast for present-focused queries, loses historical context unless explicit audit logging added separately.

**2025 Industry Consensus**: Hybrid approach optimal—event sourcing for mission-critical domains (transactions, order processing), CRUD for supporting services (preferences, settings).

Source: [Java Code Geeks - Event Sourcing vs CRUD](https://www.javacodegeeks.com/2025/12/event-sourcing-vs-crud-rethinking-data-persistence-in-enterprise-systems.html), [AWS Prescriptive Guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/event-sourcing.html)

---

## 2. Core Event Logging Schema Patterns

### Generic Audit Log (Flexible, Recommended)
Supports logging any table via minimal schema:

```sql
CREATE TABLE event_log (
  id INTEGER PRIMARY KEY,
  event_time DATETIME NOT NULL,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,           -- 'CREATE', 'UPDATE', 'DELETE'
  table_name TEXT NOT NULL,
  row_id INTEGER NOT NULL,
  session_id TEXT,
  client_ip TEXT,
  old_values TEXT,                -- JSON blob
  new_values TEXT,                -- JSON blob
  status TEXT,                    -- 'success', 'failed'
  rows_affected INTEGER
);

CREATE INDEX idx_event_log_user_time ON event_log(user_id, event_time DESC);
CREATE INDEX idx_event_log_table_time ON event_log(table_name, event_time DESC);
```

**Advantage**: Single schema logs all tables. **Tradeoff**: Stores all changes as wide VARCHAR; less normalized.

### Normalized Event Schema
User activity focused:

```sql
CREATE TABLE activities (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  activity_type TEXT NOT NULL,    -- 'login', 'create_pr', 'review'
  created_at DATETIME NOT NULL,
  ip_address TEXT,
  description TEXT,
  metadata TEXT                   -- JSON for context
);

CREATE INDEX idx_activities_user_time ON activities(user_id, created_at DESC);
CREATE INDEX idx_activities_type_time ON activities(activity_type, created_at DESC);
```

Source: [Vertabelo - Database Design for Audit Logging](https://vertabelo.com/blog/database-design-for-audit-logging/), [UserFrosting - Activity Logging](https://learn.userfrosting.com/users/activity-logging)

---

## 3. SQLite/D1 Time-Series Optimization

### Recommended Schema Pattern

```sql
CREATE TABLE event_data (
  id TEXT PRIMARY KEY,            -- UUIDv7 as TEXT or BLOB
  user_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL,  -- millisecond precision
  data TEXT                       -- JSON blob
);

-- Composite index for range scans & order by
CREATE INDEX idx_events_user_type_ts ON event_data(user_id, event_type, timestamp_ms DESC);

-- Separate tag table if high cardinality
CREATE TABLE event_tags (
  id INTEGER PRIMARY KEY,
  event_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES event_data(id)
);
CREATE INDEX idx_tags_tag ON event_tags(tag, event_id);
```

**D1 Specifics** (Cloudflare SQLite):
- UUIDv7 as BLOB primary keys + INTEGER millisecond timestamps = fastest
- Batch inserts in transactions (10-100x speedup vs per-row commits)
- Avoid unnecessary writes; optimize range queries
- Window functions on large spans expensive—use bucketing/pre-aggregation

Source: [MoldStud - SQLite Time Series Best Practices](https://moldstud.com/articles/p-handling-time-series-data-in-sqlite-best-practices), [DEV Community - High-Performance Time Series on SQLite](https://dev.to/zanzythebar/building-high-performance-time-series-on-sqlite-with-go-uuidv7-sqlc-and-libsql-3ejb)

---

## 4. Aggregation Strategies

### Real-Time vs Materialized

**Option A: Real-Time Aggregation** (compute on read)
```sql
SELECT
  DATE(timestamp_ms/1000) as date,
  COUNT(*) as event_count,
  COUNT(DISTINCT user_id) as unique_users
FROM event_data
WHERE event_type = 'pr_review'
  AND timestamp_ms >= (strftime('%s','now','start of day') * 1000)
GROUP BY date;
```

**Option B: Materialized Aggregates** (compute periodically)
```sql
CREATE TABLE daily_metrics (
  id INTEGER PRIMARY KEY,
  metric_date DATE NOT NULL,
  event_type TEXT NOT NULL,
  event_count INTEGER,
  unique_users INTEGER,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_metrics_date_type ON daily_metrics(metric_date, event_type);
```

Pre-compute via trigger/scheduled job (hourly/daily). Tradeoff: Storage vs query speed.

**2025 Best Practice**: Use continuous aggregates where available (PostgreSQL TimescaleDB); for SQLite, batch compute during off-hours, store in summary tables.

Source: [Datadog - Timeseries Indexing at Scale](https://www.datadoghq.com/blog/engineering/timeseries-indexing-at-scale/), [Azure Monitor - Metrics Aggregation](https://learn.microsoft.com/en-us/azure/azure-monitor/metrics/metrics-aggregation-explained)

---

## 5. Indexing Strategy for User/Time/Type Queries

### PostgreSQL Pattern (if applicable)

```sql
-- Range partition by month (for large datasets)
CREATE TABLE activities_2025_12 PARTITION OF activities
  FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');

-- Indexes on partitions inherit automatically
CREATE INDEX idx_activities_user_time ON activities_2025_12(user_id, created_at DESC);
```

### SQLite/D1 Workaround (No native partitioning)

Simulate via naming convention:
```sql
CREATE TABLE activities_202512 (id, user_id, event_type, created_at, ...);
CREATE TABLE activities_202601 (id, user_id, event_type, created_at, ...);
-- Query only relevant month(s) by selecting appropriate table
```

### Key Indexing Principles

- **Composite Index Ordering** (user_id, event_type, timestamp) enables:
  - Queries filtered by user + type
  - Range scans on timestamp within partition
  - Avoids full table scan for "recent activities"

- **Partial Index** (for frequent queries):
```sql
CREATE INDEX idx_recent_pr_reviews ON activities(user_id, created_at DESC)
WHERE event_type = 'pr_review' AND created_at > datetime('now', '-7 days');
```

- **Avoid Low-Cardinality Indexing**: Don't index boolean/status columns with few distinct values

Source: [PostgreSQL - Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html), [Heap - Partial Indexes](https://www.heap.io/blog/speeding-up-postgresql-queries-with-partial-indexes/)

---

## 6. Schema Evolution & Scalability

### Normalized Metadata Approach

```sql
CREATE TABLE event_types (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,      -- 'pr_opened', 'review_submitted'
  description TEXT
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,            -- UUIDv7
  event_type_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME NOT NULL,
  FOREIGN KEY(event_type_id) REFERENCES event_types(id)
);
```

**Advantage**: Prevents string duplication, clean schema updates.
**Tradeoff**: Extra join overhead (negligible with proper indexing).

### Asynchronous Logging

Log directly to fast queue (Redis/message broker), batch-insert to DB periodically. Prevents blocking application writes with disk I/O.

---

## Summary: Recommended Pattern for PR Review Tracking

**Schema Choice**: Normalized event schema (Option 2.2)
- **Why**: Clean, extensible, no JSON parsing overhead for structured data
- **For PR Reviews**: Separate `review_events` table (created, approved, requested_changes)
- **Indexing**: `(user_id, created_at DESC)` + `(event_type, created_at DESC)`
- **D1 Optimization**: UUIDv7 + batch inserts in transactions
- **Aggregation**: Materialized daily metrics table for dashboards; real-time queries for "recent activity"
- **Partitioning**: SQLite tables by month if dataset grows >10M rows

---

## Unresolved Questions

1. **Volume expectations**: If >1M events/day, should evaluate TimescaleDB (PostgreSQL) instead of D1 for continuous aggregates
2. **Archive strategy**: After what retention period should old event tables be detached/deleted?
3. **Query latency SLA**: Sub-100ms dashboard loads may require Redis caching layer on top of materialized metrics
4. **Privacy**: GDPR compliance—how long retain raw event logs vs anonymized aggregates?
