# Telegram Finance Mini App Scaffold

This folder contains a migration scaffold from bot-chat UX to Telegram Mini App UX.

## Structure

- `backend/server.js`: Node.js (Express) API using the existing `finances.db`
- `frontend/`: legacy static Mini App UI (`index.html`, `app.js`, `styles.css`)
- `frontend-tele/`: React + Vite Mini App UI (current UI)
- `bot/launcher.py`: Bot launcher (`/start`, `/app`) that opens Mini App
- `.env.example`: environment variables template

## 1) Backend

```powershell
cd finance-miniapp\backend
npm install
npm run dev
```

Health check:

```powershell
curl http://localhost:8000/health
```

Serve built Mini App from backend at:

`http://localhost:8000/miniapp`

## 2) Frontend (React UI: `frontend-tele`)

```powershell
cd finance-miniapp\frontend-tele
npm install
npm run dev
```

Local test URL example:

`http://localhost:5173/?api=http://localhost:8000/api&chat_id=<your_chat_id>&user_name=<your_name>`

Build:

```powershell
npm run build
```

After building, backend serves this build at `/miniapp`.

## 2b) Frontend (legacy static `frontend`)

Serve `finance-miniapp/frontend` with any static server:

```powershell
cd finance-miniapp\frontend
python -m http.server 3000
```

Local test URL example: `http://localhost:3000/index.html?api=http://localhost:8000/api&chat_id=<your_chat_id>`

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
cd finance-miniapp
copy .env.example .env
# edit .env: BOT_TOKEN, MINIAPP_URL
cd bot
pip install -r requirements.txt
python launcher.py
```

Use `/start` or `/app` in Telegram to open Mini App.

### Group-safe flow

Use the app from a group like this:

1. Add the bot to the Telegram group.
2. In the group, send `/app@YourBotUsername`.
3. The bot replies with a private-chat deep link for that specific group.
4. Open the link in DM and tap the web app button.
5. The Mini App opens scoped to that group only.

Security model:

- Frontend sends Telegram `initData` on every API call.
- Backend validates the `initData` signature using `BOT_TOKEN`.
- Backend resolves the active `group_chat_id` and checks the current user is a member of that group.
- Hangouts, expenses, settlements, and participant lists are filtered to that group only.
- Group participants default from the bot's known roster for that group.

Group id note:

- Telegram group and supergroup ids are stored as signed integers.
- Supergroups usually look like `-1001234567890`.
- This app stores and passes that value as `group_chat_id`.

Forced group selection:

- If you want to pin the app to one Telegram group for now, set `FORCE_GROUP_CHAT_ID` in `finance-miniapp/.env`.
- Example:
  - `FORCE_GROUP_CHAT_ID=-1001234567890`
- After changing it, restart the backend.
- The frontend group picker will still let the user select from the bot's known groups, but the forced id becomes the default active group.

Roster note:

- Telegram bots cannot fetch a full member list for normal groups on demand.
- This app keeps a per-group roster from people who interact in the group and from chat member updates the bot receives.
- That roster is used as the default participant list when creating a hangout.

## HTTPS for Telegram testing (no domain needed)

Telegram Mini Apps require a public `https://` URL. Fastest local test is a tunnel:

1. Build frontend:
```powershell
cd finance-miniapp\frontend-tele
npm run build
```
2. Start backend:
```powershell
cd ..\backend
npm run dev
```
3. Create HTTPS tunnel to backend (example with Cloudflare Tunnel):
```powershell
cloudflared tunnel --url http://localhost:8000
```
4. Copy the generated `https://...trycloudflare.com` URL.
5. Set `MINIAPP_URL` in `finance-miniapp/.env` to:
`https://<your-tunnel-domain>/miniapp`
6. Start bot launcher and test `/start` in Telegram.

Notes:
- With this setup, frontend and backend are same origin over HTTPS.
- API calls use `/api` automatically, so no extra `?api=` parameter is needed.

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

### C) Publish `finance-miniapp/frontend`

Option 1 (recommended simple):
- create a separate repo for frontend and keep `index.html`, `app.js`, `styles.css`, `config.js` at root.

Option 2 (same repo):
- use a workflow or copy frontend files to root/docs for Pages.

### D) Set Mini App URL

In `finance-miniapp/.env`:

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
- `GET /api/hangouts/{id}/detail?chat_id=...`
- `GET /api/hangouts/{id}/people?chat_id=...`
- `GET /api/hangouts/{id}/expenses?chat_id=...`
- `POST /api/hangouts/{id}/expenses?chat_id=...`
- `POST /api/hangouts/{id}/settlements?chat_id=...`
- `DELETE /api/expenses/{id}?chat_id=...`
- `DELETE /api/hangouts/{id}?chat_id=...`
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
