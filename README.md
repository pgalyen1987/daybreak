# Daybreak

Free analytics for Zora creator coins: **https://daybreak.rebelstudiossoftware.com**

![Daybreak's gap map: every Zora creator's followers against their coin's holders](public/og.png)

- **Check your coin.** Any Zora handle, not only the coins tracked here: linked followers next to
  holders, how that compares with Zora's top creators, the next step that fits those numbers, and
  a share card with the coin's art. Read from Zora's API in the browser; nothing is stored.
- **The gap map.** Every creator with a linked audience of 1,000+ plotted by followers against
  coin holders. Big followings with few holders are audiences that haven't found the coin yet.
- **Gap leaderboard.** Creators ranked by how much of their audience isn't holding, with
  filters by platform and minimum holders.
- **Rewards.** Who Zora pays on every trade, read from Base: the split between creators, the
  apps that created and routed the coins, the protocol and Doppler, per day, with the top earners.
  Both reward events are decoded (`CoinMarketRewardsV4` and `CreatorCoinRewards`).
- **Tags.** Zora's tags (trend coins): what trades, what gains holders, and which tags share them.
- **Coin pages.** Holders over time, day-over-day holder churn, daily buy and sell volume,
  trading by weekday and hour, and how concentrated the supply is (the Uniswap v4 pool that
  holds each coin's liquidity is reported separately, not counted as a whale).

Also a Farcaster mini app (coin pages and the site open in the feed) and installable as an app.
Built on the same team's open-source [Zora coins SDKs](https://github.com/pgalyen1987/zora-coins-sdks)
([Python](https://github.com/pgalyen1987/zora-coins-py)).

All numbers come from the public Zora coins API. The [method page](https://daybreak.rebelstudiossoftware.com/method/)
explains each one. Not financial advice, and not affiliated with Zora.

## How it runs

There is no server. A GitHub Actions workflow runs every hour:

1. downloads the SQLite database from the `data` release,
2. collects coin stats, creator follower counts and new trades (`scripts/collect.ts`), every
   reward payout from Base's logs, Zora's tags, and once a day each coin's holder set,
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
