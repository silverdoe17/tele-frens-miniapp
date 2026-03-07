import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
DB_FILE = ROOT / "finances.db"

app = FastAPI(title="Telegram Finance Mini App API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = db()
    c = conn.cursor()
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS hangouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chat_id INTEGER,
            name TEXT,
            date TEXT,
            created_at TEXT
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hangout_id INTEGER,
            description TEXT,
            total_amount REAL,
            paid_by TEXT,
            splits TEXT,
            created_at TEXT,
            FOREIGN KEY(hangout_id) REFERENCES hangouts(id)
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS settlements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            hangout_id INTEGER,
            from_person TEXT,
            to_person TEXT,
            amount REAL,
            created_at TEXT,
            FOREIGN KEY(hangout_id) REFERENCES hangouts(id)
        )
        """
    )
    conn.commit()
    conn.close()


class HangoutCreate(BaseModel):
    chat_id: int
    name: str = Field(min_length=1)
    date: str = Field(min_length=1)


class ExpenseCreate(BaseModel):
    description: str = Field(min_length=1)
    total_amount: float
    paid_by: str = Field(min_length=1)
    splits: dict[str, float]


class SettlementCreate(BaseModel):
    from_person: str
    to_person: str
    amount: float


def calculate_hangout_balances(hangout_id: int) -> dict[str, float]:
    conn = db()
    c = conn.cursor()
    c.execute(
        "SELECT paid_by, total_amount, splits FROM expenses WHERE hangout_id=?",
        (hangout_id,),
    )
    expense_rows = c.fetchall()
    c.execute(
        "SELECT from_person, to_person, amount FROM settlements WHERE hangout_id=?",
        (hangout_id,),
    )
    settlement_rows = c.fetchall()
    conn.close()

    balances: dict[str, float] = {}
    for row in expense_rows:
        paid_by = row["paid_by"]
        total = float(row["total_amount"])
        splits = json.loads(row["splits"])
        balances[paid_by] = balances.get(paid_by, 0.0) + total
        for person, share in splits.items():
            balances[person] = balances.get(person, 0.0) - float(share)

    for row in settlement_rows:
        frm = row["from_person"]
        to = row["to_person"]
        amount = float(row["amount"])
        balances[frm] = balances.get(frm, 0.0) + amount
        balances[to] = balances.get(to, 0.0) - amount

    return balances


def settle_balances(balances: dict[str, float]) -> list[tuple[str, str, float]]:
    creditors = sorted(
        [(p, a) for p, a in balances.items() if a > 0.005],
        key=lambda x: -x[1],
    )
    debtors = sorted(
        [(p, -a) for p, a in balances.items() if a < -0.005],
        key=lambda x: -x[1],
    )

    transactions: list[tuple[str, str, float]] = []
    ci, di = 0, 0
    while ci < len(creditors) and di < len(debtors):
        creditor, credit = creditors[ci]
        debtor, debt = debtors[di]
        amount = min(credit, debt)
        transactions.append((debtor, creditor, round(amount, 2)))
        creditors[ci] = (creditor, credit - amount)
        debtors[di] = (debtor, debt - amount)
        if creditors[ci][1] < 0.005:
            ci += 1
        if debtors[di][1] < 0.005:
            di += 1

    return transactions


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/hangouts")
def get_hangouts(chat_id: int) -> dict[str, Any]:
    conn = db()
    c = conn.cursor()
    c.execute(
        "SELECT id, name, date FROM hangouts WHERE chat_id=? ORDER BY id DESC",
        (chat_id,),
    )
    rows = [dict(r) for r in c.fetchall()]
    conn.close()
    return {"items": rows}


@app.post("/api/hangouts")
def create_hangout(payload: HangoutCreate) -> dict[str, Any]:
    conn = db()
    c = conn.cursor()
    c.execute(
        "INSERT INTO hangouts (chat_id, name, date, created_at) VALUES (?,?,?,?)",
        (payload.chat_id, payload.name.strip(), payload.date.strip(), datetime.now().isoformat()),
    )
    hid = c.lastrowid
    conn.commit()
    conn.close()
    return {"id": hid}


@app.get("/api/hangouts/{hangout_id}/expenses")
def get_expenses(hangout_id: int, chat_id: int) -> dict[str, Any]:
    conn = db()
    c = conn.cursor()
    c.execute("SELECT id FROM hangouts WHERE id=? AND chat_id=?", (hangout_id, chat_id))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Hangout not found")

    c.execute(
        "SELECT id, description, total_amount, paid_by, splits, created_at FROM expenses WHERE hangout_id=? ORDER BY created_at",
        (hangout_id,),
    )
    items = []
    for r in c.fetchall():
        d = dict(r)
        d["splits"] = json.loads(d["splits"])
        items.append(d)
    conn.close()
    return {"items": items}


@app.post("/api/hangouts/{hangout_id}/expenses")
def add_expense(hangout_id: int, chat_id: int, payload: ExpenseCreate) -> dict[str, Any]:
    if abs(sum(payload.splits.values()) - payload.total_amount) > 0.01:
        raise HTTPException(status_code=400, detail="Splits must equal total")

    conn = db()
    c = conn.cursor()
    c.execute("SELECT id FROM hangouts WHERE id=? AND chat_id=?", (hangout_id, chat_id))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Hangout not found")

    c.execute(
        "INSERT INTO expenses (hangout_id, description, total_amount, paid_by, splits, created_at) VALUES (?,?,?,?,?,?)",
        (
            hangout_id,
            payload.description.strip(),
            payload.total_amount,
            payload.paid_by.strip(),
            json.dumps(payload.splits),
            datetime.now().isoformat(),
        ),
    )
    expense_id = c.lastrowid
    conn.commit()
    conn.close()
    return {"id": expense_id}


@app.post("/api/hangouts/{hangout_id}/settlements")
def add_settlement(hangout_id: int, chat_id: int, payload: SettlementCreate) -> dict[str, Any]:
    conn = db()
    c = conn.cursor()
    c.execute("SELECT id FROM hangouts WHERE id=? AND chat_id=?", (hangout_id, chat_id))
    if not c.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Hangout not found")

    c.execute(
        "INSERT INTO settlements (hangout_id, from_person, to_person, amount, created_at) VALUES (?,?,?,?,?)",
        (
            hangout_id,
            payload.from_person.strip(),
            payload.to_person.strip(),
            payload.amount,
            datetime.now().isoformat(),
        ),
    )
    sid = c.lastrowid
    conn.commit()
    conn.close()
    return {"id": sid}


@app.get("/api/summary")
def get_summary(chat_id: int) -> dict[str, Any]:
    conn = db()
    c = conn.cursor()
    c.execute("SELECT id, name, date FROM hangouts WHERE chat_id=?", (chat_id,))
    hangouts = [dict(r) for r in c.fetchall()]
    conn.close()

    balances: dict[str, float] = {}
    for h in hangouts:
        hb = calculate_hangout_balances(h["id"])
        for person, amount in hb.items():
            balances[person] = balances.get(person, 0.0) + amount

    unsettled = {k: v for k, v in balances.items() if abs(v) >= 0.005}
    transactions = settle_balances(unsettled)
    return {
        "unsettled_balances": unsettled,
        "to_settle": [
            {"from": d, "to": c, "amount": a} for d, c, a in transactions
        ],
    }


@app.get("/api/me")
def me(chat_id: int, user_id: int | None = None) -> dict[str, Any]:
    # Placeholder endpoint for future initData validation + identity checks.
    # During migration, use this to verify Mini App can reach backend.
    return {"chat_id": chat_id, "user_id": user_id, "validated": False}
