# Local infrastructure (PR 02)

Bring up Postgres, Redis, and RabbitMQ for development:

```bash
# from repo root
cp .env.example .env
docker compose -f infra/docker-compose.yml --env-file .env up -d
docker compose -f infra/docker-compose.yml ps
```

| Service    | Port(s)     | Notes                                      |
|------------|-------------|--------------------------------------------|
| Postgres   | 5433→5432   | Host **5433** by default (container still 5432); override via `POSTGRES_PORT` |
| Redis      | 6379        | AOF enabled                                                                  |
| RabbitMQ   | 5672, 15672 | AMQP + management UI at http://localhost:15672                               |

Stop / reset:

```bash
docker compose -f infra/docker-compose.yml down
# wipe volumes (destructive):
docker compose -f infra/docker-compose.yml down -v
```

RabbitMQ exchange/queue topology is **not** declared here — that lands in PR 03.
