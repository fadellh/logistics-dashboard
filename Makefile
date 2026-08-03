.PHONY: install dev build start lint test eval seed db-push docker-build docker-run compose-up compose-down compose-seed compose-logs

LOCAL_DATABASE_URL := postgresql://postgres:postgres@localhost:5432/logistics

install:
	npm install

dev:
	npm run dev

build:
	npm run build

start:
	npm start

lint:
	npm run lint

test:
	npm test

eval:
	npm run eval:ai

seed:
	npm run seed

db-push:
	npx drizzle-kit push

docker-build:
	docker build -t logistics-dashboard .

docker-run:
	@# `docker run --env-file` does not strip quotes (unlike Node's --env-file / dotenv),
	@# so .env's quoted values (e.g. DATABASE_URL="...") would be passed through literally
	@# including the quote characters. Generate an unquoted copy just for this run.
	@sed -E 's/^([A-Za-z_][A-Za-z0-9_]*)="(.*)"$$/\1=\2/' .env > .env.docker
	docker run --rm -p 3000:3000 --env-file .env.docker logistics-dashboard; \
		status=$$?; rm -f .env.docker; exit $$status

# Fully local stack (app + Postgres in Docker) — no Neon account needed. `docker-run`
# above still points at whatever DATABASE_URL is in .env (Neon by default); this is the
# self-contained alternative. Compose's own ${VAR} interpolation from .env DOES strip
# quotes correctly (unlike env_file:/docker run --env-file above) — verified directly,
# see docker-compose.yml's comment.
compose-up:
	docker compose up -d --build

compose-down:
	docker compose down

compose-logs:
	docker compose logs -f app

# Schema + seed data for the Compose Postgres, run from the host against its exposed
# port. Explicit DATABASE_URL on each command, no --env-file involved at all — verified
# this can't fall back to .env's Neon URL (tested with an unreachable local URL first;
# seed.ts does a DELETE before re-inserting, so this had to be confirmed, not assumed).
compose-seed:
	DATABASE_URL=$(LOCAL_DATABASE_URL) npx drizzle-kit push
	DATABASE_URL=$(LOCAL_DATABASE_URL) npx tsx lib/db/seed.ts
