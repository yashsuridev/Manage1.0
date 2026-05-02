/* ================================================================
   HostelPay — Hostel Fees Management System
   script.js

   SETUP INSTRUCTIONS:
   1. Go to https://console.firebase.google.com
   2. Create a new project (e.g. "hostel-pay")
   3. Add a Web App inside the project
   4. Copy your firebaseConfig object and paste it below
   5. In Firestore → Rules, set:
        allow read, write: if true;   (for development)
   6. Open index.html in a browser (use a local server or VS Code Live Server)
================================================================ */

/* ──────────────────────────────────────────
   🔥 FIREBASE CONFIG — REPLACE THIS BLOCK
────────────────────────────────────────── */
const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
/* ────────────────────────────────────────── */

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const COLLECTION = "students";

/* ================================================================
   USER ACCOUNTS (client-side demo auth — no Firebase Auth needed)
   Add / change users here as needed.
================================================================ */
const USERS = {
  admin:      { password: "admin",   role: "admin",      display: "Admin" },
  accountant: { password: "acc123",  role: "accountant", display: "Accountant" },
  warden:     { password: "ward123", role: "warden",     display: "Warden" }
};

/* Permissions:
   admin      → full access (add, pay, delete)
   accountant → add students + mark payments (no delete)
   warden     → view only (read-only) */

/* ================================================================
   STATE
================================================================ */
let currentRole = null;
let currentUser = null;
let allStudents  = [];       // live cache from Firestore
let showingDefaulters = false;
let searchQuery = "";
let pendingDeleteId = null;
let unsubscribe = null;      // Firestore real-time listener

/* ================================================================
   DOM REFS
================================================================ */
const loginPage    = document.getElementById("login-page");
const appDiv       = document.getElementById("app");
const loginUserInp = document.getElementById("login-user");
const loginPassInp = document.getElementById("login-pass");
const loginError   = document.getElementById("login-error");
const btnLogin     = document.getElementById("btn-login");
const roleTabs     = document.getElementById("role-tabs");

const userNameDisplay  = document.getElementById("user-name-display");
const userRoleBadge    = document.getElementById("user-role-badge");
const btnLogout        = document.getElementById("btn-logout");

const statTotal     = document.getElementById("stat-total");
const statPaid      = document.getElementById("stat-paid");
const statDefault   = document.getElementById("stat-defaulters");
const statDue       = document.getElementById("stat-due");

const btnAddToggle  = document.getElementById("btn-add-toggle");
const addPanel      = document.getElementById("add-panel");
const inpName       = document.getElementById("inp-name");
const inpRoom       = document.getElementById("inp-room");
const inpFees       = document.getElementById("inp-fees");
const btnSave       = document.getElementById("btn-save-student");

const btnDefaulters = document.getElementById("btn-show-defaulters");
const filterBadge   = document.getElementById("filter-badge");
const searchInp     = document.getElementById("search-inp");
const rowCount      = document.getElementById("row-count");
const tableBody     = document.getElementById("table-body");
const emptyState    = document.getElementById("empty-state");
const emptyMsg      = document.getElementById("empty-msg");

const confirmModal  = document.getElementById("confirm-modal");
const modalTitle    = document.getElementById("modal-title");
const modalBody     = document.getElementById("modal-body");
const paymentAmountInp = document.getElementById("payment-amount");
const modalConfirm  = document.getElementById("modal-confirm");
const modalCancel   = document.getElementById("modal-cancel");

/* ================================================================
   ROLE TAB SELECTION
================================================================ */
let selectedRoleTab = "admin";
roleTabs.addEventListener("click", e => {
  if (!e.target.classList.contains("user-tab")) return;
  document.querySelectorAll(".user-tab").forEach(t => t.classList.remove("active"));
  e.target.classList.add("active");
  selectedRoleTab = e.target.dataset.role;
});

/* ================================================================
   LOGIN
================================================================ */
btnLogin.addEventListener("click", handleLogin);
loginPassInp.addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });
loginUserInp.addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });

function handleLogin() {
  const uname = loginUserInp.value.trim().toLowerCase();
  const pass  = loginPassInp.value;
  loginError.style.display = "none";

  const account = USERS[uname];
  if (!account || account.password !== pass) {
    loginError.style.display = "block";
    loginPassInp.value = "";
    loginPassInp.focus();
    return;
  }

  /* Optionally enforce role-tab match (uncomment to activate) */
  // if (account.role !== selectedRoleTab) {
  //   loginError.textContent = "Role mismatch. Select the correct tab.";
  //   loginError.style.display = "block";
  //   return;
  // }

  currentRole = account.role;
  currentUser = account.display;
  loginPage.style.display = "none";
  appDiv.style.display     = "flex";

  userNameDisplay.textContent  = account.display;
  userRoleBadge.textContent    = account.role.toUpperCase();

  applyRoleUI();
  startListener();
  toast(`Welcome back, ${account.display}!`, "info");
}

/* ================================================================
   LOGOUT
================================================================ */
btnLogout.addEventListener("click", () => {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  currentRole = currentUser = null;
  allStudents = [];
  showingDefaulters = false;
  searchQuery = "";
  loginUserInp.value = loginPassInp.value = "";
  loginError.style.display = "none";
  appDiv.style.display = "none";
  loginPage.style.display = "flex";
  tableBody.innerHTML = "";
});

/* ================================================================
   ROLE-BASED UI
================================================================ */
function applyRoleUI() {
  const canAdd    = currentRole === "admin" || currentRole === "accountant";
  const canDelete = currentRole === "admin";

  btnAddToggle.style.display = canAdd ? "flex" : "none";

  /* Delete buttons handled per-row in renderTable */
  document.documentElement.dataset.role = currentRole;
}

/* ================================================================
   FIRESTORE REAL-TIME LISTENER
================================================================ */
function startListener() {
  tableBody.innerHTML = `
    <tr class="skeleton-row"><td colspan="7"><div class="skeleton" style="height:18px;width:80%;margin:4px 0"></div></td></tr>
    <tr class="skeleton-row"><td colspan="7"><div class="skeleton" style="height:18px;width:60%;margin:4px 0"></div></td></tr>
    <tr class="skeleton-row"><td colspan="7"><div class="skeleton" style="height:18px;width:70%;margin:4px 0"></div></td></tr>
  `;

  unsubscribe = db.collection(COLLECTION)
    .orderBy("createdAt", "desc")
    .onSnapshot(snapshot => {
      allStudents = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderTable();
      updateStats();
    }, err => {
      console.error("Firestore error:", err);
      toast("Failed to load data. Check Firebase config.", "error");
      tableBody.innerHTML = "";
      emptyMsg.textContent = "Connection error. Check console.";
      emptyState.style.display = "block";
    });
}

/* ================================================================
   RENDER TABLE
================================================================ */
function renderTable() {
  let data = [...allStudents];

  if (showingDefaulters) {
    data = data.filter(s => {
      const inst = s.totalFees / 3;
      const paid = Number(s.amountPaid ?? ((s.installment1 ? inst : 0) + (s.installment2 ? inst : 0) + (s.installment3 ? inst : 0)));
      return s.totalFees - paid > 0;
    });
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    data = data.filter(s =>
      (s.name || "").toLowerCase().includes(q) ||
      (s.room || "").toLowerCase().includes(q)
    );
  }

  rowCount.textContent = `${data.length} student${data.length !== 1 ? "s" : ""}`;

  if (data.length === 0) {
    tableBody.innerHTML = "";
    emptyMsg.textContent = showingDefaulters
      ? "No defaulters found. All students are up to date!"
      : searchQuery
        ? "No students match your search."
        : "No students found. Add the first one!";
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";
  const canPay    = currentRole === "admin" || currentRole === "accountant";
  const canDelete = currentRole === "admin";

  tableBody.innerHTML = data.map(s => {
    const inst  = s.totalFees / 3;
    const paid  = Number(s.amountPaid ?? ((s.installment1 ? inst : 0) + (s.installment2 ? inst : 0) + (s.installment3 ? inst : 0)));
    const due   = Math.max(0, s.totalFees - paid);

    return `<tr data-id="${s.id}">
      <td data-label="Name" style="font-weight:500">${escHtml(s.name)}</td>
      <td data-label="Room"><span class="room-badge">${escHtml(s.room)}</span></td>
      <td data-label="Installment 1">
        ${instBtn(s, 1, inst, canPay, due)}
      </td>
      <td data-label="Installment 2">
        ${instBtn(s, 2, inst, canPay, due)}
      </td>
      <td data-label="Installment 3">
        ${instBtn(s, 3, inst, canPay, due)}
      </td>
      <td data-label="Due Amount">
        <span class="due-amount ${due === 0 ? "zero" : ""}">
          ${due === 0 ? "✓ Clear" : "₹" + fmt(due)}
        </span>
      </td>
      <td data-label="">
        ${canDelete
          ? `<button class="del-btn" data-id="${s.id}" title="Remove student">
               <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                 <polyline points="3 6 5 6 21 6"/>
                 <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
               </svg>
             </button>`
          : ""}
      </td>
    </tr>`;
  }).join("");
}

function instBtn(s, num, instAmt, canPay, due) {
  const field = `installment${num}`;
  const paidAmt = Number(s.amountPaid ?? ((s.installment1 ? instAmt : 0) + (s.installment2 ? instAmt : 0) + (s.installment3 ? instAmt : 0)));
  const threshold = num * instAmt;
  const prevThreshold = (num - 1) * instAmt;
  const paid = paidAmt >= threshold;
  const partial = !paid && paidAmt > prevThreshold;
  const partialPaid = partial ? paidAmt - prevThreshold : 0;
  const lbl = paid
    ? `✓ ₹${fmt(instAmt)}`
    : partial
      ? `Partial ₹${fmt(partialPaid)}`
      : `Pay ₹${fmt(instAmt)}`;
  const cls = paid ? "paid" : partial ? "partial" : "unpaid";
  const defaultAmt = Math.min(due, instAmt - partialPaid || instAmt);
  const readOnly = (!canPay || due <= 0) ? "readonly" : "";
  return `<button class="inst-btn ${cls} ${readOnly}"
            data-id="${s.id}" data-field="${field}" data-name="${escHtml(s.name)}"
            data-inst="${num}" data-amt="${defaultAmt}" data-due="${due}">
            ${lbl}
          </button>`;
}

/* ================================================================
   TABLE CLICK DELEGATION
================================================================ */
tableBody.addEventListener("click", e => {
  /* Mark installment paid */
  const instBtn = e.target.closest(".inst-btn:not(.readonly)");
  if (instBtn) {
    const { id, field, name, inst, amt, due } = instBtn.dataset;
    openPayConfirm(id, field, name, inst, parseFloat(amt), parseFloat(due));
    return;
  }

  /* Delete student */
  const delBtn = e.target.closest(".del-btn");
  if (delBtn) {
    pendingDeleteId = delBtn.dataset.id;
    const row = delBtn.closest("tr");
    const sName = row.querySelector("td")?.textContent || "this student";
    modalTitle.textContent = "Remove Student";
    modalBody.textContent  = `Remove "${sName}" from the system? This cannot be undone.`;
    confirmModal.classList.add("open");
  }
});

/* ================================================================
   CONFIRM MODAL
================================================================ */
let pendingPayData = null;

function openPayConfirm(id, field, name, inst, defaultAmt, due) {
  pendingPayData = { id, field, due };
  modalTitle.textContent = `Mark Installment ${inst} as Paid`;
  modalBody.textContent  = `Enter payment amount to apply for ${name}.`;
  paymentAmountInp.style.display = "block";
  paymentAmountInp.value = defaultAmt.toFixed(2);
  paymentAmountInp.min = "0.01";
  paymentAmountInp.max = String(due);
  paymentAmountInp.focus();
  modalConfirm.textContent = "Confirm Payment";
  modalConfirm.className   = "btn success";
  confirmModal.classList.add("open");
}

modalCancel.addEventListener("click", () => {
  confirmModal.classList.remove("open");
  pendingDeleteId = null;
  pendingPayData  = null;
  paymentAmountInp.style.display = "none";
  paymentAmountInp.value = "";
  modalConfirm.textContent = "Delete";
  modalConfirm.className   = "btn danger";
});

confirmModal.addEventListener("click", e => {
  if (e.target === confirmModal) modalCancel.click();
});

modalConfirm.addEventListener("click", async () => {
  if (pendingPayData) {
    const { id, due } = pendingPayData;
    const amount = parseFloat(paymentAmountInp.value);
    if (!amount || amount <= 0 || amount > due) {
      toast("Enter a valid payment amount within the remaining due.", "error");
      return;
    }

    try {
      await db.collection(COLLECTION).doc(id).update({
        amountPaid: firebase.firestore.FieldValue.increment(amount)
      });
      toast("Payment recorded successfully!", "success");
    } catch (err) {
      console.error(err);
      toast("Failed to update. Try again.", "error");
      return;
    }

    pendingPayData = null;
    paymentAmountInp.style.display = "none";
    paymentAmountInp.value = "";
    modalConfirm.textContent = "Delete";
    modalConfirm.className   = "btn danger";
    confirmModal.classList.remove("open");
    return;
  }

  if (pendingDeleteId) {
    const did = pendingDeleteId;
    pendingDeleteId = null;
    try {
      await db.collection(COLLECTION).doc(did).delete();
      toast("Student removed.", "info");
    } catch (err) {
      console.error(err);
      toast("Failed to delete. Try again.", "error");
    }
  }
});

/* ================================================================
   ADD STUDENT
================================================================ */
btnAddToggle.addEventListener("click", () => {
  addPanel.classList.toggle("open");
  btnAddToggle.innerHTML = addPanel.classList.contains("open")
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg> Cancel`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Student`;
});

btnSave.addEventListener("click", async () => {
  const name  = inpName.value.trim();
  const room  = inpRoom.value.trim();
  const fees  = parseFloat(inpFees.value);

  if (!name)          { toast("Please enter student name.", "error"); inpName.focus(); return; }
  if (!room)          { toast("Please enter room number.", "error"); inpRoom.focus(); return; }
  if (!fees || fees <= 0) { toast("Enter a valid fees amount.", "error"); inpFees.focus(); return; }

  btnSave.disabled   = true;
  btnSave.textContent = "Saving…";

  try {
    await db.collection(COLLECTION).add({
      name,
      room,
      totalFees:    fees,
      amountPaid:   0,
      installment1: false,
      installment2: false,
      installment3: false,
      createdAt:    firebase.firestore.FieldValue.serverTimestamp()
    });

    inpName.value = inpRoom.value = inpFees.value = "";
    addPanel.classList.remove("open");
    btnAddToggle.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Student`;
    toast(`Student "${name}" added successfully!`, "success");
  } catch (err) {
    console.error(err);
    toast("Failed to add student. Check Firebase config.", "error");
  }

  btnSave.disabled    = false;
  btnSave.innerHTML   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save`;
});

/* ================================================================
   SEARCH
================================================================ */
searchInp.addEventListener("input", () => {
  searchQuery = searchInp.value.trim();
  renderTable();
});

/* ================================================================
   DEFAULTERS TOGGLE
================================================================ */
btnDefaulters.addEventListener("click", () => {
  showingDefaulters = !showingDefaulters;
  filterBadge.classList.toggle("visible", showingDefaulters);
  btnDefaulters.innerHTML = showingDefaulters
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg> Show All`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Show Defaulters`;
  renderTable();
});

/* ================================================================
   STATS
================================================================ */
function updateStats() {
  const total = allStudents.length;
  let paid = 0, defCount = 0, totalDue = 0;

  allStudents.forEach(s => {
    const inst = s.totalFees / 3;
    const paidAmt = Number(s.amountPaid ?? ((s.installment1 ? inst : 0) + (s.installment2 ? inst : 0) + (s.installment3 ? inst : 0)));
    const due  = Math.max(0, s.totalFees - paidAmt);
    totalDue += due;
    if (due === 0) paid++;
    else defCount++;
  });

  statTotal.textContent     = total;
  statPaid.textContent      = paid;
  statDefault.textContent   = defCount;
  statDue.textContent       = "₹" + fmt(totalDue);
}

/* ================================================================
   TOAST NOTIFICATIONS
================================================================ */
function toast(msg, type = "info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="t-icon"></span>${escHtml(msg)}`;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* ================================================================
   HELPERS
================================================================ */
function fmt(n) {
  return Number(n.toFixed(2)).toLocaleString("en-IN");
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
