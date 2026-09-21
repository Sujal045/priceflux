# Local infrastructure

Bring up Postgres, Redis, and RabbitMQ for development:

```bash
# from repo root
cp .env.example .env
docker compose -f infra/docker-compose.yml --env-file .env up -d
docker compose -f infra/docker-compose.yml ps
pnpm topology:assert
```

| Service    | Port(s)     | Notes                                                                                    |
|------------|-------------|------------------------------------------------------------------------------------------|
| Postgres   | 5433→5432   | Host **5433** by default (container still 5432); override via `POSTGRES_PORT`            |
| Redis      | 6379        | AOF enabled                                                                              |
| RabbitMQ   | 5672, 15672 | AMQP + management UI at http://localhost:15672                                           |

## RabbitMQ topology

Source of truth: [`rabbitmq/definitions.json`](rabbitmq/definitions.json).

User/vhost credentials come from Compose `RABBITMQ_DEFAULT_*` / `.env`. Topology is **applied and asserted** by `pnpm topology:assert` (management HTTP API) — not via `load_definitions`, so local passwords stay in sync with `.env`.

| Kind     | Name               | Notes                                                     |
|----------|--------------------|-----------------------------------------------------------|
| Exchange | `scrape.work`      | topic — scrape job ingress                                |
| Exchange | `scrape.dlx`       | topic — retries / dead letter                             |
| Exchange | `results.topic`    | topic — successful scrape results                         |
| Queue    | `scrape.jobs`      | DLX → `scrape.dlx` / `scrape.fail`                        |
| Queue    | `scrape.retry.30s` | TTL 30s → requeue to `scrape.work` / `scrape.job`         |
| Queue    | `scrape.retry.5m`  | TTL 5m → requeue                                          |
| Queue    | `scrape.retry.30m` | TTL 30m → requeue                                         |
| Queue    | `scrape.dead`      | parking lot (`scrape.dead` + unexpected `scrape.fail`)    |
| Queue    | `results.notify`   | bound to `results.ready`                                  |

```bash
pnpm topology:assert
```

Stop / reset:

```bash
docker compose -f infra/docker-compose.yml down
# wipe all volumes (destructive):
docker compose -f infra/docker-compose.yml down -v
```
