const WORKER_URL = "https://thegame.deviyl.workers.dev";
const COOKIE_NAME = "theGameApi";
const COOKIE_TTL = 60 * 60 * 24;
const BALANCE_POLL_MS = 60000;

let state = {
  userId: null,
  userName: null,
  balance: 0,
};

let balanceInterval = null;

function setCookie(name, value, seconds) {
  const expires = new Date(Date.now() + seconds * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires};path=/;SameSite=Strict`;
}

function getCookie(name) {
  const match = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function deleteCookie(name) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

async function callWorker(action, body = {}) {
  const res = await fetch(`${WORKER_URL}?action=${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function loginWithKey(apiKey, silent = false) {
  const errorEl = document.getElementById("login-error");
  const btn = document.getElementById("login-btn");

  if (!silent) {
    errorEl.classList.add("hidden");
    btn.disabled = true;
    btn.querySelector("span").textContent = "VERIFYING...";
  }

  try {
    const data = await callWorker("verifyUser", { apiKey });
    if (data.error) {
      if (!silent) showError(errorEl, data.error);
      deleteCookie(COOKIE_NAME);
      return false;
    }

    state.userId = data.id;
    state.userName = data.name;

    setCookie(COOKIE_NAME, apiKey, COOKIE_TTL);

    document.getElementById("player-name").textContent = data.name;
    document.getElementById("player-id").textContent = `#${data.id}`;

    await refreshBalance();
    showScreen("screen-game");
    startBalancePolling();
    return true;
  } catch (err) {
    if (!silent) showError(errorEl, "Could not connect. Please try again.");
    return false;
  } finally {
    if (!silent) {
      btn.disabled = false;
      btn.querySelector("span").textContent = "ENTER";
    }
  }
}

async function login() {
  const apiKey = document.getElementById("api-key-input").value.trim();
  const errorEl = document.getElementById("login-error");
  if (!apiKey) { showError(errorEl, "Please enter your API key."); return; }
  await loginWithKey(apiKey, false);
}

document.getElementById("api-key-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});

function logout() {
  deleteCookie(COOKIE_NAME);
  stopBalancePolling();
  state = { userId: null, userName: null, balance: 0 };
  document.getElementById("api-key-input").value = "";
  document.getElementById("login-error").classList.add("hidden");
  clearResult();
  showScreen("screen-login");
}

async function refreshBalance() {
  try {
    const data = await callWorker("getBalance", { userId: state.userId });
    if (data.balance !== undefined) {
      state.balance = data.balance;
      updateBalanceUI();
    }
  } catch (err) {}
}

function startBalancePolling() {
  stopBalancePolling();
  balanceInterval = setInterval(() => {
    if (state.userId) refreshBalance();
  }, BALANCE_POLL_MS);
}

function stopBalancePolling() {
  if (balanceInterval) {
    clearInterval(balanceInterval);
    balanceInterval = null;
  }
}

function updateBalanceUI() {
  const amountEl = document.getElementById("balance-amount");
  const zeroMsg = document.getElementById("balance-zero-msg");
  const spinBtn = document.getElementById("spin-btn");
  const betPanel = document.getElementById("bet-panel");

  amountEl.textContent = state.balance;

  if (state.balance <= 0) {
    zeroMsg.classList.remove("hidden");
    spinBtn.disabled = true;
    betPanel.style.opacity = "0.4";
    betPanel.style.pointerEvents = "none";
  } else {
    zeroMsg.classList.add("hidden");
    spinBtn.disabled = false;
    betPanel.style.opacity = "1";
    betPanel.style.pointerEvents = "auto";
    const betInput = document.getElementById("bet-input");
    if (parseInt(betInput.value) > state.balance) betInput.value = state.balance;
  }
}

function adjustBet(delta) {
  const input = document.getElementById("bet-input");
  let val = parseInt(input.value) || 1;
  input.value = Math.max(1, Math.min(state.balance, val + delta));
}

function quickBet(amount) {
  document.getElementById("bet-input").value =
    amount === "all" ? state.balance : Math.min(state.balance, amount);
}

document.getElementById("bet-input")?.addEventListener("change", () => {
  const input = document.getElementById("bet-input");
  input.value = Math.max(1, Math.min(state.balance, parseInt(input.value) || 1));
});

async function placeBet() {
  const betInput = document.getElementById("bet-input");
  const betAmount = parseInt(betInput.value);
  const spinBtn = document.getElementById("spin-btn");
  const spinText = document.getElementById("spin-btn-text");

  if (!betAmount || betAmount < 1 || betAmount > state.balance) return;

  spinBtn.disabled = true;
  spinText.textContent = "...";
  clearResult();

  try {
    const data = await callWorker("placeBet", { userId: state.userId, betAmount });
    if (data.error) { alert(data.error); return; }

    state.balance = data.newBalance;
    updateBalanceUI();
    showResult(data.won, betAmount, data.newBalance);
  } catch (err) {
    alert("Something went wrong. Please try again.");
  } finally {
    spinBtn.disabled = state.balance <= 0;
    spinText.textContent = "PLAY";
  }
}

function showResult(won, betAmount, newBalance) {
  const panel = document.getElementById("result-panel");
  const icon = document.getElementById("result-icon");
  const text = document.getElementById("result-text");
  const sub = document.getElementById("result-sub");

  panel.className = "result-panel " + (won ? "win" : "lose");
  icon.textContent = won ? "◆" : "✕";
  text.textContent = won ? "YOU WIN" : "YOU LOSE";
  sub.textContent = won
    ? `+${betAmount} xanax  ·  balance: ${newBalance}`
    : `-${betAmount} xanax  ·  remaining: ${newBalance}`;
}

function clearResult() {
  const panel = document.getElementById("result-panel");
  panel.className = "result-panel";
  document.getElementById("result-icon").textContent = "";
  document.getElementById("result-text").textContent = "";
  document.getElementById("result-sub").textContent = "";
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

(async function init() {
  const savedKey = getCookie(COOKIE_NAME);
  if (savedKey) {
    const btn = document.getElementById("login-btn");
    const span = btn?.querySelector("span");
    if (span) span.textContent = "LOADING...";
    if (btn) btn.disabled = true;
    const ok = await loginWithKey(savedKey, true);
    if (!ok) {
      if (span) span.textContent = "ENTER";
      if (btn) btn.disabled = false;
    }
  }
})();
