const path = require("path");
const express = require("express");
const cors = require("cors");
const Database = require("better-sqlite3");

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.resolve(__dirname, "..", "..", "finances.db");
const db = new Database(DB_FILE);

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
  `);

  const cols = db.prepare("PRAGMA table_info(hangouts)").all();
  const hasLocation = cols.some((c) => c.name === "location");
  if (!hasLocation) {
    db.exec("ALTER TABLE hangouts ADD COLUMN location TEXT");
  }
}

function nowIso() {
  return new Date().toISOString();
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
    .map((r) => r.person_name);
}

function setHangoutPeople(hangoutId, names) {
  const uniqueNames = Array.from(
    new Set(
      (names || [])
        .map((n) => String(n || "").trim())
        .filter(Boolean)
    )
  );

  db.prepare("DELETE FROM hangout_people WHERE hangout_id=?").run(hangoutId);
  const stmt = db.prepare("INSERT INTO hangout_people (hangout_id, person_name) VALUES (?,?)");
  for (const name of uniqueNames) {
    stmt.run(hangoutId, name);
  }
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

function listChatPeople(chatId) {
  return db
    .prepare("SELECT name FROM chat_people WHERE chat_id=? ORDER BY name COLLATE NOCASE ASC")
    .all(chatId)
    .map((r) => r.name);
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
    .map((r) => ({ ...r, splits: JSON.parse(r.splits || "{}") }));
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
    const splits = JSON.parse(row.splits || "{}");
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
    .filter(([, a]) => a > 0.005)
    .sort((a, b) => b[1] - a[1]);
  const debtors = Object.entries(balances)
    .filter(([, a]) => a < -0.005)
    .map(([p, a]) => [p, -a])
    .sort((a, b) => b[1] - a[1]);

  const transactions = [];
  let ci = 0;
  let di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const [creditor, credit] = creditors[ci];
    const [debtor, debt] = debtors[di];
    const amount = Math.min(credit, debt);
    transactions.push([debtor, creditor, Number(amount.toFixed(2))]);

    creditors[ci][1] = credit - amount;
    debtors[di][1] = debt - amount;

    if (creditors[ci][1] < 0.005) ci += 1;
    if (debtors[di][1] < 0.005) di += 1;
  }

  return transactions;
}

function isSettled(balances) {
  return Object.values(balances).every((v) => Math.abs(Number(v)) < 0.005);
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/hangouts", (req, res) => {
  const chatId = Number(req.query.chat_id);
  const onlyUnsettled = String(req.query.unsettled_only || "false") === "true";

  let items = db
    .prepare("SELECT id, name, date, location FROM hangouts WHERE chat_id=? ORDER BY id DESC")
    .all(chatId)
    .map((h) => {
      const balances = calculateHangoutBalances(h.id);
      const settled = isSettled(balances);
      return { ...h, settled, participants: listHangoutPeople(h.id) };
    });

  if (onlyUnsettled) {
    items = items.filter((h) => !h.settled);
  }

  res.json({ items });
});

app.post("/api/hangouts", (req, res) => {
  const { chat_id, name, date, location, participants } = req.body || {};
  if (!chat_id || !name || !date) {
    return res.status(400).json({ detail: "chat_id, name, date are required" });
  }

  const out = db
    .prepare("INSERT INTO hangouts (chat_id, name, date, location, created_at) VALUES (?,?,?,?,?)")
    .run(Number(chat_id), String(name).trim(), String(date).trim(), String(location || "").trim(), nowIso());
  setHangoutPeople(Number(out.lastInsertRowid), participants || []);
  upsertChatPeople(Number(chat_id), participants || []);
  res.json({ id: out.lastInsertRowid });
});

app.patch("/api/hangouts/:hangoutId", (req, res) => {
  const hangoutId = Number(req.params.hangoutId);
  const chatId = Number(req.query.chat_id);
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

app.get("/api/people", (req, res) => {
  const chatId = Number(req.query.chat_id);
  if (!chatId) return res.json({ items: [] });

  const fromCatalog = listChatPeople(chatId);
  const fromExpenses = db
    .prepare(
      `SELECT e.paid_by, e.splits
       FROM expenses e
       JOIN hangouts h ON h.id=e.hangout_id
       WHERE h.chat_id=?`
    )
    .all(chatId);

  const set = new Set(fromCatalog);
  for (const row of fromExpenses) {
    if (row.paid_by) set.add(row.paid_by);
    const splits = JSON.parse(row.splits || "{}");
    for (const name of Object.keys(splits || {})) set.add(name);
  }

  const fromSettlements = db
    .prepare(
      `SELECT s.from_person, s.to_person
       FROM settlements s
       JOIN hangouts h ON h.id=s.hangout_id
       WHERE h.chat_id=?`
    )
    .all(chatId);
  for (const row of fromSettlements) {
    if (row.from_person) set.add(row.from_person);
    if (row.to_person) set.add(row.to_person);
  }

  const items = Array.from(set).sort((a, b) => a.localeCompare(b));
  res.json({ items });
});

app.post("/api/people", (req, res) => {
  const { chat_id, name } = req.body || {};
  if (!chat_id || !name) return res.status(400).json({ detail: "chat_id and name are required" });
  upsertChatPeople(Number(chat_id), [name]);
  res.json({ ok: true });
});

app.get("/api/hangouts/:hangoutId/people", (req, res) => {
  const hangoutId = Number(req.params.hangoutId);
  const chatId = Number(req.query.chat_id);
  if (!getHangoutForChat(hangoutId, chatId)) return res.status(404).json({ detail: "Hangout not found" });

  const people = new Set(listHangoutPeople(hangoutId));
  const expenseRows = db.prepare("SELECT paid_by, splits FROM expenses WHERE hangout_id=?").all(hangoutId);
  for (const row of expenseRows) {
    if (row.paid_by) people.add(row.paid_by);
    const splits = JSON.parse(row.splits || "{}");
    Object.keys(splits).forEach((p) => people.add(p));
  }

  const settlementRows = db
    .prepare("SELECT from_person, to_person FROM settlements WHERE hangout_id=?")
    .all(hangoutId);
  for (const row of settlementRows) {
    if (row.from_person) people.add(row.from_person);
    if (row.to_person) people.add(row.to_person);
  }

  res.json({ items: Array.from(people).sort((a, b) => a.localeCompare(b)) });
});

app.get("/api/hangouts/:hangoutId/expenses", (req, res) => {
  const hangoutId = Number(req.params.hangoutId);
  const chatId = Number(req.query.chat_id);

  if (!getHangoutForChat(hangoutId, chatId)) return res.status(404).json({ detail: "Hangout not found" });
  const items = listExpensesForHangout(hangoutId);
  res.json({ items });
});

app.get("/api/hangouts/:hangoutId/detail", (req, res) => {
  const hangoutId = Number(req.params.hangoutId);
  const chatId = Number(req.query.chat_id);

  const hangout = getHangoutForChat(hangoutId, chatId);
  if (!hangout) return res.status(404).json({ detail: "Hangout not found" });

  const expenses = listExpensesForHangout(hangoutId);
  const settlements = listSettlementsForHangout(hangoutId);
  const balances = calculateHangoutBalances(hangoutId);
  const unsettledBalances = Object.fromEntries(Object.entries(balances).filter(([, a]) => Math.abs(Number(a)) >= 0.005));
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
  const chatId = Number(req.query.chat_id);
  const { description, total_amount, paid_by, splits } = req.body || {};

  if (!getHangoutForChat(hangoutId, chatId)) return res.status(404).json({ detail: "Hangout not found" });

  const total = Number(total_amount || 0);
  const splitTotal = Object.values(splits || {}).reduce((a, b) => a + Number(b), 0);
  if (Math.abs(splitTotal - total) > 0.01) {
    return res.status(400).json({ detail: "Splits must equal total" });
  }

  const out = db
    .prepare(
      "INSERT INTO expenses (hangout_id, description, total_amount, paid_by, splits, created_at) VALUES (?,?,?,?,?,?)"
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
  const chatId = Number(req.query.chat_id);
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
  const splitTotal = Object.values(splits || {}).reduce((a, b) => a + Number(b), 0);
  if (Math.abs(splitTotal - total) > 0.01) {
    return res.status(400).json({ detail: "Splits must equal total" });
  }

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
  const chatId = Number(req.query.chat_id);

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
  const chatId = Number(req.query.chat_id);
  const { from_person, to_person, amount } = req.body || {};

  if (!getHangoutForChat(hangoutId, chatId)) return res.status(404).json({ detail: "Hangout not found" });

  const out = db
    .prepare("INSERT INTO settlements (hangout_id, from_person, to_person, amount, created_at) VALUES (?,?,?,?,?)")
    .run(hangoutId, String(from_person || "").trim(), String(to_person || "").trim(), Number(amount || 0), nowIso());

  res.json({ id: out.lastInsertRowid });
});

app.delete("/api/hangouts/:hangoutId", (req, res) => {
  const hangoutId = Number(req.params.hangoutId);
  const chatId = Number(req.query.chat_id);

  if (!getHangoutForChat(hangoutId, chatId)) return res.status(404).json({ detail: "Hangout not found" });

  db.prepare("DELETE FROM settlements WHERE hangout_id=?").run(hangoutId);
  db.prepare("DELETE FROM expenses WHERE hangout_id=?").run(hangoutId);
  db.prepare("DELETE FROM hangout_people WHERE hangout_id=?").run(hangoutId);
  db.prepare("DELETE FROM hangouts WHERE id=? AND chat_id=?").run(hangoutId, chatId);

  res.json({ deleted: true, id: hangoutId });
});

app.get("/api/summary", (req, res) => {
  const chatId = Number(req.query.chat_id);
  const hangouts = db.prepare("SELECT id FROM hangouts WHERE chat_id=?").all(chatId);

  const balances = {};
  for (const h of hangouts) {
    const hb = calculateHangoutBalances(h.id);
    for (const [person, amount] of Object.entries(hb)) {
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

app.get("/api/me", (req, res) => {
  const chatId = Number(req.query.chat_id);
  const userId = req.query.user_id ? Number(req.query.user_id) : null;
  res.json({ chat_id: chatId, user_id: userId, validated: false });
});

initDb();
const PORT = Number(process.env.PORT || 8000);
app.listen(PORT, () => {
  console.log(`Node backend running on :${PORT}`);
});
