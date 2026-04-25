const WORKER = "https://thegame.deviyl.workers.dev";
const COOKIE = { name: "theGameApi", ttl: 86400 };
const POLL_MS = 60000;

let state = { userId: null, userName: null, balance: 0, offline: false };
let pollInterval = null;

// ── Cookie handler ────────────────────────────────────────────
function cookie(action, value) {
  if (action === "get") {
    const m = document.cookie.split("; ").find(c => c.startsWith(COOKIE.name + "="));
    return m ? decodeURIComponent(m.split("=")[1]) : null;
  }
  if (action === "set") {
    const exp = new Date(Date.now() + COOKIE.ttl * 1000).toUTCString();
    document.cookie = `${COOKIE.name}=${encodeURIComponent(value)};expires=${exp};path=/;SameSite=Strict`;
  }
  if (action === "del") {
    document.cookie = `${COOKIE.name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
  }
}

// ── Worker call ───────────────────────────────────────────────
async function api(action, body = {}) {
  const res = await fetch(`${WORKER}?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

// ── Screen ────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");
}

// ── Result panel ──────────────────────────────────────────────
function setResult(type, icon, heading, sub) {
  document.getElementById("result-panel").className = "result-panel" + (type ? " " + type : "");
  document.getElementById("result-icon").textContent = icon;
  document.getElementById("result-text").textContent = heading;
  document.getElementById("result-sub").textContent = sub;
}

// ── Offline state ─────────────────────────────────────────────
function applyOffline(offline) {
  state.offline = !!offline;
  const pill = document.getElementById("offline-pill");
  pill && (state.offline ? pill.classList.remove("hidden") : pill.classList.add("hidden"));
  const isShowingOffline = document.getElementById("result-text")?.textContent === "OFFLINE";
  if (state.offline) {
    setResult("error", "⊘", "OFFLINE", "The Game is currently offline. Please try again later.");
  } else if (isShowingOffline) {
    setResult("", "", "", "");
  }
  refreshUI();
}

// ── Balance UI ────────────────────────────────────────────────
function refreshUI() {
  const amountEl = document.getElementById("balance-amount");
  const zeroMsg  = document.getElementById("balance-zero-msg");
  const spinBtn  = document.getElementById("spin-btn");
  const betPanel = document.getElementById("bet-panel");
  if (!amountEl) return;

  amountEl.textContent = state.balance;

  if (state.offline) {
    zeroMsg.classList.add("hidden");
    spinBtn.disabled = true;
    betPanel.style.cssText = "opacity:0.6;pointer-events:none";
  } else if (state.balance <= 0) {
    zeroMsg.classList.remove("hidden");
    spinBtn.disabled = true;
    betPanel.style.cssText = "opacity:0.4;pointer-events:none";
  } else {
    zeroMsg.classList.add("hidden");
    spinBtn.disabled = false;
    betPanel.style.cssText = "opacity:1;pointer-events:auto";
    const betInput = document.getElementById("bet-input");
    if (parseInt(betInput.value) > state.balance) betInput.value = state.balance;
  }
}

// ── Polling ───────────────────────────────────────────────────
async function poll() {
  try {
    const [bal, status] = await Promise.all([
      api("getBalance", { userId: state.userId }),
      api("getGameStatus", {}),
    ]);
    if (bal.balance !== undefined) state.balance = bal.balance;
    applyOffline(status.offline);
  } catch (_) {}
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(() => { if (state.userId) poll(); }, POLL_MS);
}

function stopPolling() {
  clearInterval(pollInterval);
  pollInterval = null;
}

// ── Auth ──────────────────────────────────────────────────────
async function loginWithKey(apiKey, silent = false) {
  const errorEl = document.getElementById("login-error");
  const btn     = document.getElementById("login-btn");
  const span    = btn?.querySelector("span");

  if (!silent) {
    errorEl.classList.add("hidden");
    btn.disabled = true;
    span.textContent = "VERIFYING...";
  }

  try {
    const data = await api("verifyUser", { apiKey });
    if (data.error) {
      if (!silent) showErr(errorEl, data.error);
      cookie("del");
      return false;
    }
    state.userId   = data.id;
    state.userName = data.name;
    cookie("set", apiKey);
    document.getElementById("player-name").textContent = data.name;
    document.getElementById("player-id").textContent   = `#${data.id}`;
    await poll();
    showScreen("screen-game");
    startPolling();
    return true;
  } catch (_) {
    if (!silent) showErr(errorEl, "Could not connect. Please try again.");
    return false;
  } finally {
    if (!silent) { btn.disabled = false; span.textContent = "ENTER"; }
  }
}

async function login() {
  const apiKey = document.getElementById("api-key-input").value.trim();
  const errorEl = document.getElementById("login-error");
  if (!apiKey) { showErr(errorEl, "Please enter your API key."); return; }
  await loginWithKey(apiKey, false);
}

function logout() {
  cookie("del");
  stopPolling();
  state = { userId: null, userName: null, balance: 0, offline: false };
  document.getElementById("api-key-input").value = "";
  document.getElementById("login-error").classList.add("hidden");
  document.getElementById("offline-pill")?.classList.add("hidden");
  setResult("", "", "", "");
  showScreen("screen-login");
}

// ── Bet controls ──────────────────────────────────────────────
function adjustBet(delta) {
  const input = document.getElementById("bet-input");
  input.value = Math.max(1, Math.min(state.balance, (parseInt(input.value) || 1) + delta));
}

function quickBet(amount) {
  document.getElementById("bet-input").value =
    amount === "all" ? state.balance : Math.min(state.balance, amount);
}

document.getElementById("bet-input")?.addEventListener("change", () => {
  const el = document.getElementById("bet-input");
  el.value = Math.max(1, Math.min(state.balance, parseInt(el.value) || 1));
});

// ── Place bet ─────────────────────────────────────────────────
async function placeBet() {
  const betAmount = parseInt(document.getElementById("bet-input").value);
  const spinBtn   = document.getElementById("spin-btn");
  const spinText  = document.getElementById("spin-btn-text");
  if (!betAmount || betAmount < 1 || betAmount > state.balance) return;

  spinBtn.disabled = true;
  spinText.textContent = "...";
  setResult("", "", "", "");

  try {
    const data = await api("placeBet", { userId: state.userId, betAmount });
    if (data.error) {
      setResult("error", "⊘", "BET FAILED", data.error);
      if (data.error.toLowerCase().includes("offline")) applyOffline(1);
      return;
    }
    state.balance = data.newBalance;
    setResult(
      data.won ? "win" : "lose",
      data.won ? "◆" : "✖",
      data.won ? "YOU WIN" : "YOU LOSE",
      data.won
        ? `+${betAmount} xanax  ·  balance: ${data.newBalance}`
        : `-${betAmount} xanax  ·  remaining: ${data.newBalance}`
    );
  } catch (_) {
    setResult("error", "⊘", "BET FAILED", "Could not reach the server. Your bet was not placed — please try again.");
  } finally {
    spinText.textContent = "PLAY";
    refreshUI();
  }
}

// ── Helpers ───────────────────────────────────────────────────
function showErr(el, msg) { el.textContent = msg; el.classList.remove("hidden"); }

document.getElementById("api-key-input")?.addEventListener("keydown", e => { if (e.key === "Enter") login(); });

// ── Init ──────────────────────────────────────────────────────
(async function init() {
  const saved = cookie("get");
  if (saved) {
    const btn  = document.getElementById("login-btn");
    const span = btn?.querySelector("span");
    if (span) span.textContent = "LOADING...";
    if (btn)  btn.disabled = true;
    await loginWithKey(saved, true);
    if (span) span.textContent = "ENTER";
    if (btn)  btn.disabled = false;
  }
})();
