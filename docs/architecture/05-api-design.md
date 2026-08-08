# API Design

REST over the API Gateway. Every service implements the same conventions so the frontend's
`@hrm/api-client` can treat all of them uniformly.

## Versioning

- URL-path versioning: `/api/v1/...`. Simple, cache-friendly, visible in logs/traces — header-
  based versioning saves nothing here and complicates debugging.
- A version is supported for a minimum of 12 months after the next version ships; breaking
  changes always ship as a new version, never a mutation of an existing one.

## Resource conventions

```
GET    /api/v1/employees              list (paginated, filterable, sortable)
POST   /api/v1/employees              create
GET    /api/v1/employees/:id          fetch one
PATCH  /api/v1/employees/:id          partial update
DELETE /api/v1/employees/:id          soft delete
POST   /api/v1/leave-requests/:id/approve   action endpoint for state transitions
```

State-transition actions (`approve`, `reject`, `cancel`, `run` for payroll) are modeled as
`POST /resource/:id/action`, not as generic `PATCH` with a status field — this makes the
permission required for each transition explicit and auditable per-endpoint rather than
buried in field-level logic.

## Request/response envelope

```json
// Success
{
  "data": { "...": "..." },
  "meta": { "requestId": "...", "timestamp": "..." }
}

// List
{
  "data": [ { "...": "..." } ],
  "meta": {
    "requestId": "...",
    "pagination": { "page": 1, "pageSize": 25, "totalItems": 340, "totalPages": 14 }
  }
}

// Error
{
  "error": {
    "code": "LEAVE_BALANCE_INSUFFICIENT",
    "message": "Employee does not have enough leave balance for this request.",
    "details": { "available": 2, "requested": 4 },
    "requestId": "..."
  }
}
```

Every response — success or error — carries the same `requestId`, propagated from the Gateway
through every downstream service call and into logs, so a support ticket referencing one ID
traces the full request across services.

## Errors

- HTTP status communicates the error *class* (400 validation, 401/403 auth, 404 not found,
  409 conflict, 422 business-rule violation, 429 rate limit, 5xx server); the `error.code`
  communicates the specific *reason*, and is a stable machine-readable string the frontend
  can switch on for localized messaging — never parse `error.message` for logic.
- Validation errors (Zod, from `@hrm/types`) map to `400` with `details` as a field→message
  map, generated identically on frontend and backend since both validate against the same
  schema.

## Pagination, filtering, sorting

- Cursor-based pagination for high-volume/append-heavy resources (`attendance_records`,
  `audit_logs`, `notifications`) — offset pagination degrades badly past a few thousand rows
  and these tables grow unbounded.
- Offset/page pagination (`?page=1&pageSize=25`) for bounded resources (`employees`,
  `departments`, `job_openings`) where "page 14 of 20" navigation is actually useful to a user.
- Filtering: `?department_id=...&status=active` — allow-listed per endpoint, never arbitrary
  column filtering, to keep query plans predictable and avoid leaking schema internals.
- Sorting: `?sort=-created_at,last_name` (`-` prefix = descending), allow-listed per endpoint.

## Idempotency

State-changing POSTs that trigger side effects with real cost (payroll run, notification
dispatch) accept an `Idempotency-Key` header; the server persists the key→response mapping for
24h so retried requests (network blips, double-clicks) don't double-process.

## Documentation

OpenAPI 3.1 specs generated directly from the Zod schemas in `@hrm/types` (via
`zod-to-openapi`) rather than hand-written — the spec can't drift from the actual validation
logic because they're the same source. Served at `/api/v1/openapi.json` per service and
aggregated at the Gateway into one browsable spec (Scalar/Redoc UI) for internal and partner
API consumers.

## Rate limiting

Enforced at the Gateway (see [06-security.md](06-security.md)) with response headers
`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` on every response so clients
can back off proactively rather than discovering the limit via 429s.
