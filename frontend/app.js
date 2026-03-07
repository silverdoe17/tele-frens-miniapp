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

function getChatId() {
  // For local testing fallback to manual chat_id via query string.
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
    hangoutsList.innerHTML = data.items
      .map((h) => `<li>${h.name} (${h.date})</li>`)
      .join("");
  } catch (err) {
    hangoutsList.innerHTML = `<li>Error: ${err.message}</li>`;
  }
}

async function loadSummary() {
  if (!chatId) return;
  summaryBox.textContent = "Loading...";
  try {
    const data = await api(`/summary?chat_id=${chatId}`);
    const lines = [];
    lines.push("Outstanding balances:");
    const entries = Object.entries(data.unsettled_balances || {});
    if (!entries.length) {
      lines.push("- All settled");
    } else {
      for (const [person, amount] of entries) {
        lines.push(`- ${person}: ${amount.toFixed(2)}`);
      }
    }
    lines.push("\nTo settle up:");
    if (!data.to_settle?.length) {
      lines.push("- Nothing pending");
    } else {
      for (const t of data.to_settle) {
        lines.push(`- ${t.from} -> ${t.to}: ${t.amount.toFixed(2)}`);
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
    await api("/hangouts", {
      method: "POST",
      body: JSON.stringify({ chat_id: chatId, name, date }),
    });
    hangoutMsg.textContent = "Created";
    e.target.reset();
    loadHangouts();
  } catch (err) {
    hangoutMsg.textContent = `Error: ${err.message}`;
  }
});

document.getElementById("refreshBtn").addEventListener("click", loadHangouts);
document.getElementById("summaryBtn").addEventListener("click", loadSummary);

loadHangouts();
