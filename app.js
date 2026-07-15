const STORAGE_KEY = "roomie-bloom-state";
const TOUR_KEY = "roomie-bloom-tour-complete";
const THEME_KEY = "roomie-bloom-theme";
const REMINDER_CHECK_INTERVAL = 30_000;
const MAX_TIMEOUT_DELAY = 2_147_483_647;
const MAX_RECEIPT_SIZE = 1_500_000;

const state = loadState();
const reminderTimers = new Map();
let editingExpenseId = null;

const elements = {
  roommatesForm: document.querySelector("#roommates-form"),
  personA: document.querySelector("#person-a"),
  personB: document.querySelector("#person-b"),
  transactionType: document.querySelector("#transaction-type"),
  paidBy: document.querySelector("#expense-paid-by"),
  paidTo: document.querySelector("#expense-paid-to"),
  paidToField: document.querySelector("#expense-paid-to-field"),
  expenseForm: document.querySelector("#expense-form"),
  expenseTitle: document.querySelector("#expense-title"),
  expenseTitleLabel: document.querySelector("#expense-title-label"),
  expenseAmount: document.querySelector("#expense-amount"),
  expenseDate: document.querySelector("#expense-date"),
  receiptFile: document.querySelector("#receipt-file"),
  reminderToggle: document.querySelector("#set-reminder"),
  reminderField: document.querySelector("#reminder-field"),
  reminderAt: document.querySelector("#reminder-at"),
  totalShared: document.querySelector("#total-shared"),
  totalPayments: document.querySelector("#total-payments"),
  paidA: document.querySelector("#paid-a"),
  paidB: document.querySelector("#paid-b"),
  paidALabel: document.querySelector("#paid-a-label"),
  paidBLabel: document.querySelector("#paid-b-label"),
  balanceTitle: document.querySelector("#balance-title"),
  balanceDetail: document.querySelector("#balance-detail"),
  expenseList: document.querySelector("#expense-list"),
  expenseTemplate: document.querySelector("#expense-template"),
  clearAll: document.querySelector("#clear-all"),
  cancelEdit: document.querySelector("#cancel-edit"),
  themeToggle: document.querySelector("#theme-toggle"),
  restartTour: document.querySelector("#restart-tour"),
  groupForm: document.querySelector("#group-form"),
  groupName: document.querySelector("#group-name"),
  invitePhone: document.querySelector("#invite-phone"),
  groupNameDisplay: document.querySelector("#group-name-display"),
  inviteCount: document.querySelector("#invite-count"),
  inviteList: document.querySelector("#invite-list"),
};

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("is-dark", isDark);
  elements.themeToggle.setAttribute("aria-pressed", String(isDark));
  elements.themeToggle.querySelector("i").dataset.lucide = isDark ? "sun" : "moon";

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function savedTheme() {
  return localStorage.getItem(THEME_KEY) || "light";
}

function loadState() {
  const fallback = {
    people: ["Eli", "bahar"],
    groupName: "Roomie group",
    invites: [],
    expenses: [],
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.people) || !Array.isArray(saved.expenses)) {
      return fallback;
    }
    saved.groupName = typeof saved.groupName === "string" && saved.groupName.trim() ? saved.groupName : fallback.groupName;
    saved.invites = Array.isArray(saved.invites)
      ? saved.invites.filter((invite) => invite && typeof invite.phone === "string")
      : [];
    if (saved.people[0] === "Maya" && saved.people[1] === "Lily") {
      saved.people = fallback.people;
      saved.expenses = saved.expenses.map((entry) => ({
        ...entry,
        paidBy: entry.paidBy === "Maya" ? fallback.people[0] : entry.paidBy === "Lily" ? fallback.people[1] : entry.paidBy,
        paidTo: entry.paidTo === "Maya" ? fallback.people[0] : entry.paidTo === "Lily" ? fallback.people[1] : entry.paidTo,
      }));
    }
    if (saved.people[0] === "ellie") {
      saved.people[0] = fallback.people[0];
      saved.expenses = saved.expenses.map((entry) => ({
        ...entry,
        paidBy: entry.paidBy === "ellie" ? fallback.people[0] : entry.paidBy,
        paidTo: entry.paidTo === "ellie" ? fallback.people[0] : entry.paidTo,
      }));
    }
    return saved;
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function normalizePhone(value) {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

function formatPhone(value) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return value;
}

function toLocalDateTimeValue(date = new Date()) {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

function isPayment(entry) {
  return entry.type === "payment";
}

function hasReminder(entry) {
  return Number.isFinite(entry.reminderAt);
}

function hasReceipt(entry) {
  return Boolean(entry.receipt && entry.receipt.dataUrl);
}

function totals() {
  const paid = Object.fromEntries(state.people.map((person) => [person, 0]));
  let total = 0;
  let payments = 0;
  let firstPaymentDelta = 0;

  state.expenses.forEach((entry) => {
    if (isPayment(entry)) {
      payments += entry.amount;
      if (entry.paidBy === state.people[0]) {
        firstPaymentDelta += entry.amount;
      }
      if (entry.paidTo === state.people[0]) {
        firstPaymentDelta -= entry.amount;
      }
      return;
    }

    paid[entry.paidBy] = (paid[entry.paidBy] || 0) + entry.amount;
    total += entry.amount;
  });

  const expectedShare = total / 2;
  const firstDelta = paid[state.people[0]] - expectedShare + firstPaymentDelta;
  return { total, paid, payments, expectedShare, firstDelta };
}

function fillPersonSelect(select, people) {
  const selectedValue = select.value;
  select.replaceChildren();

  people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person;
    option.textContent = person;
    select.append(option);
  });

  if (people.includes(selectedValue)) {
    select.value = selectedValue;
  }
}

function updatePaymentRecipient() {
  const recipient = state.people.find((person) => person !== elements.paidBy.value) || state.people[1];
  elements.paidTo.value = recipient;
}

function renderTransactionMode() {
  const isPaymentMode = elements.transactionType.value === "payment";
  elements.paidToField.classList.toggle("is-hidden", !isPaymentMode);
  elements.paidTo.required = isPaymentMode;
  elements.expenseTitleLabel.textContent = isPaymentMode ? "What is this payment for?" : "What was it?";
  elements.expenseTitle.placeholder = isPaymentMode ? "Venmo payback, rent settle-up..." : "Groceries, candles, brunch...";
  document.querySelector("#add-button-text").textContent = editingExpenseId
    ? "Save changes"
    : isPaymentMode
      ? "Add payment"
      : "Add expense";

  if (isPaymentMode) {
    updatePaymentRecipient();
  }
}

function renderReminderMode() {
  const enabled = elements.reminderToggle.checked;
  elements.reminderField.classList.toggle("is-hidden", !enabled);
  elements.reminderAt.required = enabled;

  if (enabled && !elements.reminderAt.value) {
    elements.reminderAt.value = toLocalDateTimeValue(new Date(Date.now() + 60 * 60_000));
  }
}

function renderEditMode() {
  elements.cancelEdit.classList.toggle("is-hidden", !editingExpenseId);
  renderTransactionMode();
}

function renderPeople() {
  elements.personA.value = state.people[0];
  elements.personB.value = state.people[1];
  fillPersonSelect(elements.paidBy, state.people);
  fillPersonSelect(elements.paidTo, state.people);
  updatePaymentRecipient();

  elements.paidALabel.textContent = `${state.people[0]} paid`;
  elements.paidBLabel.textContent = `${state.people[1]} paid`;
}

function renderGroup() {
  const groupName = state.groupName || "Roomie group";
  elements.groupName.value = groupName;
  elements.groupNameDisplay.textContent = groupName;
  elements.inviteCount.textContent = String(state.invites.length);
  elements.inviteList.replaceChildren();

  if (!state.invites.length) {
    const empty = document.createElement("div");
    empty.className = "invite-empty";
    empty.innerHTML = `<i data-lucide="message-circle-heart"></i><span>No invited friends yet.</span>`;
    elements.inviteList.append(empty);
    return;
  }

  state.invites.forEach((invite) => {
    const item = document.createElement("article");
    item.className = "invite-item";
    item.dataset.id = invite.id;

    const phone = document.createElement("div");
    phone.className = "invite-phone";
    phone.innerHTML = `<i data-lucide="smartphone"></i><span>${formatPhone(invite.phone)}</span>`;

    const actions = document.createElement("div");
    actions.className = "invite-actions";

    const message = document.createElement("a");
    message.className = "icon-button";
    message.href = `sms:${invite.phone}?&body=${encodeURIComponent(`Join my ${groupName} group on Roomie Bloom!`)}`;
    message.ariaLabel = `Text invite to ${formatPhone(invite.phone)}`;
    message.innerHTML = `<i data-lucide="message-circle"></i>`;

    const call = document.createElement("a");
    call.className = "icon-button";
    call.href = `tel:${invite.phone}`;
    call.ariaLabel = `Call ${formatPhone(invite.phone)}`;
    call.innerHTML = `<i data-lucide="phone"></i>`;

    const remove = document.createElement("button");
    remove.className = "icon-button delete-invite";
    remove.type = "button";
    remove.ariaLabel = `Remove ${formatPhone(invite.phone)}`;
    remove.innerHTML = `<i data-lucide="x"></i>`;

    actions.append(message, call, remove);
    item.append(phone, actions);
    elements.inviteList.append(item);
  });
}

function formatReminderTime(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function readReceiptAttachment(file) {
  if (!file) {
    return Promise.resolve(null);
  }

  if (file.size > MAX_RECEIPT_SIZE) {
    window.alert("Please attach a receipt smaller than 1.5 MB so it can be saved in this browser.");
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        dataUrl: reader.result,
      });
    });
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

function renderSummary() {
  const { total, paid, payments, firstDelta } = totals();
  elements.totalShared.textContent = formatMoney(total);
  elements.totalPayments.textContent = formatMoney(payments);
  elements.paidA.textContent = formatMoney(paid[state.people[0]] || 0);
  elements.paidB.textContent = formatMoney(paid[state.people[1]] || 0);

  const roundedDelta = Math.round(firstDelta * 100) / 100;
  if (Math.abs(roundedDelta) < 0.01) {
    elements.balanceTitle.textContent = "All even";
    elements.balanceDetail.textContent = "No one owes anything right now.";
    return;
  }

  const owedBy = roundedDelta > 0 ? state.people[1] : state.people[0];
  const owedTo = roundedDelta > 0 ? state.people[0] : state.people[1];
  elements.balanceTitle.textContent = `${owedBy} owes ${owedTo}`;
  elements.balanceDetail.textContent = `${formatMoney(Math.abs(roundedDelta))} settles everything.`;
}

function renderExpenses() {
  elements.expenseList.replaceChildren();

  if (!state.expenses.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<i data-lucide="sparkles"></i><span>No expenses or payments yet. Add the first entry above.</span>`;
    elements.expenseList.append(empty);
    return;
  }

  state.expenses
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((expense) => {
      const item = elements.expenseTemplate.content.firstElementChild.cloneNode(true);
      item.dataset.id = expense.id;
      item.classList.toggle("is-editing", expense.id === editingExpenseId);
      item.classList.toggle("payment-item", isPayment(expense));
      item.querySelector(".expense-icon i").dataset.lucide = isPayment(expense) ? "hand-coins" : "receipt";
      item.querySelector("h3").textContent = expense.title || (isPayment(expense) ? "Roommate payment" : "Shared expense");
      item.querySelector("p").textContent = isPayment(expense)
        ? `${expense.paidBy} paid ${expense.paidTo} on ${formatDate(expense.date)}`
        : `Paid by ${expense.paidBy} on ${formatDate(expense.date)}`;
      if (hasReminder(expense)) {
        const reminder = document.createElement("span");
        reminder.className = `reminder-pill${expense.reminderDone ? " is-done" : ""}`;
        reminder.innerHTML = `<i data-lucide="${expense.reminderDone ? "check" : "alarm-clock"}"></i> ${
          expense.reminderDone ? "Alarm went off" : `Alarm ${formatReminderTime(expense.reminderAt)}`
        }`;
        item.querySelector("p").after(reminder);
      }
      if (hasReceipt(expense)) {
        const receipt = document.createElement("a");
        receipt.className = "receipt-archive";
        receipt.href = expense.receipt.dataUrl;
        receipt.target = "_blank";
        receipt.rel = "noreferrer";
        receipt.download = expense.receipt.name || "receipt";
        const receiptText = document.createElement("span");

        if (expense.receipt.type.startsWith("image/")) {
          const thumbnail = document.createElement("img");
          thumbnail.src = expense.receipt.dataUrl;
          thumbnail.alt = "";
          receipt.append(thumbnail);
          receiptText.innerHTML = `<i data-lucide="archive"></i> Receipt archived`;
        } else {
          receiptText.innerHTML = `<i data-lucide="file-text"></i> `;
          receiptText.append(expense.receipt.name || "Receipt archived");
        }

        receipt.append(receiptText);
        item.querySelector("p").after(receipt);
      }
      item.querySelector("strong").textContent = formatMoney(expense.amount);
      item.querySelector(".edit-expense").ariaLabel = isPayment(expense) ? "Edit payment" : "Edit expense";
      item.querySelector(".delete-expense").ariaLabel = isPayment(expense) ? "Delete payment" : "Delete expense";
      elements.expenseList.append(item);
    });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function render() {
  renderPeople();
  renderGroup();
  renderSummary();
  renderExpenses();
  renderEditMode();
  scheduleReminders();
  saveState();

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

elements.roommatesForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const first = elements.personA.value.trim() || "Roommate 1";
  const second = elements.personB.value.trim() || "Roommate 2";
  const oldPeople = [...state.people];
  state.people = [first, second];
  state.expenses = state.expenses.map((expense) => ({
    ...expense,
    paidBy:
      expense.paidBy === oldPeople[0] ? first : expense.paidBy === oldPeople[1] ? second : expense.paidBy,
    paidTo:
      expense.paidTo === oldPeople[0] ? first : expense.paidTo === oldPeople[1] ? second : expense.paidTo,
  }));
  render();
});

elements.groupForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const groupName = elements.groupName.value.trim() || "Roomie group";
  const phone = normalizePhone(elements.invitePhone.value);

  state.groupName = groupName;

  if (phone && !state.invites.some((invite) => invite.phone === phone)) {
    state.invites.push({
      id: crypto.randomUUID(),
      phone,
      createdAt: Date.now(),
    });
  }

  elements.invitePhone.value = "";
  render();
});

elements.inviteList.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-invite");
  if (!button) {
    return;
  }

  const item = button.closest(".invite-item");
  state.invites = state.invites.filter((invite) => invite.id !== item.dataset.id);
  render();
});

function resetExpenseForm() {
  editingExpenseId = null;
  elements.expenseForm.reset();
  elements.transactionType.value = "expense";
  elements.expenseDate.value = today();
  renderTransactionMode();
  renderReminderMode();
  renderEditMode();
}

function startEditingExpense(expense) {
  editingExpenseId = expense.id;
  elements.transactionType.value = expense.type || "expense";
  elements.expenseTitle.value = expense.title || "";
  elements.expenseAmount.value = expense.amount;
  elements.paidBy.value = expense.paidBy;
  elements.expenseDate.value = expense.date;
  renderTransactionMode();

  if (isPayment(expense)) {
    elements.paidTo.value = expense.paidTo || state.people.find((person) => person !== expense.paidBy) || state.people[1];
  }

  elements.reminderToggle.checked = hasReminder(expense) && !expense.reminderDone;
  elements.reminderAt.value = hasReminder(expense) && !expense.reminderDone ? toLocalDateTimeValue(new Date(expense.reminderAt)) : "";
  renderReminderMode();
  renderEditMode();
  render();
  elements.expenseForm.scrollIntoView({ behavior: "smooth", block: "start" });
  elements.expenseTitle.focus();
}

elements.expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const type = elements.transactionType.value;
  const amount = Number(elements.expenseAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  const entry = {
    id: editingExpenseId || crypto.randomUUID(),
    type,
    title: elements.expenseTitle.value.trim(),
    amount,
    paidBy: elements.paidBy.value,
    date: elements.expenseDate.value,
    createdAt: editingExpenseId
      ? state.expenses.find((expense) => expense.id === editingExpenseId)?.createdAt || Date.now()
      : Date.now(),
  };

  if (type === "payment") {
    entry.paidTo = elements.paidTo.value;
  }

  if (elements.reminderToggle.checked) {
    const reminderAt = new Date(elements.reminderAt.value).getTime();
    if (!Number.isFinite(reminderAt)) {
      return;
    }
    entry.reminderAt = reminderAt;
    entry.reminderDone = false;
    requestNotificationPermission();
  }

  const currentEntry = editingExpenseId ? state.expenses.find((expense) => expense.id === editingExpenseId) : null;
  let receipt = null;
  try {
    receipt = await readReceiptAttachment(elements.receiptFile.files[0]);
  } catch {
    window.alert("The receipt could not be attached. Please try a different file.");
    return;
  }
  if (receipt) {
    entry.receipt = receipt;
  } else if (currentEntry && hasReceipt(currentEntry)) {
    entry.receipt = currentEntry.receipt;
  }

  if (editingExpenseId) {
    state.expenses = state.expenses.map((expense) => (expense.id === editingExpenseId ? entry : expense));
  } else {
    state.expenses.push(entry);
  }

  resetExpenseForm();
  render();
});

elements.expenseList.addEventListener("click", (event) => {
  const editButton = event.target.closest(".edit-expense");
  if (editButton) {
    const item = editButton.closest(".expense-item");
    const expense = state.expenses.find((entry) => entry.id === item.dataset.id);
    if (expense) {
      startEditingExpense(expense);
    }
    return;
  }

  const button = event.target.closest(".delete-expense");
  if (!button) {
    return;
  }

  const item = button.closest(".expense-item");
  state.expenses = state.expenses.filter((expense) => expense.id !== item.dataset.id);
  if (editingExpenseId === item.dataset.id) {
    resetExpenseForm();
  }
  render();
});

elements.transactionType.addEventListener("change", renderTransactionMode);
elements.reminderToggle.addEventListener("change", renderReminderMode);
elements.paidBy.addEventListener("change", () => {
  if (elements.transactionType.value === "payment") {
    updatePaymentRecipient();
  }
});

elements.clearAll.addEventListener("click", () => {
  if (!state.expenses.length) {
    return;
  }
  state.expenses = [];
  resetExpenseForm();
  render();
});

elements.cancelEdit.addEventListener("click", () => {
  resetExpenseForm();
  render();
});

elements.themeToggle.addEventListener("click", () => {
  const nextTheme = document.body.classList.contains("is-dark") ? "light" : "dark";
  localStorage.setItem(THEME_KEY, nextTheme);
  applyTheme(nextTheme);
});

function runTour(force = false) {
  if (!window.driver || (!force && localStorage.getItem(TOUR_KEY))) {
    return;
  }

  const driver = window.driver.js.driver({
    showProgress: true,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    onDestroyed: () => localStorage.setItem(TOUR_KEY, "true"),
    steps: [
      {
        element: "#roommates-panel",
        popover: {
          title: "Start with both names",
          description: "Add the roommates, name the group, and invite a friend by phone number.",
        },
      },
      {
        element: "#group-card",
        popover: {
          title: "Create the group",
          description: "Save a group name and keep phone invites here with quick text and call buttons.",
        },
      },
      {
        element: "#expense-panel",
        popover: {
          title: "Log expenses and alarms",
          description: "Enter what it was, the amount, who paid, attach a receipt, and optionally set an alarm.",
        },
      },
      {
        element: "#summary-panel",
        popover: {
          title: "See the totals instantly",
          description: "These cards update as soon as you add, delete, or clear expenses.",
        },
      },
      {
        element: "#list-panel",
        popover: {
          title: "Review and edit history",
          description: "Use the history list to edit or delete recent expenses, payments, and receipt attachments.",
        },
      },
      {
        element: "#balance-card",
        popover: {
          title: "Settle up fast",
          description: "This tells you who owes whom so both people end up paying half.",
        },
      },
    ],
  });

  driver.drive();
}

elements.restartTour.addEventListener("click", () => runTour(true));

elements.expenseDate.value = today();
elements.reminderAt.min = toLocalDateTimeValue();
applyTheme(savedTheme());
renderTransactionMode();
renderReminderMode();
render();

window.addEventListener("load", () => {
  window.setTimeout(() => runTour(false), 450);
});

window.setInterval(checkReminders, REMINDER_CHECK_INTERVAL);

function requestNotificationPermission() {
  if (!("Notification" in window) || Notification.permission !== "default") {
    return;
  }
  Notification.requestPermission();
}

function scheduleReminders() {
  reminderTimers.forEach((timer) => window.clearTimeout(timer));
  reminderTimers.clear();

  const now = Date.now();
  state.expenses.forEach((entry) => {
    if (!hasReminder(entry) || entry.reminderDone || entry.reminderAt <= now) {
      return;
    }

    const delay = Math.min(entry.reminderAt - now, MAX_TIMEOUT_DELAY);
    reminderTimers.set(entry.id, window.setTimeout(checkReminders, delay));
  });
}

function checkReminders() {
  const dueReminders = state.expenses.filter(
    (entry) => hasReminder(entry) && !entry.reminderDone && entry.reminderAt <= Date.now(),
  );

  if (!dueReminders.length) {
    return;
  }

  dueReminders.forEach((entry) => {
    entry.reminderDone = true;
    showReminder(entry);
  });
  render();
}

function showReminder(entry) {
  const title = entry.title || (isPayment(entry) ? "Roommate payment" : "Shared expense");
  const message = `${title}: ${formatMoney(entry.amount)} ${isPayment(entry) ? "payment" : "expense"} is due now.`;

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Roomie Bloom alarm", {
      body: message,
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23ffd166'/%3E%3Ctext x='32' y='42' font-size='34' text-anchor='middle'%3E%24%3C/text%3E%3C/svg%3E",
    });
    return;
  }

  window.alert(`Roomie Bloom alarm: ${message}`);
}
