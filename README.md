# Daybreak

Free analytics for Zora creator coins: **https://daybreak.rebelstudiossoftware.com**

- **The gap map.** Every creator with a linked audience of 1,000+ plotted by followers against
  coin holders. Big followings with few holders are audiences that haven't found the coin yet.
- **Gap leaderboard.** Creators ranked by how much of their audience isn't holding, with
  filters by platform and minimum holders.
- **Coin pages.** Holders over time, day-over-day holder churn, daily buy and sell volume,
  trading by weekday and hour, and how concentrated the supply is (the Uniswap v4 pool that
  holds each coin's liquidity is reported separately, not counted as a whale).

All numbers come from the public Zora coins API. The [method page](https://daybreak.rebelstudiossoftware.com/method/)
explains each one. Not financial advice, and not affiliated with Zora.

## How it runs

There is no server. A GitHub Actions workflow runs every hour:

1. downloads the SQLite database from the `data` release,
2. collects coin stats, creator follower counts and new trades (`scripts/collect.ts`), and
   once a day each coin's holder set,
3. prunes old rows and saves the database back to the release,
4. builds the site as static files (`next build` with `output: "export"`) and publishes it
   to GitHub Pages.

## Develop

```bash
npm install
npm run collect          # fills data/coinlens.sqlite (a few minutes; ZORA_API_KEY optional)
npm run dev              # http://localhost:3000
npm test
npm run build && npm run serve   # the static site, as Pages serves it
```

Built by [Rebel Studios](https://rebelstudiossoftware.com).
