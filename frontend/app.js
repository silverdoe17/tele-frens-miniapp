const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const qs = new URLSearchParams(window.location.search);
function resolveApiBase() {
  const fromQuery = qs.get("api");
  if (fromQuery) return fromQuery.replace(/\/$/, "");

  const fromConfig = window.APP_CONFIG?.API_BASE;
  if (fromConfig) return String(fromConfig).replace(/\/$/, "");

  return window.location.origin.replace(/\/$/, "") + "/api";
}
const API_BASE = resolveApiBase();

const chatInfo = document.getElementById("chatInfo");
const hangoutsList = document.getElementById("hangoutsList");
const summaryBox = document.getElementById("summaryBox");
const hangoutMsg = document.getElementById("hangoutMsg");
const detailTitle = document.getElementById("detailTitle");
const expenseItems = document.getElementById("expenseItems");
const hangoutDetailBox = document.getElementById("hangoutDetailBox");
const deleteHangoutBtn = document.getElementById("deleteHangoutBtn");

let selectedHangout = null;

function fmtMoney(n) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function getChatId() {
  const fromQuery = qs.get("chat_id");
  if (fromQuery) return Number(fromQuery);
  const unsafe = tg?.initDataUnsafe;
  return unsafe?.chat?.id || 0;
}

const chatId = getChatId();
chatInfo.textContent = chatId
  ? `Chat ID: ${chatId} | API: ${API_BASE}`
  : `Chat ID unavailable. For local testing add ?chat_id=<id> | API: ${API_BASE}`;

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json();
}

async function loadHangouts() {
  if (!chatId) return;
  hangoutsList.innerHTML = "<li>Loading...</li>";
  try {
    const data = await api(`/hangouts?chat_id=${chatId}`);
    if (!data.items.length) {
      hangoutsList.innerHTML = "<li>No hangouts yet.</li>";
      return;
    }

    hangoutsList.innerHTML = "";
    for (const h of data.items) {
      const li = document.createElement("li");
      const status = h.settled ? "🟢" : "🔴";
      li.innerHTML = `${status} ${h.name} (${h.date}) `;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "View";
      btn.addEventListener("click", () => loadHangoutDetail(h.id));
      li.appendChild(btn);
      hangoutsList.appendChild(li);
    }
  } catch (err) {
    hangoutsList.innerHTML = `<li>Error: ${err.message}</li>`;
  }
}

async function loadHangoutDetail(hangoutId) {
  selectedHangout = hangoutId;
  deleteHangoutBtn.disabled = false;
  detailTitle.textContent = "Loading...";
  expenseItems.innerHTML = "";
  hangoutDetailBox.textContent = "";

  try {
    const data = await api(`/hangouts/${hangoutId}/detail?chat_id=${chatId}`);
    const h = data.hangout;
    detailTitle.textContent = `${h.name} (${h.date})`;

    if (!data.expenses.length) {
      expenseItems.innerHTML = "<li>No expenses yet.</li>";
    } else {
      for (const exp of data.expenses) {
        const splitText = Object.entries(exp.splits || {})
          .map(([p, a]) => `${p}: ${fmtMoney(a)}`)
          .join(", ");
        const li = document.createElement("li");
        li.innerHTML = `${exp.description} - ${fmtMoney(exp.total_amount)} paid by ${exp.paid_by}<br/>Split: ${splitText}`;

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = "Delete Expense";
        delBtn.addEventListener("click", async () => {
          if (!confirm("Delete this expense?")) return;
          await api(`/expenses/${exp.id}?chat_id=${chatId}`, { method: "DELETE" });
          await loadHangoutDetail(hangoutId);
          await loadHangouts();
          await loadSummary();
        });
        li.appendChild(document.createElement("br"));
        li.appendChild(delBtn);
        expenseItems.appendChild(li);
      }
    }

    const settledLines = (data.settled_payments || []).map(
      (s) => `- ${s.from_person} paid ${s.to_person}: ${fmtMoney(s.amount)}`
    );
    const toSettleLines = (data.to_settle || []).map(
      (t) => `- ${t.from} -> ${t.to}: ${fmtMoney(t.amount)}`
    );

    hangoutDetailBox.textContent = [
      `Status: ${data.settled ? "🟢 Settled" : "🔴 Not settled"}`,
      "",
      "Settled payments:",
      settledLines.length ? settledLines.join("\n") : "- none",
      "",
      "To settle up:",
      toSettleLines.length ? toSettleLines.join("\n") : "- all settled",
    ].join("\n");
  } catch (err) {
    detailTitle.textContent = "Error loading details";
    hangoutDetailBox.textContent = err.message;
  }
}

async function loadSummary() {
  if (!chatId) return;
  summaryBox.textContent = "Loading...";
  try {
    const data = await api(`/summary?chat_id=${chatId}`);
    const lines = [];
    lines.push(`Total spent: ${fmtMoney(data.total_spent)}`);
    lines.push("");
    lines.push("Settled payments:");
    if (!data.settled_payments?.length) {
      lines.push("- none");
    } else {
      for (const s of data.settled_payments) {
        lines.push(`- ${s.from_person} paid ${s.to_person}: ${fmtMoney(s.amount)} (${s.hangout_name} - ${s.hangout_date})`);
      }
    }

    lines.push("\nOutstanding balances:");
    const entries = Object.entries(data.unsettled_balances || {});
    if (!entries.length) {
      lines.push("- all settled");
    } else {
      for (const [person, amount] of entries) {
        lines.push(`- ${person}: ${Number(amount).toFixed(2)}`);
      }
    }

    lines.push("\nTo settle up:");
    if (!data.to_settle?.length) {
      lines.push("- all settled");
    } else {
      for (const t of data.to_settle) {
        lines.push(`- ${t.from} -> ${t.to}: ${fmtMoney(t.amount)}`);
      }
    }
    summaryBox.textContent = lines.join("\n");
  } catch (err) {
    summaryBox.textContent = `Error: ${err.message}`;
  }
}

document.getElementById("hangoutForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!chatId) return;

  const name = document.getElementById("hangoutName").value.trim();
  const date = document.getElementById("hangoutDate").value;
  if (!name || !date) return;

  hangoutMsg.textContent = "Creating...";
  try {
    const created = await api("/hangouts", {
      method: "POST",
      body: JSON.stringify({ chat_id: chatId, name, date }),
    });
    hangoutMsg.textContent = "Created";
    e.target.reset();
    await loadHangouts();
    await loadSummary();
    await loadHangoutDetail(created.id);
  } catch (err) {
    hangoutMsg.textContent = `Error: ${err.message}`;
  }
});

deleteHangoutBtn.addEventListener("click", async () => {
  if (!selectedHangout) return;
  if (!confirm("Delete this hangout and all related records?")) return;

  try {
    await api(`/hangouts/${selectedHangout}?chat_id=${chatId}`, { method: "DELETE" });
    selectedHangout = null;
    deleteHangoutBtn.disabled = true;
    detailTitle.textContent = "Select a hangout above.";
    expenseItems.innerHTML = "";
    hangoutDetailBox.textContent = "";
    await loadHangouts();
    await loadSummary();
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
  }
});

document.getElementById("refreshBtn").addEventListener("click", loadHangouts);
document.getElementById("summaryBtn").addEventListener("click", loadSummary);

loadHangouts();
loadSummary();
