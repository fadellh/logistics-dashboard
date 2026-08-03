.PHONY: install dev build start lint test eval seed db-push docker-build docker-run

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
