# Deploying the Alert Scanner (Free, 24/7)

This Node.js service scans markets every 90 seconds and sends phone alerts
via ntfy or Telegram — no browser or PC required.

---

## Option A — Railway (Recommended, Free)

Railway gives you 500 free hours/month (enough for one always-on service).

### Steps

1. **Push the `alert-scanner` folder to GitHub**
   - Go to github.com → New repository → name it `coin-engine-scanner`
   - In your terminal:
     ```bash
     cd "C:\Users\Armando Garcia\Desktop\Coin Engine\alert-scanner"
     git init
     git add .
     git commit -m "initial scanner"
     git remote add origin https://github.com/YOUR_USERNAME/coin-engine-scanner.git
     git push -u origin main
     ```

2. **Create a Railway project**
   - Go to [railway.app](https://railway.app) → Log in with GitHub
   - Click **New Project** → **Deploy from GitHub repo**
   - Select your `coin-engine-scanner` repo
   - Railway detects Node.js automatically

3. **Add environment variables**
   - In Railway, go to your service → **Variables** tab
   - Add each variable from `.env.example`:
     | Variable | Example value |
     |---|---|
     | `NOTIFY_PROVIDER` | `ntfy` |
     | `NTFY_TOPIC` | `my-coin-alerts-abc123` |
     | `WATCH_SYMBOLS` | `ES=F,NQ=F,BTC-USD,ETH-USD` |
     | `MIN_WIN_PROB` | `65` |
     | `EARLY_SCORE_THRESHOLD` | `80` |

4. **Deploy**
   - Railway deploys automatically on push
   - Click **View Logs** to see the scanner starting up
   - You'll get a startup ping on your phone: "✅ Coin Engine Scanner is live!"

---

## Option B — Render (Free tier, sleeps after 15 min idle)

> ⚠️ Render's free tier pauses the service after 15 min of no HTTP traffic.
> Use a free uptime monitor like [UptimeRobot](https://uptimerobot.com) to ping it
> every 5 min and keep it awake.

1. Go to [render.com](https://render.com) → New → **Background Worker**
2. Connect your GitHub repo
3. Set **Build Command**: `npm install`
4. Set **Start Command**: `node index.js`
5. Add environment variables in the Render dashboard
6. Deploy

---

## Option C — Run locally (PC must stay on)

```bash
cd "C:\Users\Armando Garcia\Desktop\Coin Engine\alert-scanner"
npm install
cp .env.example .env
# Edit .env with your settings
node index.js
```

Keep the terminal window open. Consider using PM2 to auto-restart:
```bash
npm install -g pm2
pm2 start index.js --name coin-scanner
pm2 save
pm2 startup   # auto-start on Windows login
```

---

## Updating your watch list

On Railway: go to **Variables** → change `WATCH_SYMBOLS` → Railway redeploys automatically.

On Render: same — edit the env var, trigger a manual deploy.

Locally: edit `.env`, restart the process.
