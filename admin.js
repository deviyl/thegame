const WORKER_URL = "https://thegame.deviyl.workers.dev";

let adminPassword = null;

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

async function adminLogin() {
  const passInput = document.getElementById("admin-pass-input");
  const errorEl = document.getElementById("admin-login-error");
  const password = passInput.value.trim();

  errorEl.classList.add("hidden");
  if (!password) { showError(errorEl, "Enter the admin password."); return; }

  try {
    const data = await callWorker("validatePassword", { password });
    if (!data.valid) {
      showError(errorEl, "Incorrect password.");
      passInput.value = "";
      return;
    }
    adminPassword = password;
    await loadDashboard();
    showScreen("screen-admin");
  } catch (err) {
    showError(errorEl, "Connection error. Try again.");
  }
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
