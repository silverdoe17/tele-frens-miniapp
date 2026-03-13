const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const Database = require("better-sqlite3");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const BOT_TOKEN = process.env.BOT_TOKEN || "";
const INIT_DATA_MAX_AGE_SECONDS = Number(process.env.INIT_DATA_MAX_AGE_SECONDS || 86400);

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.resolve(__dirname, "..", "..", "finances.db");
const FRONTEND_DIST = path.resolve(__dirname, "..", "frontend-tele", "dist");
const db = new Database(DB_FILE);

function nowIso() {
  return new Date().toISOString();
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hangouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      name TEXT,
      date TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hangout_id INTEGER,
      description TEXT,
      total_amount REAL,
      paid_by TEXT,
      splits TEXT,
      created_at TEXT,
      FOREIGN KEY(hangout_id) REFERENCES hangouts(id)
    );

    CREATE TABLE IF NOT EXISTS settlements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hangout_id INTEGER,
      from_person TEXT,
      to_person TEXT,
      amount REAL,
      created_at TEXT,
      FOREIGN KEY(hangout_id) REFERENCES hangouts(id)
    );

    CREATE TABLE IF NOT EXISTS hangout_people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hangout_id INTEGER,
      person_name TEXT,
      FOREIGN KEY(hangout_id) REFERENCES hangouts(id)
    );

    CREATE TABLE IF NOT EXISTS chat_people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      name TEXT
    );

    CREATE TABLE IF NOT EXISTS group_chats (
      chat_id INTEGER PRIMARY KEY,
      title TEXT,
      type TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS group_members (
      chat_id INTEGER,
      user_id INTEGER,
      username TEXT,
      display_name TEXT,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT,
      PRIMARY KEY (chat_id, user_id)
    );
  `);

  const cols = db.prepare("PRAGMA table_info(hangouts)").all();
  const hasLocation = cols.some((c) => c.name === "location");
  if (!hasLocation) {
    db.exec("ALTER TABLE hangouts ADD COLUMN location TEXT");
  }
}

function safeJsonParse(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function displayNameFromTelegramUser(user) {
  if (!user) return "";
  if (user.username) return `@${user.username}`;
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return fullName || String(user.id || "");
}

function parseGroupChatId(input) {
  if (input === undefined || input === null || input === "") return null;
  const value = Number(input);
  return Number.isFinite(value) ? value : null;
}

function parseGroupChatIdFromStartParam(startParam) {
  const match = /^group_(-?\d+)$/.exec(String(startParam || "").trim());
  return match ? Number(match[1]) : null;
}

function buildDataCheckString(params) {
  return Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function validateInitData(rawInitData) {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing in backend .env");
  }

  const params = new URLSearchParams(String(rawInitData || ""));
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("initData hash is missing");
  }

  const dataCheckString = buildDataCheckString(params);
  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const computedHash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computedHash, "hex"))) {
    throw new Error("initData signature mismatch");
  }

  const authDate = Number(params.get("auth_date") || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!authDate || now - authDate > INIT_DATA_MAX_AGE_SECONDS) {
    throw new Error("initData has expired");
  }

  return params;
}

async function telegramApi(method, params) {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is missing in backend .env");
  }

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const body = await res.json();
  if (!res.ok || !body.ok) {
    throw new Error(body.description || `Telegram API ${method} failed`);
  }
  return body.result;
}

function isActiveMemberStatus(status) {
  return ["creator", "administrator", "member", "restricted"].includes(String(status || ""));
}

function upsertGroupChat(chatId, title, type) {
  db.prepare(
    `INSERT INTO group_chats (chat_id, title, type, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET
       title=excluded.title,
       type=excluded.type,
       updated_at=excluded.updated_at`
  ).run(chatId, String(title || `Chat ${chatId}`), String(type || "group"), nowIso());
}

function upsertGroupMember(chatId, user, isActive = 1) {
  if (!chatId || !user || !user.id) return;
  db.prepare(
    `INSERT INTO group_members (chat_id, user_id, username, display_name, is_active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chat_id, user_id) DO UPDATE SET
       username=excluded.username,
       display_name=excluded.display_name,
       is_active=excluded.is_active,
       updated_at=excluded.updated_at`
  ).run(
    chatId,
    Number(user.id),
    user.username ? String(user.username) : null,
    displayNameFromTelegramUser(user),
    isActive ? 1 : 0,
    nowIso()
  );
}

function listAccessibleGroups(userId) {
  return db
    .prepare(
      `SELECT gc.chat_id, gc.title, gc.type
       FROM group_members gm
       JOIN group_chats gc ON gc.chat_id = gm.chat_id
       WHERE gm.user_id=? AND gm.is_active=1
       ORDER BY gc.title COLLATE NOCASE ASC`
    )
    .all(Number(userId));
}

function listGroupRoster(chatId) {
  return db
    .prepare(
      `SELECT display_name
       FROM group_members
       WHERE chat_id=? AND is_active=1
       ORDER BY display_name COLLATE NOCASE ASC`
    )
    .all(chatId)
    .map((row) => row.display_name)
    .filter(Boolean);
}

function upsertChatPeople(chatId, names) {
  const insertStmt = db.prepare("INSERT INTO chat_people (chat_id, name) VALUES (?, ?)");
  for (const rawName of names || []) {
    const name = String(rawName || "").trim();
    if (!name) continue;
    const exists = db
      .prepare("SELECT 1 FROM chat_people WHERE chat_id=? AND LOWER(name)=LOWER(?) LIMIT 1")
      .get(chatId, name);
    if (!exists) insertStmt.run(chatId, name);
  }
}

function listGroupPeople(chatId) {
  const set = new Set(listGroupRoster(chatId));

  const customPeople = db
    .prepare("SELECT name FROM chat_people WHERE chat_id=? ORDER BY name COLLATE NOCASE ASC")
    .all(chatId);
  for (const row of customPeople) {
    if (row.name) set.add(row.name);
  }

  const expenseRows = db
    .prepare(
      `SELECT e.paid_by, e.splits
       FROM expenses e
       JOIN hangouts h ON h.id=e.hangout_id
       WHERE h.chat_id=?`
    )
    .all(chatId);
  for (const row of expenseRows) {
    if (row.paid_by) set.add(row.paid_by);
    const splits = safeJsonParse(row.splits, {});
    for (const name of Object.keys(splits || {})) {
      if (name) set.add(name);
    }
  }

  const settlementRows = db
    .prepare(
      `SELECT s.from_person, s.to_person
       FROM settlements s
       JOIN hangouts h ON h.id=s.hangout_id
       WHERE h.chat_id=?`
    )
    .all(chatId);
  for (const row of settlementRows) {
    if (row.from_person) set.add(row.from_person);
    if (row.to_person) set.add(row.to_person);
  }

  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function getHangoutForChat(hangoutId, chatId) {
  return db
    .prepare("SELECT id, chat_id, name, date, location FROM hangouts WHERE id=? AND chat_id=?")
    .get(hangoutId, chatId);
}

function listHangoutPeople(hangoutId) {
  return db
    .prepare("SELECT person_name FROM hangout_people WHERE hangout_id=? ORDER BY person_name COLLATE NOCASE ASC")
    .all(hangoutId)
    .map((row) => row.person_name);
}

function setHangoutPeople(hangoutId, names) {
  const uniqueNames = Array.from(
    new Set(
      (names || [])
        .map((name) => String(name || "").trim())
        .filter(Boolean)
    )
  );

  db.prepare("DELETE FROM hangout_people WHERE hangout_id=?").run(hangoutId);
  const stmt = db.prepare("INSERT INTO hangout_people (hangout_id, person_name) VALUES (?, ?)");
  for (const name of uniqueNames) {
    stmt.run(hangoutId, name);
  }
}

function listSettlementsForHangout(hangoutId) {
  return db
    .prepare(
      "SELECT id, from_person, to_person, amount, created_at FROM settlements WHERE hangout_id=? ORDER BY created_at"
    )
    .all(hangoutId);
}

function listSettlementsForChat(chatId) {
  return db
    .prepare(
      `SELECT s.id, s.from_person, s.to_person, s.amount, s.created_at, h.name AS hangout_name, h.date AS hangout_date
       FROM settlements s
       JOIN hangouts h ON h.id = s.hangout_id
       WHERE h.chat_id=?
       ORDER BY s.created_at`
    )
    .all(chatId);
}

function listExpensesForHangout(hangoutId) {
  return db
    .prepare(
      "SELECT id, description, total_amount, paid_by, splits, created_at FROM expenses WHERE hangout_id=? ORDER BY created_at"
    )
    .all(hangoutId)
    .map((row) => ({ ...row, splits: safeJsonParse(row.splits, {}) }));
}

function calculateHangoutBalances(hangoutId) {
  const expenseRows = db
    .prepare("SELECT paid_by, total_amount, splits FROM expenses WHERE hangout_id=?")
    .all(hangoutId);
  const settlementRows = db
    .prepare("SELECT from_person, to_person, amount FROM settlements WHERE hangout_id=?")
    .all(hangoutId);

  const balances = {};
  for (const row of expenseRows) {
    const paidBy = row.paid_by;
    const total = Number(row.total_amount);
    const splits = safeJsonParse(row.splits, {});

    balances[paidBy] = (balances[paidBy] || 0) + total;
    for (const [person, share] of Object.entries(splits)) {
      balances[person] = (balances[person] || 0) - Number(share);
    }
  }

  for (const row of settlementRows) {
    balances[row.from_person] = (balances[row.from_person] || 0) + Number(row.amount);
    balances[row.to_person] = (balances[row.to_person] || 0) - Number(row.amount);
  }

  return balances;
}

function settleBalances(balances) {
  const creditors = Object.entries(balances)
    .filter(([, amount]) => amount > 0.005)
    .sort((a, b) => b[1] - a[1]);
  const debtors = Object.entries(balances)
    .filter(([, amount]) => amount < -0.005)
    .map(([person, amount]) => [person, -amount])
    .sort((a, b) => b[1] - a[1]);

  const transactions = [];
  let creditorIndex = 0;
  let debtorIndex = 0;

  while (creditorIndex < creditors.length && debtorIndex < debtors.length) {
    const [creditor, credit] = creditors[creditorIndex];
    const [debtor, debt] = debtors[debtorIndex];
    const amount = Math.min(credit, debt);

    transactions.push([debtor, creditor, Number(amount.toFixed(2))]);
    creditors[creditorIndex][1] = credit - amount;
    debtors[debtorIndex][1] = debt - amount;

    if (creditors[creditorIndex][1] < 0.005) creditorIndex += 1;
    if (debtors[debtorIndex][1] < 0.005) debtorIndex += 1;
  }

  return transactions;
}

function isSettled(balances) {
  return Object.values(balances).every((value) => Math.abs(Number(value)) < 0.005);
}

async function ensureGroupMembership(chatId, user) {
  const member = await telegramApi("getChatMember", {
    chat_id: chatId,
    user_id: Number(user.id),
  });

  if (!isActiveMemberStatus(member.status)) {
    throw new Error("User is not an active member of this group");
  }

  const chat = await telegramApi("getChat", { chat_id: chatId });
  upsertGroupChat(chatId, chat.title, chat.type);
  upsertGroupMember(chatId, user, 1);
  return chat;
}

async function requireTelegramContext(req, res, next) {
  try {
    const rawInitData =
      req.get("x-telegram-init-data") ||
      req.body?.init_data ||
      req.query.init_data;

    if (!rawInitData) {
      return res.status(401).json({ detail: "Telegram initData is required" });
    }

    const params = validateInitData(rawInitData);
    const user = safeJsonParse(params.get("user"), null);
    if (!user || !user.id) {
      return res.status(401).json({ detail: "Telegram user payload is missing" });
    }

    const requestedGroupChatId =
      parseGroupChatId(req.query.group_chat_id) ||
      parseGroupChatId(req.body?.group_chat_id) ||
      parseGroupChatIdFromStartParam(params.get("start_param"));

    let groups = listAccessibleGroups(user.id);
    let groupChatId = requestedGroupChatId || groups[0]?.chat_id || null;

    if (groupChatId) {
      const knownGroup = groups.some((group) => Number(group.chat_id) === Number(groupChatId));
      if (!knownGroup) {
        await ensureGroupMembership(groupChatId, user);
        groups = listAccessibleGroups(user.id);
      } else {
        upsertGroupMember(groupChatId, user, 1);
      }
    }

    req.auth = {
      initData: params,
      rawInitData: String(rawInitData),
      user,
      userDisplayName: displayNameFromTelegramUser(user),
      groupChatId,
      groups,
    };
    next();
  } catch (error) {
    res.status(401).json({ detail: error.message || "Telegram auth failed" });
  }
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", requireTelegramContext);

app.get("/api/me", (req, res) => {
  res.json({
    validated: true,
    user: {
      id: Number(req.auth.user.id),
      username: req.auth.user.username || null,
      display_name: req.auth.userDisplayName,
    },
    group_chat_id: req.auth.groupChatId,
    groups: req.auth.groups,
  });
});

app.get("/api/groups", (req, res) => {
  res.json({ items: req.auth.groups });
});

app.get("/api/hangouts", (req, res) => {
  const chatId = req.auth.groupChatId;
  if (!chatId) return res.json({ items: [] });

  const onlyUnsettled = String(req.query.unsettled_only || "false") === "true";
  let items = db
    .prepare("SELECT id, name, date, location FROM hangouts WHERE chat_id=? ORDER BY id DESC")
    .all(chatId)
    .map((hangout) => {
      const balances = calculateHangoutBalances(hangout.id);
      return {
        ...hangout,
        settled: isSettled(balances),
        participants: listHangoutPeople(hangout.id),
      };
    });

  if (onlyUnsettled) {
    items = items.filter((hangout) => !hangout.settled);
  }

  res.json({ items });
});

app.post("/api/hangouts", (req, res) => {
  const chatId = req.auth.groupChatId;
  const { name, date, location, participants } = req.body || {};
  if (!chatId || !name || !date) {
    return res.status(400).json({ detail: "group_chat_id, name, and date are required" });
  }

  const defaultParticipants = Array.isArray(participants) && participants.length
    ? participants
    : listGroupRoster(chatId);

  const out = db
    .prepare("INSERT INTO hangouts (chat_id, name, date, location, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(chatId, String(name).trim(), String(date).trim(), String(location || "").trim(), nowIso());

  setHangoutPeople(Number(out.lastInsertRowid), defaultParticipants);
  upsertChatPeople(chatId, defaultParticipants);
  res.json({ id: out.lastInsertRowid });
});

app.patch("/api/hangouts/:hangoutId", (req, res) => {
  const hangoutId = Number(req.params.hangoutId);
  const chatId = req.auth.groupChatId;
  const hangout = getHangoutForChat(hangoutId, chatId);
  if (!hangout) return res.status(404).json({ detail: "Hangout not found" });

  const { name, date, location, participants } = req.body || {};
  db.prepare("UPDATE hangouts SET name=?, date=?, location=? WHERE id=? AND chat_id=?").run(
    name !== undefined ? String(name).trim() : hangout.name,
    date !== undefined ? String(date).trim() : hangout.date,
    location !== undefined ? String(location).trim() : hangout.location,
    hangoutId,
    chatId
  );

  if (Array.isArray(participants)) {
    setHangoutPeople(hangoutId, participants);
    upsertChatPeople(chatId, participants);
  }

  res.json({ updated: true, id: hangoutId });
});

app.delete("/api/hangouts/:hangoutId", (req, res) => {
  const hangoutId = Number(req.params.hangoutId);
  const chatId = req.auth.groupChatId;
  if (!getHangoutForChat(hangoutId, chatId)) {
    return res.status(404).json({ detail: "Hangout not found" });
  }

  db.prepare("DELETE FROM settlements WHERE hangout_id=?").run(hangoutId);
  db.prepare("DELETE FROM expenses WHERE hangout_id=?").run(hangoutId);
  db.prepare("DELETE FROM hangout_people WHERE hangout_id=?").run(hangoutId);
  db.prepare("DELETE FROM hangouts WHERE id=? AND chat_id=?").run(hangoutId, chatId);
  res.json({ deleted: true, id: hangoutId });
});

app.get("/api/people", (req, res) => {
  const chatId = req.auth.groupChatId;
  if (!chatId) return res.json({ items: [req.auth.userDisplayName].filter(Boolean) });

  const items = listGroupPeople(chatId);
  if (req.auth.userDisplayName && !items.some((name) => name.toLowerCase() === req.auth.userDisplayName.toLowerCase())) {
    items.unshift(req.auth.userDisplayName);
  }
  res.json({ items: Array.from(new Set(items)) });
});

app.post("/api/people", (req, res) => {
  const chatId = req.auth.groupChatId;
  const name = String(req.body?.name || "").trim();
  if (!chatId || !name) {
    return res.status(400).json({ detail: "group_chat_id and name are required" });
  }

  upsertChatPeople(chatId, [name]);
  res.json({ ok: true });
});

app.get("/api/hangouts/:hangoutId/people", (req, res) => {
  const hangoutId = Number(req.params.hangoutId);
  const chatId = req.auth.groupChatId;
  if (!getHangoutForChat(hangoutId, chatId)) {
    return res.status(404).json({ detail: "Hangout not found" });
  }

  const people = new Set(listHangoutPeople(hangoutId));
  for (const name of listGroupPeople(chatId)) {
    people.add(name);
  }
  res.json({ items: Array.from(people).sort((a, b) => a.localeCompare(b)) });
});

app.get("/api/hangouts/:hangoutId/expenses", (req, res) => {
  const hangoutId = Number(req.params.hangoutId);
  const chatId = req.auth.groupChatId;
  if (!getHangoutForChat(hangoutId, chatId)) {
    return res.status(404).json({ detail: "Hangout not found" });
  }

  res.json({ items: listExpensesForHangout(hangoutId) });
});

app.get("/api/hangouts/:hangoutId/detail", (req, res) => {
  const hangoutId = Number(req.params.hangoutId);
  const chatId = req.auth.groupChatId;
  const hangout = getHangoutForChat(hangoutId, chatId);
  if (!hangout) return res.status(404).json({ detail: "Hangout not found" });

  const expenses = listExpensesForHangout(hangoutId);
  const settlements = listSettlementsForHangout(hangoutId);
  const balances = calculateHangoutBalances(hangoutId);
  const unsettledBalances = Object.fromEntries(
    Object.entries(balances).filter(([, amount]) => Math.abs(Number(amount)) >= 0.005)
  );
  const toSettle = settleBalances(unsettledBalances).map(([from, to, amount]) => ({ from, to, amount }));

  res.json({
    hangout: { ...hangout, participants: listHangoutPeople(hangoutId) },
    expenses,
    settled_payments: settlements,
    unsettled_balances: unsettledBalances,
    to_settle: toSettle,
    settled: toSettle.length === 0,
  });
});

app.post("/api/hangouts/:hangoutId/expenses", (req, res) => {
  const hangoutId = Number(req.params.hangoutId);
  const chatId = req.auth.groupChatId;
  const { description, total_amount, paid_by, splits } = req.body || {};
  if (!getHangoutForChat(hangoutId, chatId)) {
    return res.status(404).json({ detail: "Hangout not found" });
  }

  const total = Number(total_amount || 0);
  const splitTotal = Object.values(splits || {}).reduce((sum, amount) => sum + Number(amount), 0);
  if (Math.abs(splitTotal - total) > 0.01) {
    return res.status(400).json({ detail: "Splits must equal total" });
  }

  const involvedPeople = [String(paid_by || "").trim(), ...Object.keys(splits || {})].filter(Boolean);
  upsertChatPeople(chatId, involvedPeople);

  const out = db
    .prepare(
      "INSERT INTO expenses (hangout_id, description, total_amount, paid_by, splits, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      hangoutId,
      String(description || "").trim(),
      total,
      String(paid_by || "").trim(),
      JSON.stringify(splits || {}),
      nowIso()
    );

  res.json({ id: out.lastInsertRowid });
});

app.put("/api/expenses/:expenseId", (req, res) => {
  const expenseId = Number(req.params.expenseId);
  const chatId = req.auth.groupChatId;
  const { description, total_amount, paid_by, splits } = req.body || {};

  const expense = db
    .prepare(
      `SELECT e.id, e.hangout_id
       FROM expenses e
       JOIN hangouts h ON h.id = e.hangout_id
       WHERE e.id=? AND h.chat_id=?`
    )
    .get(expenseId, chatId);
  if (!expense) return res.status(404).json({ detail: "Expense not found" });

  const total = Number(total_amount || 0);
  const splitTotal = Object.values(splits || {}).reduce((sum, amount) => sum + Number(amount), 0);
  if (Math.abs(splitTotal - total) > 0.01) {
    return res.status(400).json({ detail: "Splits must equal total" });
  }

  const involvedPeople = [String(paid_by || "").trim(), ...Object.keys(splits || {})].filter(Boolean);
  upsertChatPeople(chatId, involvedPeople);

  db.prepare("UPDATE expenses SET description=?, total_amount=?, paid_by=?, splits=? WHERE id=?").run(
    String(description || "").trim(),
    total,
    String(paid_by || "").trim(),
    JSON.stringify(splits || {}),
    expenseId
  );

  res.json({ updated: true, id: expenseId });
});

app.delete("/api/expenses/:expenseId", (req, res) => {
  const expenseId = Number(req.params.expenseId);
  const chatId = req.auth.groupChatId;

  const expense = db
    .prepare(
      `SELECT e.id, e.hangout_id
       FROM expenses e
       JOIN hangouts h ON h.id = e.hangout_id
       WHERE e.id=? AND h.chat_id=?`
    )
    .get(expenseId, chatId);
  if (!expense) return res.status(404).json({ detail: "Expense not found" });

  db.prepare("DELETE FROM expenses WHERE id=?").run(expenseId);
  res.json({ deleted: true, id: expenseId, hangout_id: expense.hangout_id });
});

app.post("/api/hangouts/:hangoutId/settlements", (req, res) => {
  const hangoutId = Number(req.params.hangoutId);
  const chatId = req.auth.groupChatId;
  const { from_person, to_person, amount } = req.body || {};
  if (!getHangoutForChat(hangoutId, chatId)) {
    return res.status(404).json({ detail: "Hangout not found" });
  }

  upsertChatPeople(chatId, [from_person, to_person].filter(Boolean));

  const out = db
    .prepare("INSERT INTO settlements (hangout_id, from_person, to_person, amount, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(hangoutId, String(from_person || "").trim(), String(to_person || "").trim(), Number(amount || 0), nowIso());

  res.json({ id: out.lastInsertRowid });
});

app.get("/api/summary", (req, res) => {
  const chatId = req.auth.groupChatId;
  if (!chatId) {
    return res.json({
      total_spent: 0,
      unsettled_balances: {},
      settled_payments: [],
      to_settle: [],
      settled: true,
    });
  }

  const hangouts = db.prepare("SELECT id FROM hangouts WHERE chat_id=?").all(chatId);
  const balances = {};
  for (const hangout of hangouts) {
    const hangoutBalances = calculateHangoutBalances(hangout.id);
    for (const [person, amount] of Object.entries(hangoutBalances)) {
      balances[person] = (balances[person] || 0) + Number(amount);
    }
  }

  const unsettledBalances = Object.fromEntries(
    Object.entries(balances).filter(([, amount]) => Math.abs(amount) >= 0.005)
  );
  const toSettle = settleBalances(unsettledBalances).map(([from, to, amount]) => ({ from, to, amount }));
  const settledPayments = listSettlementsForChat(chatId);
  const totalSpentRow = db
    .prepare(
      `SELECT COALESCE(SUM(e.total_amount), 0) AS total_spent
       FROM expenses e
       JOIN hangouts h ON h.id = e.hangout_id
       WHERE h.chat_id=?`
    )
    .get(chatId);

  res.json({
    total_spent: Number(totalSpentRow.total_spent || 0),
    unsettled_balances: unsettledBalances,
    settled_payments: settledPayments,
    to_settle: toSettle,
    settled: toSettle.length === 0,
  });
});

if (fs.existsSync(FRONTEND_DIST)) {
  app.use("/miniapp", express.static(FRONTEND_DIST));
  app.get("/miniapp/*", (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
}

initDb();
const PORT = Number(process.env.PORT || 8000);
app.listen(PORT, () => {
  console.log(`Node backend running on :${PORT}`);
});
