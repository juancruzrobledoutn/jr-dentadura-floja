# Integrador Production Deployment Runbook

Operational guide for deploying and maintaining Integrador in production.

**Stack**: FastAPI + PostgreSQL + Redis + Nginx (TLS) + Docker Compose
**Capacity**: ~600 concurrent users (2x backend, 2x ws_gateway)

---

## Table of Contents

1. [Pre-deployment Checklist](#1-pre-deployment-checklist)
2. [First-time Deployment](#2-first-time-deployment)
3. [Routine Deployment (Updates)](#3-routine-deployment-updates)
4. [Rollback Procedure](#4-rollback-procedure)
5. [Monitoring Checks](#5-monitoring-checks)
6. [Emergency Procedures](#6-emergency-procedures)
7. [Security Checklist](#7-security-checklist)
8. [Redis Configuration](#8-redis-configuration)
9. [Outbox Sweeper](#9-outbox-sweeper)
10. [Database Connection Pool](#10-database-connection-pool)
11. [AFIP Electronic Invoicing](#11-afip-electronic-invoicing)

---

## 1. Pre-deployment Checklist

Complete every item before proceeding to deployment.

### Infrastructure

- [ ] Server with Docker Engine 24+ and Docker Compose v2 installed
- [ ] Minimum 4 GB RAM, 2 vCPUs (recommended: 8 GB, 4 vCPUs)
- [ ] Ports 80 and 443 open in firewall
- [ ] Domain DNS A record pointing to server's public IP
- [ ] DNS propagation verified: `dig +short yourdomain.com` returns server IP

### Environment Configuration

- [ ] Copy `.env.example` to `.env` in `devOps/`:

```bash
cd devOps
cp .env.example .env
```

- [ ] Edit `.env` and set ALL values (no defaults are safe for production):

```bash
# Generate secrets (run on server)
openssl rand -hex 32   # Use output for JWT_SECRET
openssl rand -hex 32   # Use output for TABLE_TOKEN_SECRET
openssl rand -hex 16   # Use output for POSTGRES_PASSWORD
```

- [ ] Verify these critical values in `.env`:

| Variable | Requirement |
|----------|-------------|
| `POSTGRES_PASSWORD` | Strong, unique password |
| `JWT_SECRET` | At least 32 characters |
| `TABLE_TOKEN_SECRET` | At least 32 characters |
| `DOMAIN` | Your production domain (e.g., `app.myrestaurant.com`) |
| `CERT_EMAIL` | Valid email for Let's Encrypt notifications |
| `ALLOWED_ORIGINS` | `https://yourdomain.com` (with `https://` prefix) |
| `COOKIE_SECURE` | `true` |

### Backup

- [ ] If upgrading an existing deployment, take a backup first:

```bash
cd devOps
./backup/backup.sh
```

---

## 2. First-time Deployment

Run all commands from the project root unless otherwise specified.

### Step 1: Clone and configure

```bash
git clone <repository-url> integrador
cd integrador/devOps
cp .env.example .env
# Edit .env with production values (see Pre-deployment Checklist)
```

### Step 2: Obtain SSL certificates

```bash
export DOMAIN=yourdomain.com
export CERT_EMAIL=admin@yourdomain.com

# Optional: test with staging first (avoids rate limits)
# export STAGING=1

bash ssl/init-letsencrypt.sh
```

The script will:
1. Generate a temporary self-signed certificate
2. Start nginx
3. Request a real Let's Encrypt certificate
4. Reload nginx with the production certificate

### Step 3: Start all services

```bash
cd devOps
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Step 4: Apply database migrations

```bash
docker compose exec backend alembic upgrade head
```

### Step 5: Load seed data

```bash
docker compose exec backend python cli.py db-seed
```

This creates: default tenant, test users, allergens, sample menu, and tables.

### Step 6: Verify deployment

```bash
# Check all containers are running
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Test health endpoints
curl -s https://yourdomain.com/health | jq .
curl -s https://yourdomain.com/api/health | jq .

# Test HTTP -> HTTPS redirect
curl -sI http://yourdomain.com/ | head -3
# Expected: HTTP/1.1 301 Moved Permanently

# Test SSL certificate
echo | openssl s_client -connect yourdomain.com:443 -servername yourdomain.com 2>/dev/null | openssl x509 -noout -dates
```

### Step 7: Configure automated backups

```bash
# Add to server crontab
crontab -e

# Daily backup at 3:00 AM
0 3 * * * cd /path/to/integrador/devOps && ./backup/backup.sh >> /var/log/integrador-backup.log 2>&1
```

See `devOps/backup/backup-cron.example` for more options.

---

## 3. Routine Deployment (Updates)

Use this procedure for deploying new code changes.

### Step 1: Pull latest code

```bash
cd /path/to/integrador
git fetch origin
git log --oneline HEAD..origin/main   # Review incoming changes
git pull origin main
```

### Step 2: Take a backup (if database migrations are included)

```bash
cd devOps
./backup/backup.sh
```

### Step 3: Rebuild images

```bash
cd devOps
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
```

### Step 4: Apply migrations (if any)

```bash
# Check for pending migrations
docker compose exec backend alembic history --verbose | head -20
docker compose exec backend alembic current

# Apply migrations
docker compose exec backend alembic upgrade head
```

#### Migrations with known exclusive lock

Some migrations take an ACCESS EXCLUSIVE lock that blocks writes on hot tables.
Plan a maintenance window or apply the 3-step playbook (NULL → backfill → SET NOT NULL):

| Revision | Table       | Notes                                                 |
| -------- | ----------- | ----------------------------------------------------- |
| 013      | round_item  | Adds 4 NOT NULL columns with server defaults. See header in `backend/alembic/versions/013_add_void_fields_to_round_item.py` for the 3-step playbook. |

### Step 5: Rolling restart

```bash
cd devOps
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Docker Compose will restart only containers whose images changed.

### Step 6: Verify

```bash
# Check all services are healthy
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Tail logs for errors
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=50 backend backend-2 ws_gateway ws_gateway_2

# Test endpoints
curl -s https://yourdomain.com/api/health | jq .
```

---

## 4. Rollback Procedure

### Code rollback (no migration changes)

```bash
cd /path/to/integrador
git log --oneline -10                  # Find the previous good commit
git checkout <previous-commit-hash>

cd devOps
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Code + migration rollback

```bash
# 1. Rollback migration (one step back)
cd devOps
docker compose exec backend alembic downgrade -1

# 2. Rollback code
cd /path/to/integrador
git checkout <previous-commit-hash>

# 3. Rebuild and restart
cd devOps
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Full rollback from backup

If the situation is critical, restore from the last backup:

```bash
cd devOps
./backup/restore.sh backups/<latest-backup-file>.tar.gz
```

The restore script is interactive and will prompt for confirmation. It restores both PostgreSQL and Redis data.

---

## 5. Monitoring Checks

### Health endpoints

| Endpoint | Expected | What it checks |
|----------|----------|----------------|
| `GET /health` | `200 {"status":"healthy","service":"nginx"}` | Nginx is running |
| `GET /api/health` | `200` | Backend is responding |
| `GET /api/health/detailed` | `200` with dependency status | Backend + PostgreSQL + Redis |
| `GET /ws/health` | `200` | WebSocket gateway is responding |

```bash
# Quick health check (all endpoints)
curl -s https://yourdomain.com/health | jq .
curl -s https://yourdomain.com/api/health | jq .
curl -s https://yourdomain.com/api/health/detailed | jq .
```

### Expected response times

| Endpoint | Normal | Degraded | Critical |
|----------|--------|----------|----------|
| `/health` | < 5ms | < 50ms | > 100ms |
| `/api/health` | < 50ms | < 200ms | > 500ms |
| `/api/health/detailed` | < 100ms | < 500ms | > 1s |
| REST API (typical) | < 200ms | < 1s | > 2s |
| WebSocket connect | < 100ms | < 500ms | > 1s |

### Container health

```bash
cd devOps

# Check status of all containers
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Check resource usage
docker stats --no-stream

# Check logs for errors
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 backend 2>&1 | grep -i error
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=100 ws_gateway 2>&1 | grep -i error
```

### Database connectivity

```bash
# PostgreSQL
docker compose exec db pg_isready -U postgres -d menu_ops
# Expected: /var/run/postgresql:5432 - accepting connections

# Redis
docker compose exec redis redis-cli ping
# Expected: PONG

# Redis memory usage
docker compose exec redis redis-cli info memory | grep used_memory_human
```

### SSL certificate expiry

```bash
echo | openssl s_client -connect yourdomain.com:443 -servername yourdomain.com 2>/dev/null \
  | openssl x509 -noout -dates
# Certificates renew automatically; check that expiry is > 30 days out
```

---

## 6. Emergency Procedures

### 6.1 Database restore from backup

```bash
cd devOps

# List available backups
ls -la backups/

# Restore (interactive — will prompt for confirmation)
./backup/restore.sh backups/integrador_backup_YYYYMMDD_HHMMSS.tar.gz

# Verify after restore
docker compose exec backend alembic current
curl -s https://yourdomain.com/api/health/detailed | jq .
```

### 6.2 Redis flush (when safe)

Only flush Redis when there are no active user sessions. This will:
- Disconnect all WebSocket clients
- Invalidate all JWT blacklist entries
- Clear event catch-up history
- Clear rate limiting counters

```bash
# Check active WebSocket connections first
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=20 ws_gateway | grep -i "connections"

# Flush Redis (all databases)
docker compose exec redis redis-cli FLUSHALL

# Restart services that depend on Redis
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend backend-2 ws_gateway ws_gateway_2
```

### 6.3 Force restart all services

```bash
cd devOps
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

If containers are stuck:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml kill
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 6.4 SSL certificate emergency renewal

If the certificate has expired or is about to expire:

```bash
cd devOps

# Force renewal
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot renew --force-renewal

# Reload nginx with new certificate
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload

# Verify new certificate dates
echo | openssl s_client -connect yourdomain.com:443 -servername yourdomain.com 2>/dev/null \
  | openssl x509 -noout -dates
```

If certbot fails (e.g., rate limited), generate a temporary self-signed cert to restore service:

```bash
# Re-run the init script (it will create a self-signed cert first, then attempt Let's Encrypt)
export DOMAIN=yourdomain.com
export CERT_EMAIL=admin@yourdomain.com
bash ssl/init-letsencrypt.sh
```

### 6.5 Disk space emergency

```bash
# Check disk usage
df -h

# Clean Docker resources (unused images, containers, networks)
docker system prune -f

# Clean old backups (keep last 3)
cd devOps/backups
ls -t *.tar.gz | tail -n +4 | xargs rm -f

# Check PostgreSQL size
docker compose exec db psql -U postgres -d menu_ops -c "SELECT pg_size_pretty(pg_database_size('menu_ops'));"
```

---

## 7. Security Checklist

Run this checklist after every deployment and periodically (monthly).

### Secrets management (S3.2)

The backend enforces strict fail-fast validation of secrets at boot in
**protected environments** (`ENVIRONMENT` in `{production, prod, staging}`).
If any required secret is missing, too short, or set to a known insecure
default, `lifespan` raises `RuntimeError` and the application refuses to start.

#### Required secrets in protected environments

| Variable | Min length | Generate command |
|----------|------------|------------------|
| `JWT_SECRET` | 32 | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `TABLE_TOKEN_SECRET` | 32 | `python -c "import secrets; print(secrets.token_urlsafe(48))"` |
| `TOTP_ENCRYPTION_KEY` | 44 (Fernet) | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `ALLOWED_ORIGINS` | n/a | Comma-separated HTTPS origins, e.g. `https://app.example.com,https://admin.example.com` |
| `DATABASE_URL` | n/a | `postgresql+psycopg://user:pass@host:port/db` |
| `REDIS_URL` | n/a | `redis://[:password@]host:port/db` (use AUTH in production) |

#### Rejected values

`JWT_SECRET` and `TABLE_TOKEN_SECRET` are rejected at boot if they:

1. Are empty / not set.
2. Are shorter than 32 characters.
3. Match any of the **known insecure defaults**:
   - `dev-secret-change-me-in-production`
   - `table-token-secret-change-me`
   - `changeme`, `change-me`, `secret`, `password`, `default`,
     `your-secret-here`, `CHANGE_ME`

The full list is exposed via `Settings._known_insecure_defaults()` so audit
scripts can reference it without scraping source.

#### Protected environments

The same rules apply to all of: `production`, `prod`, `staging`. Previously
only an exact match on `production` triggered validation, which let
`ENVIRONMENT=staging` (or a typo like `ENVIRONMENT=prod`) silently boot with
dev defaults and forge JWTs. **That gap is closed.**

#### Dev/test behaviour

In `ENVIRONMENT` values `{dev, development, test, testing, local}`, missing
`JWT_SECRET` / `TABLE_TOKEN_SECRET` are auto-generated at startup with
`secrets.token_urlsafe(48)` and a WARN-level log is emitted. **These secrets
do NOT persist across restarts** — all access tokens are invalidated on every
container restart. For stable dev work, set the env vars explicitly.

If `ENVIRONMENT` is something else entirely (e.g. unset, blank, `qa`), the
secrets default to empty strings and the app will fail on first signing
attempt — by design.

#### Rotation playbook (single-secret JWT_SECRET)

The current implementation validates with a single `JWT_SECRET`, so rotation
is disruptive:

1. Generate a new secret.
2. Update the secret in the secrets manager / `.env`.
3. Roll the backend containers.
4. **All active sessions are invalidated** (users must log in again).

Schedule rotations for a low-traffic window. Future work: support
`JWT_SECRET` + `JWT_SECRET_NEXT` so a rolling rotation accepts both for one
access-token TTL (15 min) before retiring the old key.

#### Verification

```bash
# Boot logs will show one of:
#   - "Starting REST API" (validation passed)
#   - "Configuration error: JWT_SECRET ..." followed by RuntimeError
docker compose logs backend | grep -iE "Configuration error|RuntimeError"

# From the host: refuse to ship a .env with leftover defaults
grep -cE 'dev-secret-change-me|table-token-secret-change-me|^JWT_SECRET=$|^TABLE_TOKEN_SECRET=$' devOps/.env
# Expected: 0
```

### Secrets checklist

- [ ] `JWT_SECRET` is at least 32 characters and randomly generated
- [ ] `TABLE_TOKEN_SECRET` is at least 32 characters and randomly generated
- [ ] `POSTGRES_PASSWORD` is strong and unique
- [ ] No default/development secrets in `.env` (`dev-secret-change-me` etc.)
- [ ] `.env` file is NOT committed to git (check `.gitignore`)
- [ ] Boot logs show no `Configuration error` lines

### Network

- [ ] `ALLOWED_ORIGINS` is set to exact production domain(s) only
- [ ] `DEBUG=false` in `.env`
- [ ] `ENVIRONMENT=production` in `.env`
- [ ] `COOKIE_SECURE=true` in `.env`
- [ ] pgAdmin is disabled (uses `debug` profile, not started by default)
- [ ] PostgreSQL port (5432) is NOT exposed to public internet
- [ ] Redis port (6379/6380) is NOT exposed to public internet

### SSL/TLS

- [ ] SSL certificate is valid and not expired
- [ ] HTTP redirects to HTTPS (test: `curl -sI http://yourdomain.com/`)
- [ ] HSTS header is present (test: `curl -sI https://yourdomain.com/ | grep -i strict`)
- [ ] Only TLSv1.2 and TLSv1.3 are enabled
- [ ] Certificate auto-renewal is working (certbot container is running)

### Application

- [ ] Default test user passwords have been changed or accounts removed
- [ ] Rate limiting is active on auth endpoints
- [ ] WebSocket origin validation is configured
- [ ] Server tokens are hidden (`server_tokens off` in nginx)

### Verification commands

```bash
# Check secrets are not defaults
grep -c "CHANGE_ME\|dev-secret\|change-me" devOps/.env
# Expected: 0

# Check TLS configuration
nmap --script ssl-enum-ciphers -p 443 yourdomain.com

# Check security headers
curl -sI https://yourdomain.com/api/health | grep -iE "strict-transport|x-frame|x-content-type|referrer-policy"
# Expected: All four headers present

# Check HTTP redirect
curl -sI http://yourdomain.com/ | head -1
# Expected: HTTP/1.1 301 Moved Permanently

# Check debug mode is off
curl -s https://yourdomain.com/api/nonexistent-endpoint | jq .
# Should NOT include stack traces or debug information
```

---

## 8. Redis Configuration

### 8.1 Maxmemory policy: `noeviction`

Redis is configured with `--maxmemory-policy noeviction` (NOT `allkeys-lru`)
in both `docker-compose.yml` (dev, 256 MB) and `docker-compose.prod.yml`
(prod, 512 MB). This is a deliberate choice: Redis stores
**mission-critical keys that must NOT be silently evicted**.

| Key prefix | Purpose | Why we can't evict |
|------------|---------|---------------------|
| `auth:token:blacklist:{jti}` | Revoked JWT tokens (TTL = remaining token lifetime, max 15 min) | Evicting brings revoked tokens back to life — security breach |
| `auth:user:revoked:{user_id}` | Per-user revocation timestamp (TTL = 7 days = refresh TTL) | Evicting un-revokes all sessions for that user |
| `ratelimit:login:{email}` | Login attempt counter (TTL = 60 s) | Evicting resets the counter — attacker bypasses brute-force protection |
| `catchup:branch:{branch_id}` | Event backlog sorted set (TTL = 5 min) | Evicting → catch-up returns empty after WS reconnect, clients miss events |
| `cache:menu:{slug}` | Public menu cache (TTL = 5 min) | OK to lose, but `noeviction` means writes will be rejected instead of silently dropping the blacklist |
| `cache:product:*`, `cache:branch:*:products` | Product caches (TTL = 5 min) | Same as above |

### 8.2 Trade-offs

| Setting | Behavior under memory pressure |
|---------|--------------------------------|
| `noeviction` (current) | Writes return `OOM command not allowed when used memory > 'maxmemory'`. **Reads still succeed.** Critical keys survive. The system fails LOUDLY. |
| `allkeys-lru` (previous) | Writes always succeed. Redis silently drops the least-recently-used keys — which includes blacklist and rate-limit counters. The system fails SILENTLY. |

Loud failure is strictly better than silent data corruption. An OOM error
triggers alerts and a postmortem; a silently revived JWT does not.

### 8.3 Capacity planning

Expected memory footprint (100 concurrent users + 30 active tables):

| Bucket | Estimate |
|--------|----------|
| Token blacklist (high churn) | ~1 MB |
| Per-user revocation entries | ~50 KB |
| Rate-limit counters (~500 active) | ~25 KB |
| Catch-up sorted sets (1 per branch, ~5 KB each) | ~50 KB |
| Menu cache (5 branches × ~50 KB) | ~250 KB |
| Product caches | ~500 KB |
| Outbox stream / consumer-group metadata | ~5 MB |
| **Total expected steady-state** | **~7 MB** |

Current `maxmemory`:
- Dev: 256 MB (35x headroom)
- Prod: 512 MB (70x headroom)

We have ample headroom. If `used_memory` grows beyond expectations, the FIRST
thing to check is: are all cache writes using TTL? Keys without TTL accumulate
indefinitely and will eventually exhaust memory under `noeviction`.

### 8.4 Monitoring & alerting

The Redis exporter (`oliver006/redis_exporter`) is already wired into
Prometheus via `docker-compose.prod.yml`. Add these alerts to
`devOps/monitoring/prometheus.yml`:

- **Memory pressure (warning)**: `redis_memory_used_bytes / redis_memory_max_bytes > 0.80`
- **Memory pressure (critical)**: `redis_memory_used_bytes / redis_memory_max_bytes > 0.95`
- **OOM rejections**: any non-zero `redis_rejected_connections_total` or
  application logs containing `OOM command not allowed`

Also alert on:
- Backend logs containing `Failed to blacklist token` (token-blacklist write rejected by Redis)
- Backend logs containing `Rate limit check failed - applying fail-closed policy` spiking

### 8.5 Operational checks

```bash
# Verify the running policy
docker compose exec redis redis-cli CONFIG GET maxmemory-policy
# Expected: "noeviction"

# Memory snapshot
docker compose exec redis redis-cli INFO memory | grep -E "used_memory_human|maxmemory_human|maxmemory_policy"

# Diagnose what's eating memory
docker compose exec redis redis-cli MEMORY DOCTOR

# Count keys by prefix (find the offender if memory grows)
docker compose exec redis redis-cli --scan | awk -F: '{print $1":"$2}' | sort | uniq -c | sort -rn | head -20

# Find keys without TTL (these are the suspects under noeviction)
docker compose exec redis sh -c "redis-cli --scan | while read k; do ttl=\$(redis-cli TTL \"\$k\"); [ \"\$ttl\" = \"-1\" ] && echo \"\$k\"; done" | head -20
```

### 8.6 Recovery from OOM

If Redis hits maxmemory and starts rejecting writes:

1. **Identify**: `redis-cli MEMORY DOCTOR` and count by prefix (see 8.5)
2. **Triage**: which prefix is growing? Is it a known cache (acceptable spike) or a leak (TTL bug)?
3. **Emergency relief** (if a TTL-less prefix is the cause): delete its keys
   ```bash
   docker compose exec redis redis-cli --scan --pattern "leaky:prefix:*" | xargs -L 100 redis-cli DEL
   ```
4. **Long-term fix**: add `setex` / `EXPIRE` to the code path that writes those keys
5. **Last resort** (loses ALL data, including blacklist — users must re-auth):
   ```bash
   docker compose exec redis redis-cli FLUSHDB
   docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend backend-2 ws_gateway ws_gateway_2
   ```
6. **Capacity bump** (only if 80% utilization is steady-state, not a leak): increase
   `--maxmemory` in `docker-compose.prod.yml` and redeploy Redis.

### 8.7 Known keys WITHOUT TTL (audit findings)

The following Redis writes do NOT set a TTL. Under `noeviction`, these accumulate
indefinitely. They are bounded by business logic (finite number of API keys,
finite number of metric names), so they do not pose an immediate risk —
but they must be considered when sizing `maxmemory`:

| Location | Key prefix | Bounded by |
|----------|-----------|-----------|
| `backend/shared/security/api_keys.py:85,167` | `{PREFIX_ACTIVE}{key}` | Number of active API keys (set on creation when no TTL provided) |
| `backend/shared/security/api_keys.py:88,184,226` | `{PREFIX_METADATA}{key_id}` | Same as above |
| `backend/shared/infrastructure/metrics/prometheus.py:80` | Gauge keys | Number of distinct (gauge_name, labels) combinations |

These are tracked as a follow-up issue (S2.B candidate) but do not block S2.A.

---

## 9. Outbox Sweeper

The outbox sweeper (S2.B) rescues events stuck in `PROCESSING` state in the
`outbox_event` table. It runs as a background `asyncio.Task` inside the REST API
process and ticks every 30 seconds.

### Why it exists

`outbox_processor._process_batch` marks events as `PROCESSING` and commits to
the DB **before** publishing to Redis. If the process is killed between the
commit and the publish (OOM, SIGTERM during deploy, hard crash), the event is
left in `PROCESSING` forever and never reaches the frontend.

For financial/critical events (`CHECK_REQUESTED`, `PAYMENT_APPROVED`,
`CHECK_PAID`, `ROUND_SUBMITTED`) this causes "ghost tables" — payment is
recorded but the waiter/diner never receives the notification.

### How it works

- Selects rows where `status = 'PROCESSING'` AND
  `created_at < NOW() - INTERVAL '60 seconds'` AND
  `processed_at IS NULL` AND
  `retry_count < 5`.
- Uses `SELECT ... FOR UPDATE SKIP LOCKED` to avoid contention with the main
  processor.
- Reverts each row to `PENDING`, increments `retry_count`, and sets
  `last_error` so the rescue is auditable.
- Events with `retry_count >= 5` are **NOT** rescued — they're treated as DLQ
  candidates and should be inspected manually.

### Symptoms of sweeper malfunction

- `outbox_event` table grows: many `PROCESSING` rows with old `created_at`.
- Frontend doesn't receive `CHECK_REQUESTED` / `PAYMENT_APPROVED` events even
  though the DB shows them as written.
- The "Outbox sweeper started" log line is missing from the REST API logs at
  startup.

### Manual recovery (if the sweeper is down)

```sql
UPDATE outbox_event
SET status      = 'PENDING',
    retry_count = retry_count + 1,
    last_error  = 'Manual recovery: sweeper was down'
WHERE status         = 'PROCESSING'
  AND created_at     < NOW() - INTERVAL '60 seconds'
  AND processed_at   IS NULL
  AND retry_count    < 5;
```

To inspect DLQ candidates (events that exceeded the retry budget):

```sql
SELECT id, event_type, aggregate_type, aggregate_id, retry_count, last_error, created_at
FROM outbox_event
WHERE status      = 'PROCESSING'
  AND retry_count >= 5
ORDER BY created_at;
```

### Monitoring & alerting

Alert when any of the following is true:

- `SELECT COUNT(*) FROM outbox_event WHERE status = 'PROCESSING' AND created_at < NOW() - INTERVAL '5 minutes';` returns > 10.
- The sweeper log line is absent for > 2 minutes (it logs `"Outbox sweeper started"` at boot and warns when it rescues zombies).
- `SELECT COUNT(*) FROM outbox_event WHERE status = 'FAILED';` is growing — events are exceeding the retry budget.

### Tuning

Constants live in `backend/rest_api/services/events/outbox_sweeper.py`:

| Constant | Default | Meaning |
|----------|---------|---------|
| `SWEEP_INTERVAL_SECONDS` | 30 | How often the sweeper wakes up. |
| `ZOMBIE_THRESHOLD_SECONDS` | 60 | Minimum age of a `PROCESSING` row before it is considered a zombie. |
| `MAX_RETRY_COUNT` | 5 | Events with `retry_count >= MAX_RETRY_COUNT` are not rescued (DLQ). Kept in sync with `outbox_processor.MAX_RETRIES`. |

---

## 10. Database Connection Pool

S2.E — pool sized for 100 concurrent users. Defined in
`backend/shared/infrastructure/db.py`, configurable via env vars.

### 10.1 Sizing rationale

Per-backend-instance pool:

| Setting | Default | Meaning |
|---------|---------|---------|
| `DB_POOL_SIZE` | 25 | Always-on (kept-alive) connections |
| `DB_MAX_OVERFLOW` | 25 | Burst capacity, released after use |
| `DB_POOL_TIMEOUT` | 30 | Seconds a request waits for a free connection |
| `DB_POOL_RECYCLE` | 1800 | Rotate every 30 min to handle NAT / network blips |

**Max DB connections per backend instance: 50** (`POOL_SIZE + MAX_OVERFLOW`).

`pool_pre_ping=True` is enabled — every connection is ping-tested before
checkout, catching stale connections (firewall idle-kills, Postgres restart).

### 10.2 Deployment math

| Deployment | Backend instances | Total max DB conns | Postgres `max_connections` |
|------------|-------------------|--------------------|----------------------------|
| Dev (single instance) | 1 | 50 | 100 (default — alcanza) |
| Prod (2 replicas) | 2 | 100 | 200 (`devOps/docker-compose.prod.yml` line `-c max_connections=200`) |

Prod margin: 200 − 100 (backends) ≈ 100 free for pgAdmin (`profiles: debug`,
normally off), postgres-exporter, ad-hoc psql sessions, and Alembic migrations.

The outbox processor and shared `get_db_context()` (used by ws_gateway DB reads
and background tasks) all share `SessionLocal` — they do **not** add a separate
pool. The 50/instance budget covers them.

### 10.3 Expected utilization for 100 concurrent users

Per backend instance under realistic load:

- API requests in flight: ~20 active conns (100 users × 0.2 avg concurrent ops)
- Burst (20 simultaneous `submit_round`): +10 active conns
- Outbox processor: 1–2 conns
- Admin dashboard polling: 1–3 conns

**Peak realistic: ~35 conns** → 50 max gives ~30% headroom before `max_overflow`
is exhausted and `pool_timeout` errors start.

### 10.4 Monitoring & alerting

Alert when any of these fire:

- `pool.checkedout() / pool.size() >= 0.8` for > 5 min — pool saturation
- Any `QueuePool limit of size X overflow Y reached, connection timed out`
  log line in any 5-min window — already past saturation
- `pg_stat_activity` count near `max_connections * 0.8`:
  ```bash
  docker compose exec db psql -U postgres -c "SELECT count(*) FROM pg_stat_activity;"
  ```

Runtime check:

```bash
docker compose exec backend python -c "from shared.infrastructure.db import engine; \
print(f'size={engine.pool.size()} checked_out={engine.pool.checkedout()} \
overflow={engine.pool.overflow()}')"
```

### 10.5 Troubleshooting

If you see `QueuePool limit ... timed out`:

1. **Long queries holding conns**:
   ```sql
   SELECT pid, now() - query_start AS duration, state, query
   FROM pg_stat_activity
   WHERE state = 'active' AND query_start < NOW() - INTERVAL '30 seconds'
   ORDER BY duration DESC;
   ```
2. **Connection leaks**: look for `with Session()` or `SessionLocal()` blocks
   missing a `finally: db.close()` or not using `get_db` / `get_db_context`.
3. **Outbox sweeper stuck** (section 9): if events pile up in `PROCESSING`,
   the processor may be holding conns longer than expected.
4. **Quick mitigation** (no restart): bump `DB_MAX_OVERFLOW` in `.env` and
   recreate the affected service:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d \
       --no-deps backend backend-2
   ```
   Verify Postgres still has headroom: `SHOW max_connections;` vs current load.

### 10.6 Tuning for other topologies

| Deployment | Recommended config |
|------------|--------------------|
| Single instance dev (light) | `DB_POOL_SIZE=15`, `DB_MAX_OVERFLOW=15` (fewer idle conns) |
| 2 instances prod (default) | `DB_POOL_SIZE=25`, `DB_MAX_OVERFLOW=25` |
| 4 instances prod | `DB_POOL_SIZE=15`, `DB_MAX_OVERFLOW=15` → 30 × 4 = 120 total. Keep `max_connections=200`. |
| 4 instances, heavy load | `DB_POOL_SIZE=20`, `DB_MAX_OVERFLOW=20` → 40 × 4 = 160. Raise `max_connections=250`. |

**Rule of thumb**: `N_instances × (POOL_SIZE + MAX_OVERFLOW) + 30` (admin/monitoring
overhead) should be ≤ `Postgres max_connections`.

---

## 11. AFIP Electronic Invoicing

S3.1 — production gate for the AFIP WSFE integration. The system supports two
AFIP modes via the `AFIP_ENVIRONMENT` environment variable.

### 11.1 Configuration

| Mode | Description | Allowed when ENVIRONMENT is |
|------|-------------|------------------------------|
| `stub` (default) | Returns simulated CAE `00000000000000`. Logs a structured warning on every call. **Never for production.** | `development`, `staging`, `test` |
| `production` | Real AFIP WSFE call (requires pyafipws + AFIP certificates). **Not yet implemented in this codebase** — `_call_afip_wsfe` raises `NotImplementedError`. | `production`, `prod` |

The default is `stub` and is set explicitly: a deployment must **opt-in** to
production AFIP. Defaulting to `production` would be safer fail-closed, but it
would break dev/test environments — so we defend at two layers instead.

### 11.2 Defence layers

1. **Boot-time fail-fast** — `Settings.validate_production_secrets()` returns
   an error when `ENVIRONMENT=production` and `AFIP_ENVIRONMENT != production`.
   The application refuses to start. Symptom: container restart loop with
   `RuntimeError: AFIP_ENVIRONMENT must be 'production'...` in the logs.

2. **Request-time fail-fast** — even if the boot check is bypassed (flag
   flipped at runtime via a debugger or hot config reload), the
   `_call_afip_wsfe` stub re-checks `settings.environment` on every call and
   raises `ExternalServiceError(service="AFIP", is_unavailable=True)` which
   FastAPI surfaces as **HTTP 503**. No fake CAE is ever persisted.

### 11.3 Production deployment checklist (before going live)

- [ ] Implement real `_call_afip_wsfe()` using the `pyafipws` library
  (replace the `NotImplementedError` branch).
- [ ] Provision AFIP certificates: CUIT, X.509 certificate signed by AFIP,
  matching private key.
- [ ] Store certificates in a mounted volume or secret manager (Docker secret,
  Kubernetes Secret, Hashicorp Vault). **Never commit certificates to git.**
- [ ] Test against AFIP **HOMOLOGACIÓN** first (WSAA test endpoint) — emit
  several invoices, verify CAE format, check responses.
- [ ] Set `AFIP_ENVIRONMENT=production` in production `.env`.
- [ ] Verify boot: `docker compose logs backend | grep -i "afip"`.
- [ ] Emit a low-value production invoice and confirm the CAE is valid in
  AFIP's "Mis Comprobantes" portal.

### 11.4 Symptoms of misconfiguration

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Container fails to start with `RuntimeError: AFIP_ENVIRONMENT must be 'production'...` | `ENVIRONMENT=production` but `AFIP_ENVIRONMENT=stub` (or unset) | Either set `AFIP_ENVIRONMENT=production` and ship the real integration, or block this deployment |
| `POST /api/admin/fiscal/invoice` returns **HTTP 503** with `"Servicio AFIP temporalmente no disponible"` | Stub is refusing to run in production (`environment` was set to production at runtime but `afip_environment` is still `stub`) | Same as above — check logs for `"AFIP stub blocked in production environment"` |
| `POST /api/admin/fiscal/invoice` returns **HTTP 500** with `NotImplementedError` | `AFIP_ENVIRONMENT=production` is set but the real `_call_afip_wsfe` body is not implemented | Either ship the real integration or revert to `stub` (only valid in non-prod) |
| Invoices in DB have `cae="00000000000000"` | The stub ran and persisted. Check `ENVIRONMENT` at the time of emission — should NEVER happen in production | Investigate how the gates were bypassed; void the affected invoices via credit notes (manually, after AFIP integration is live) |

### 11.5 Audit trail

The stub emits a structured log entry on every call (`logger.warning("STUB:
AFIP WSFE call simulated. NOT FOR PRODUCTION.", ...)`) with `point_number`
and `invoice_number` in the context. To verify no stub calls in production:

```bash
docker compose logs backend | grep "STUB: AFIP WSFE"
# Expected in production: 0 results
```

If any line matches in a production environment, treat it as a P0 incident —
even if the gate fired and the call did not actually persist, the log line
itself indicates a code path that should not have been reached.

### 11.6 Rollback

`AFIP_ENVIRONMENT` only controls the in-memory branch in `_call_afip_wsfe`.
There is no DB migration tied to this setting, so rollback is a config-only
change:

```bash
# 1. Set AFIP_ENVIRONMENT back to a safe value in devOps/.env
# 2. Restart backend
cd devOps
docker compose -f docker-compose.yml -f docker-compose.prod.yml restart backend backend-2
```

Note: rolling back to `stub` in production will surface as HTTP 503 on every
invoice request, which is the intended fail-closed behaviour.

---

## Appendix: Service Architecture

```
Internet
  │
  ├─ :80  ──→ Nginx ──→ 301 redirect to :443
  │
  └─ :443 ──→ Nginx (SSL termination)
                ├─ /api/*  ──→ backend_1:8000 (least_conn)
                │              backend_2:8000
                ├─ /ws/*   ──→ ws_gateway_1:8001 (ip_hash)
                │              ws_gateway_2:8001
                └─ /health ──→ local 200

Internal:
  backend ──→ PostgreSQL :5432
  backend ──→ Redis :6379
  ws_gateway ──→ Redis :6379
  certbot ──→ Let's Encrypt ACME (port 80 challenge)
```

## Appendix: Key File Locations

| File | Purpose |
|------|---------|
| `devOps/.env` | Production secrets (never commit) |
| `devOps/.env.example` | Template for `.env` |
| `devOps/docker-compose.yml` | Base compose (dev) |
| `devOps/docker-compose.prod.yml` | Production overlay (scaling + SSL) |
| `devOps/nginx/nginx.conf` | Nginx config (HTTP only, dev) |
| `devOps/nginx/nginx-ssl.conf` | Nginx config (HTTPS, production) |
| `devOps/ssl/init-letsencrypt.sh` | SSL certificate bootstrap script |
| `devOps/certbot/conf/` | Let's Encrypt certificates (created at runtime) |
| `devOps/certbot/www/` | ACME challenge webroot (created at runtime) |
| `devOps/backup/backup.sh` | Backup script (PostgreSQL + Redis) |
| `devOps/backup/restore.sh` | Restore script (interactive) |
| `devOps/SCALING.md` | Horizontal scaling documentation |
