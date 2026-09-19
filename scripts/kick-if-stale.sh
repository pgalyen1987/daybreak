#!/bin/sh
# Fallback for the hourly GitHub schedule: if Daybreak's last workflow run started more than 75
# minutes ago, start one by hand. Does nothing while the schedule is keeping up. Runs from the
# daybreak-kick user timer (hourly at :47); GitHub's own cron is still the main trigger.
GH=$(command -v gh || echo /home/me/.local/bin/gh)
last=$("$GH" run list -R pgalyen1987/daybreak --limit 1 --json createdAt --jq '.[0].createdAt' 2>/dev/null) || exit 0
[ -n "$last" ] || exit 0
age=$(( $(date -u +%s) - $(date -u -d "$last" +%s) ))
if [ "$age" -gt 4500 ]; then
  "$GH" workflow run daybreak.yml -R pgalyen1987/daybreak && echo "$(date -Is) last run ${age}s ago: dispatched"
else
  echo "$(date -Is) last run ${age}s ago: fine"
fi
