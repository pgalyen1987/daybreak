#!/bin/sh
# Fallback for the hourly GitHub schedule: if Daybreak's last workflow run started more than 45
# minutes ago, start one by hand. Does nothing while the schedule is keeping up. Runs from the
# daybreak-kick user timer (hourly at :47); GitHub's own cron is still the main trigger, but it
# mostly doesn't fire, and when it does it's late. At 75 minutes a run this kick started was 60
# minutes old at the next check (a two-hour cycle); at 55, a schedule run landing at :56 was 51
# minutes old at :47 and skipped the hour. 45 keeps every gap near an hour.
GH=$(command -v gh || echo /home/me/.local/bin/gh)
# only runs that collect count: a push run just rebuilds the site from the stored data
last=$("$GH" run list -R pgalyen1987/daybreak --limit 20 --json createdAt,event --jq '[.[] | select(.event != "push")][0].createdAt' 2>/dev/null) || exit 0
[ -n "$last" ] || exit 0
age=$(( $(date -u +%s) - $(date -u -d "$last" +%s) ))
if [ "$age" -gt 2700 ]; then
  "$GH" workflow run daybreak.yml -R pgalyen1987/daybreak && echo "$(date -Is) last run ${age}s ago: dispatched"
else
  echo "$(date -Is) last run ${age}s ago: fine"
fi
