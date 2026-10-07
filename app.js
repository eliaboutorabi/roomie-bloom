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
  roommateFields: document.querySelector("#roommate-fields"),
  addRoommate: document.querySelector("#add-roommate"),
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
  roommatePaidCards: document.querySelector("#roommate-paid-cards"),
  balanceTitle: document.querySelector("#balance-title"),
  balanceDetail: document.querySelector("#balance-detail"),
  expenseList: document.querySelector("#expense-list"),
  expenseTemplate: document.querySelector("#expense-template"),
  historySearch: document.querySelector("#history-search"),
  clearSearch: document.querySelector("#clear-search"),
  clearAll: document.querySelector("#clear-all"),
  cancelEdit: document.querySelector("#cancel-edit"),
  themeToggle: document.querySelector("#theme-toggle"),
  restartTour: document.querySelector("#restart-tour"),
  sidebar: document.querySelector(".app-sidebar"),
  sidebarLinks: document.querySelectorAll(".sidebar-nav [data-view]"),
  viewPanels: document.querySelectorAll("[data-view-panel]"),
};

function applyTheme(theme) {
  const isDark = theme === "dark";
  document.body.classList.toggle("is-dark", isDark);
  elements.themeToggle.setAttribute("aria-pressed", String(isDark));
  const icon = document.createElement("i");
  icon.dataset.lucide = isDark ? "sun" : "moon";
  elements.themeToggle.replaceChildren(icon);

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
    expenses: [],
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.people) || !Array.isArray(saved.expenses)) {
      return fallback;
    }
    saved.people = normalizePeople(saved.people, fallback.people);
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

function normalizePeople(people, fallback = ["Eli", "bahar"]) {
  const cleaned = people.map((person) => String(person || "").trim()).filter(Boolean);
  return cleaned.length >= 2 ? cleaned : fallback;
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

function setActiveView(view, updateHash = true) {
  const nextView = [...elements.viewPanels].some((panel) => panel.dataset.viewPanel === view) ? view : "add";

  elements.viewPanels.forEach((panel) => {
    panel.classList.toggle("is-active", panel.dataset.viewPanel === nextView);
  });

  elements.sidebarLinks.forEach((link) => {
    const isCurrent = link.dataset.view === nextView;
    if (isCurrent) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  if (updateHash) {
    const activeLink = [...elements.sidebarLinks].find((link) => link.dataset.view === nextView);
    if (activeLink) {
      history.replaceState(null, "", activeLink.getAttribute("href"));
    }
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

function viewFromHash(hash) {
  const link = [...elements.sidebarLinks].find((item) => item.getAttribute("href") === hash);
  return link?.dataset.view || "add";
}

function expenseMatchesSearch(entry, query) {
  if (!query) {
    return true;
  }

  const searchable = [
    entry.title,
    entry.type === "payment" ? "payment" : "expense",
    entry.paidBy,
    entry.paidTo,
    entry.date,
    formatDate(entry.date),
    formatMoney(entry.amount),
    String(entry.amount),
    hasReceipt(entry) ? "receipt archived attachment" : "",
    entry.receipt?.name,
    hasReminder(entry) ? "alarm reminder" : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(query);
}

function totals() {
  const paid = Object.fromEntries(state.people.map((person) => [person, 0]));
  const paymentDelta = Object.fromEntries(state.people.map((person) => [person, 0]));
  let total = 0;
  let payments = 0;

  state.expenses.forEach((entry) => {
    if (isPayment(entry)) {
      payments += entry.amount;
      if (entry.paidBy in paymentDelta) {
        paymentDelta[entry.paidBy] += entry.amount;
      }
      if (entry.paidTo in paymentDelta) {
        paymentDelta[entry.paidTo] -= entry.amount;
      }
      return;
    }

    paid[entry.paidBy] = (paid[entry.paidBy] || 0) + entry.amount;
    total += entry.amount;
  });

  const expectedShare = total / state.people.length;
  const balances = Object.fromEntries(
    state.people.map((person) => [person, (paid[person] || 0) - expectedShare + (paymentDelta[person] || 0)]),
  );
  return { total, paid, payments, expectedShare, balances };
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

function fillPaymentRecipientSelect() {
  const recipients = state.people.filter((person) => person !== elements.paidBy.value);
  fillPersonSelect(elements.paidTo, recipients.length ? recipients : state.people);
}

function createRoommateField(name = "", index = 0) {
  const row = document.createElement("div");
  row.className = "roommate-row";

  const label = document.createElement("label");
  label.append(`Roommate ${index + 1}`);

  const input = document.createElement("input");
  input.className = "roommate-name";
  input.type = "text";
  input.autocomplete = "given-name";
  input.required = index < 2;
  input.value = name;
  input.placeholder = `Roommate ${index + 1}`;

  label.append(input);
  row.append(label);

  if (index >= 2) {
    const remove = document.createElement("button");
    remove.className = "icon-button remove-roommate";
    remove.type = "button";
    remove.ariaLabel = `Remove roommate ${index + 1}`;
    remove.innerHTML = `<i data-lucide="x"></i>`;
    row.append(remove);
  }

  return row;
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
  elements.roommateFields.replaceChildren(
    ...state.people.map((person, index) => createRoommateField(person, index)),
  );
  fillPersonSelect(elements.paidBy, state.people);
  fillPaymentRecipientSelect();
  if (elements.transactionType.value === "payment" && (!elements.paidTo.value || elements.paidTo.value === elements.paidBy.value)) {
    updatePaymentRecipient();
  }
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
  const { total, paid, payments, balances } = totals();
  elements.totalShared.textContent = formatMoney(total);
  elements.totalPayments.textContent = formatMoney(payments);
  elements.roommatePaidCards.replaceChildren(
    ...state.people.map((person, index) => {
      const card = document.createElement("article");
      const palette = ["teal", "yellow", "coral", "lavender"][index % 4];
      const icon = document.createElement("div");
      const iconGlyph = document.createElement("i");
      const label = document.createElement("p");
      const amount = document.createElement("strong");
      card.className = `mini-card ${palette}`;
      icon.className = "mini-icon";
      iconGlyph.dataset.lucide = index % 2 === 0 ? "credit-card" : "wallet";
      label.textContent = `${person} paid`;
      amount.textContent = formatMoney(paid[person] || 0);
      icon.append(iconGlyph);
      card.append(icon, label, amount);
      return card;
    }),
  );

  const settlements = settlementSuggestions(balances);
  if (!settlements.length) {
    elements.balanceTitle.textContent = "All even";
    elements.balanceDetail.textContent = "No one owes anything right now.";
    return;
  }

  elements.balanceTitle.textContent = "Settle up";
  elements.balanceDetail.replaceChildren(
    ...settlements.map((settlement) => {
      const line = document.createElement("span");
      line.textContent = `${settlement.from} pays ${settlement.to} ${formatMoney(settlement.amount)}`;
      return line;
    }),
  );
}

function settlementSuggestions(balances) {
  const debtors = [];
  const creditors = [];

  Object.entries(balances).forEach(([person, balance]) => {
    const amount = Math.round(balance * 100) / 100;
    if (amount < -0.01) {
      debtors.push({ person, amount: Math.abs(amount) });
    } else if (amount > 0.01) {
      creditors.push({ person, amount });
    }
  });

  const settlements = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);

    settlements.push({
      from: debtor.person,
      to: creditor.person,
      amount,
    });

    debtor.amount = Math.round((debtor.amount - amount) * 100) / 100;
    creditor.amount = Math.round((creditor.amount - amount) * 100) / 100;

    if (debtor.amount < 0.01) {
      debtorIndex += 1;
    }
    if (creditor.amount < 0.01) {
      creditorIndex += 1;
    }
  }

  return settlements;
}

function renderExpenses() {
  elements.expenseList.replaceChildren();
  const query = elements.historySearch.value.trim().toLowerCase();
  elements.clearSearch.classList.toggle("is-hidden", !query);

  if (!state.expenses.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<i data-lucide="sparkles"></i><span>No expenses or payments yet. Add the first entry above.</span>`;
    elements.expenseList.append(empty);
    if (window.lucide) {
      window.lucide.createIcons();
    }
    return;
  }

  const visibleExpenses = state.expenses
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .filter((expense) => expenseMatchesSearch(expense, query));

  if (!visibleExpenses.length) {
    const empty = document.createElement("div");
    const icon = document.createElement("i");
    const text = document.createElement("span");
    empty.className = "empty-state";
    icon.dataset.lucide = "search-x";
    text.textContent = `No history matches "${elements.historySearch.value.trim()}".`;
    empty.append(icon, text);
    elements.expenseList.append(empty);
    if (window.lucide) {
      window.lucide.createIcons();
    }
    return;
  }

  visibleExpenses.forEach((expense) => {
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
  const nextPeople = normalizePeople(
    [...elements.roommateFields.querySelectorAll(".roommate-name")].map((input, index) =>
      input.value.trim() || `Roommate ${index + 1}`,
    ),
  );
  const oldPeople = [...state.people];
  const renamedPeople = Object.fromEntries(oldPeople.map((person, index) => [person, nextPeople[index]]));
  state.people = nextPeople;
  state.expenses = state.expenses.map((expense) => ({
    ...expense,
    paidBy: renamedPeople[expense.paidBy] || (nextPeople.includes(expense.paidBy) ? expense.paidBy : nextPeople[0]),
    paidTo:
      renamedPeople[expense.paidTo] ||
      (nextPeople.includes(expense.paidTo)
        ? expense.paidTo
        : nextPeople.find((person) => person !== (renamedPeople[expense.paidBy] || expense.paidBy)) || nextPeople[1]),
  }));
  render();
});

elements.addRoommate.addEventListener("click", () => {
  const index = elements.roommateFields.querySelectorAll(".roommate-name").length;
  elements.roommateFields.append(createRoommateField("", index));
  if (window.lucide) {
    window.lucide.createIcons();
  }
  elements.roommateFields.querySelector(".roommate-row:last-child input").focus();
});

elements.roommateFields.addEventListener("click", (event) => {
  const button = event.target.closest(".remove-roommate");
  if (!button) {
    return;
  }

  button.closest(".roommate-row").remove();
  [...elements.roommateFields.querySelectorAll(".roommate-row")].forEach((row, index) => {
    const label = row.querySelector("label");
    const input = row.querySelector("input");
    label.firstChild.textContent = `Roommate ${index + 1}`;
    input.placeholder = `Roommate ${index + 1}`;
    input.required = index < 2;
  });
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
  setActiveView("add");
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
elements.historySearch.addEventListener("input", renderExpenses);
elements.clearSearch.addEventListener("click", () => {
  elements.historySearch.value = "";
  renderExpenses();
  elements.historySearch.focus();
});
elements.sidebar.addEventListener("click", (event) => {
  const link = event.target.closest("[data-view]");
  if (!link) {
    return;
  }

  event.preventDefault();
  setActiveView(link.dataset.view);
});
elements.paidBy.addEventListener("change", () => {
  if (elements.transactionType.value === "payment") {
    fillPaymentRecipientSelect();
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
          description: "Add everyone who shares the home so the app can split expenses and payments correctly.",
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
          title: "Search and edit history",
          description: "Search the history list, then edit or delete recent expenses, payments, and receipt attachments.",
        },
      },
      {
        element: "#balance-card",
        popover: {
          title: "Settle up fast",
          description: "This tells you who owes whom so every roommate ends up paying their fair share.",
        },
      },
    ],
  });

  driver.drive();
}

elements.restartTour.addEventListener("click", () => {
  setActiveView("roommates");
  runTour(true);
});

elements.expenseDate.value = today();
elements.reminderAt.min = toLocalDateTimeValue();
applyTheme(savedTheme());
setActiveView(viewFromHash(window.location.hash), Boolean(window.location.hash));
renderTransactionMode();
renderReminderMode();
render();

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
