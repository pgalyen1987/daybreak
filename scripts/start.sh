#!/bin/sh
# Production entrypoint: the collector schedule in the background, the site in the foreground.
node --import tsx scripts/scheduler.ts &
exec npx next start -p "${PORT:-3000}"
