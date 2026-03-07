# Telegram Finance Mini App Scaffold

This folder contains a migration scaffold from bot-chat UX to Telegram Mini App UX.

## Structure

- `backend/main.py`: FastAPI API using the existing `finances.db`
- `frontend/`: Mini App UI (`index.html`, `app.js`, `styles.css`)
- `bot/launcher.py`: Bot launcher (`/start`, `/app`) that opens Mini App
- `.env.example`: environment variables template

## 1) Backend

```powershell
cd miniapp\backend
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```powershell
curl http://localhost:8000/health
```

## 2) Frontend

Serve `miniapp/frontend` with any static server (must be HTTPS in Telegram production):

```powershell
cd miniapp\frontend
python -m http.server 3000
```

Local test URL example:

`http://localhost:3000/index.html?api=http://localhost:8000/api&chat_id=<your_chat_id>`

Frontend API config options:

1. Query string override (highest priority):
   - `?api=https://your-backend-domain/api`
2. `frontend/config.js`:
   - copy `frontend/config.example.js` to `frontend/config.js`
   - set `window.APP_CONFIG.API_BASE`
3. Fallback:
   - same origin `/api`

## 3) Mini App Bot Launcher

```powershell
cd miniapp
copy .env.example .env
# edit .env: BOT_TOKEN, MINIAPP_URL
cd bot
pip install -r requirements.txt
python launcher.py
```

Use `/start` or `/app` in Telegram to open Mini App.

## Deploy frontend to GitHub Pages (free)

Yes, GitHub Pages is free for public repositories.

### A) Push code to your GitHub repo

From `c:\Users\manyi\Documents\TestApps\telegram-bots`:

```powershell
git init
git add .
git commit -m "Scaffold Telegram Mini App migration"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

If repo already exists locally, skip `git init` and `remote add`.

### B) Enable GitHub Pages

1. Go to your repo on GitHub.
2. Open `Settings` -> `Pages`.
3. Source: `Deploy from a branch`.
4. Branch: `main`, Folder: `/ (root)` or `/docs`.
5. Save.

GitHub will provide:
`https://<your-username>.github.io/<your-repo>/`

### C) Publish `miniapp/frontend`

Option 1 (recommended simple):
- create a separate repo for frontend and keep `index.html`, `app.js`, `styles.css`, `config.js` at root.

Option 2 (same repo):
- use a workflow or copy frontend files to root/docs for Pages.

### D) Set Mini App URL

In `miniapp/.env`:

`MINIAPP_URL=https://<your-username>.github.io/<your-repo>/index.html`

### E) Point frontend to public backend

Set in `frontend/config.js`:

```js
window.APP_CONFIG = {
  API_BASE: "https://<your-backend-domain>/api"
};
```

Or pass query param:

`https://<your-username>.github.io/<repo>/index.html?api=https://<your-backend-domain>/api`

## Current scaffold endpoints

- `GET /api/hangouts?chat_id=...`
- `POST /api/hangouts`
- `GET /api/hangouts/{id}/expenses?chat_id=...`
- `POST /api/hangouts/{id}/expenses?chat_id=...`
- `POST /api/hangouts/{id}/settlements?chat_id=...`
- `GET /api/summary?chat_id=...`

## Migration notes

1. Keep your existing `tele-finance-bot.py` live while testing Mini App.
2. Move one feature at a time to API + frontend pages:
   - hangout creation
   - add expense
   - summary + settle
   - delete flows
3. Add Telegram `initData` signature validation in backend before production.
4. Deploy frontend + backend under HTTPS domain and set `MINIAPP_URL` to frontend URL.

## Important

Your current bot token in `tele-finance-bot.py` should be rotated in BotFather and moved to env vars.
