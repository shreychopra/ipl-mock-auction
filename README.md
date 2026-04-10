# IPL 2026 Mock Auction + Fantasy League

A two-file web app hosted on GitHub Pages that lets a friend group run a live mock IPL auction and then track fantasy points automatically across the real IPL season. No backend server — Firebase Realtime Database handles all live state, and a Cloudflare Worker handles scheduled point syncing via the Cricbuzz API.

**Live:** `shreychopra.github.io/ipl-mock-auction/`

---

## Files

| File | Purpose | Lines |
|---|---|---|
| `index.html` | Auction app — host creates room, participants bid live | ~2960 |
| `fantasy.html` | Fantasy tracker — leaderboard, squads, replay, schedule, points | ~3600 |
| `cloudflare-worker.js` | Cron-based auto-sync of match points from Cricbuzz API | ~590 |
| `sw.js` | Service worker for PWA / Add to Home Screen support | — |

---

## Infrastructure

### Firebase (`ipl-auction-64c8e`)
Realtime Database — no server needed, all state is live-synced via the client SDK.

```
rooms/{code}/                  ← auction state per room
  auctionStarted, auctionEnded, auctionEndedAt
  teams/{idx}/
    name, color, budget, spent
    players[]/  ← sold players in auction order (soldPrice, role, nat, etc.)
  players[]/    ← full player list with status (pending/sold/unsold)
  captains/     ← legacy flat C/VC (use fantasy captains instead)

fantasy/{code}/                ← per-room fantasy data
  syncedIds/{matchId}          ← true when match has been synced
  matchLabels/match{N}         ← "M12 — KKR vs PBKS"
  matchResults/match{N}        ← result string from Cricbuzz
  matches/match{N}/{teamIdx}/{playerIdx}  ← {p,b,w,f,t} breakdown object
  captains/match{N}/{teamIdx}  ← {c: playerIdx, vc: playerIdx}

fantasy/global/                ← shared across all rooms
  matchLabels/, matchResults/, matches/match{N}/{apiPlayerName}
```

### Cloudflare Worker (`ipl-fantasy-proxy.choprashrey17.workers.dev`)

Proxies Cricbuzz API calls (hides API key from client) and runs scheduled syncs.

**Endpoints:**

| Path | Method | Auth | Description |
|---|---|---|---|
| `/cricbuzz/{path}` | GET | — | Proxy to Cricbuzz API |
| `/run-sync` | POST | password | Manually trigger sync |
| `/reset-match` | POST | password | Clear syncedId for a match |
| `/resolve-ids` | POST | password | Run match ID auto-detection and return changes |
| `/admin/verify` | POST | — | Verify admin password |

**Cron triggers:**

| Cron | IST time | Purpose |
|---|---|---|
| `30 14 * * *` | 8:00 PM | 7:30 PM match sync |
| `0 10 * * *` | 3:30 PM | Afternoon match sync |
| `30 23 * * *` | 5:00 AM | Evening match final sync |

---

## Setup

### 1. Firebase

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Realtime Database** in test mode
3. Copy your config object and replace in both `index.html` and `fantasy.html`:

```js
firebase.initializeApp({
  apiKey: '...',
  authDomain: '....firebaseapp.com',
  databaseURL: 'https://...-default-rtdb.firebaseio.com',
  projectId: '...',
  storageBucket: '....appspot.com',
  appId: '...'
});
```

### 2. Cricbuzz API (RapidAPI)

1. Subscribe to [cricbuzz-cricket2](https://rapidapi.com/cricbuzz/api/cricbuzz-cricket2) on RapidAPI
2. Copy your API key into `cloudflare-worker.js`:

```js
var RAPIDAPI_KEY = 'your_key_here';
```

### 3. Cloudflare Worker

1. Install [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
2. Login: `wrangler login`
3. Deploy: `wrangler deploy cloudflare-worker.js`
4. Set cron triggers in your `wrangler.toml`:

```toml
name = "ipl-fantasy-proxy"
main = "cloudflare-worker.js"
compatibility_date = "2024-01-01"

[triggers]
crons = ["30 14 * * *", "0 10 * * *", "30 23 * * *"]
```

5. Update `WORKER_URL` in `fantasy.html` to your deployed worker URL.

### 4. GitHub Pages

Push all files to a public repo. Enable GitHub Pages from the repo settings (source: main branch, root folder). The app is served at `yourusername.github.io/repo-name/`.

---

## Player Database

250 players across 10 IPL teams. Each entry in the `PLAYERS` array:

```js
{id, name, role, nat, base, photo, team}
// role: Bat | Bowl | AR | WK
// nat:  IN | OS
// base: base price in lakhs
// team: IPL team abbreviation (RCB, MI, CSK, ...)
// photo: filename in /images/ (webp)
```

227 `.webp` headshots + 10 team logos in `/images/`.

**Known name corrections** (Cricbuzz spelling vs common spelling):

| Player | Cricbuzz name |
|---|---|
| Varun Chakravarthy | Varun Chakaravarthy |
| Digvesh Singh Rathi | Digvesh Singh Rathi |
| Pravin Dubey | Pravin Dubey |
| Smaran Ravichandran | Smaran Ravichandran |

---

## Scoring System

| Category | Points |
|---|---|
| Playing XI | +4 |
| Run scored | +1 |
| Boundary (4) | +1 |
| Six (6) | +2 |
| 25 runs | +4 |
| 50 runs | +8 |
| 100 runs | +16 |
| Duck (dismissed for 0) | −2 |
| Wicket | +25 |
| LBW / Bowled bonus | +8 |
| 3-wicket haul | +4 |
| 4-wicket haul | +8 |
| 5-wicket haul | +16 |
| Maiden over | +12 |
| Economy < 6 (2+ overs) | +4 |
| Economy 6–8 (2+ overs) | +2 |
| Catch | +8 |
| Stumping | +12 |
| Run-out (direct) | +12 |
| Run-out (indirect) | +6 |
| **Captain** | **2× total** |
| **Vice-Captain** | **1.5× total** |

Points are stored as `{p, b, w, f, t}` breakdown objects (Playing XI / Batting / Bowling / Fielding / Total). Run the **Migrate Old Points** button in the admin sync tab once to convert any legacy plain-number entries to this format.

---

## Auction App (`index.html`)

**Roles**
- **Host** — creates room, controls auction flow (bring player up, timer, sold/unsold)
- **Participant** — joins with a team name, bids live

**Flow**
1. Host creates room → 6-character code is generated
2. Participants join, pick a team name and colour
3. Host brings up players (search, alphabetical list, category filter, or random)
4. Real-time bidding with optional countdown timer
5. SOLD overlay → next player
6. Unsold players go to a re-auctionable list
7. End screen shows full results, C/VC picker, and link to Fantasy Tracker

**Squad rules** — 16, 18, or 20 players with category limits enforced (e.g. 16-player squad: max 6 Bat / 6 Bowl / 4 AR / 2 WK).

---

## Fantasy Tracker (`fantasy.html`)

**Tabs**

| Tab | Description |
|---|---|
| Leaderboard | Ranked by total points, sparkline trend, rank change badges (▲/▼), last-match pts |
| Squads | Players grouped by role, C/VC badges, click player for modal (Total/Played/Avg/Best + match history with breakdown chips). On your own squad, C/VC can be changed per match directly from the modal. |
| Schedule | All 70 matches with results and countdowns. NR/abandoned matches shown in muted grey. Pulled from `fantasy/global/` so new rooms see all historical results. |
| History | Match-by-match team points, expandable per match |
| Replay | Chronological auction feed — every sold player, who bought them, for how much |
| Points | Admin only — all-player points view, filterable by room, match, player name search, and IPL team |
| Auto Sync | Admin only — manual sync trigger, sync log, match ID verifier, Re-sync All Played, Clear No-Result Match, Migrate Old Points |

**Session persistence** — room code, team name, and team index are saved to `localStorage`. On return, a "Welcome back" banner auto-loads your squad in one tap. "Not you?" clears the session.

**Notifications** — browser push notification permission is requested on first sync alert dismiss (after a user gesture), not on page load, so browsers don't auto-block it.

---

## Match ID Maintenance

Match IDs in `SCHEDULE` follow a roughly +11 increment pattern but this can break for doubleheaders, postponements, and playoffs.

**Automatic resolution** — on every cron trigger, `resolveMatchIds()` calls the Cricbuzz series schedule endpoint and reconciles upcoming match IDs by matching team names + date. If the API call fails, the hardcoded IDs are used as fallback — sync is never blocked.

**Manual verification** — in the Fantasy Tracker admin sync tab, use **Verify All Upcoming** to ping Cricbuzz for each upcoming match ID and confirm it resolves to the right fixture. Use **Re-sync All Played** after any ID correction to re-process affected matches with captain multipliers correctly applied.

**Manual ID correction** — if you need to update an ID before the next deploy, call the `/resolve-ids` endpoint:

```bash
curl -X POST https://your-worker.workers.dev/resolve-ids \
  -H "Content-Type: application/json" \
  -d '{"password":"your_admin_password"}'
```

---

## Cloudflare Worker Deployment

After any change to `cloudflare-worker.js`:

```bash
wrangler deploy cloudflare-worker.js
```

The worker is written in ES5-compatible style (no template literals, no optional chaining) for maximum Cloudflare compatibility. The `export default` at the bottom is the only ES module syntax used.

---

## Known Limitations

- C/VC can be changed per-match from the squad view up until the match starts — there is no hard lock enforced client-side, so trust your group to not change it mid-match
- Match IDs M16+ were estimated via +11 pattern and auto-detection may not cover all edge cases — manually verify before each playoff match day using the Match ID Verifier
- Worker must be redeployed whenever `cloudflare-worker.js` changes
- Auction replay shows players in within-team sold order; a global cross-team sold sequence is not currently stored in Firebase
