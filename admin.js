const WORKER_URL = "https://thegame.deviyl.workers.dev";
const ADMIN_COOKIE = "theGameAdminPass";
const COOKIE_TTL = 60 * 60 * 24;

let adminPassword = null;

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

async function loginWithPassword(password, silent = false) {
  const errorEl = document.getElementById("admin-login-error");
  if (!silent) errorEl.classList.add("hidden");

  try {
    const data = await callWorker("validatePassword", { password });
    if (!data.valid) {
      if (!silent) showError(errorEl, "Incorrect password.");
      deleteCookie(ADMIN_COOKIE);
      return false;
    }
    adminPassword = password;
    setCookie(ADMIN_COOKIE, password, COOKIE_TTL);
    await loadDashboard();
    showScreen("screen-admin");
    return true;
  } catch (err) {
    if (!silent) showError(errorEl, "Connection error. Try again.");
    return false;
  }
}

async function adminLogin() {
  const passInput = document.getElementById("admin-pass-input");
  const password = passInput.value.trim();
  if (!password) { showError(document.getElementById("admin-login-error"), "Enter the admin password."); return; }
  const ok = await loginWithPassword(password, false);
  if (!ok) passInput.value = "";
}

document.getElementById("admin-pass-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") adminLogin();
});

async function loadDashboard() {
  try {
    const data = await callWorker("adminDashboard", { password: adminPassword });
    if (data.error) return;

    document.getElementById("admin-house").textContent = data.house;
    document.getElementById("admin-outstanding").textContent = data.totalOutstanding;
    document.getElementById("admin-available").textContent = data.availableToHouse;

    const tbody = document.getElementById("admin-users-tbody");
    tbody.innerHTML = data.users?.length
      ? data.users.map((u) => `
          <tr>
            <td>${escapeHtml(u.name)}</td>
            <td style="color:var(--text-dim)">${u.id}</td>
            <td class="td-balance">${u.balance}</td>
          </tr>`).join("")
      : `<tr><td colspan="3" class="loading-cell">No players yet.</td></tr>`;

    const logEl = document.getElementById("admin-log");
    logEl.innerHTML = data.recentHistory?.length
      ? data.recentHistory.map((e) => `<div class="admin-log-entry">${escapeHtml(e)}</div>`).join("")
      : `<div class="loading-cell">No activity yet.</div>`;
  } catch (err) {}
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

(async function init() {
  const savedPass = getCookie(ADMIN_COOKIE);
  if (savedPass) await loginWithPassword(savedPass, true);
})();
