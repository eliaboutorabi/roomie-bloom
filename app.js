const STORAGE_KEY = "roomie-bloom-state";
const TOUR_KEY = "roomie-bloom-tour-complete";

const state = loadState();

const elements = {
  roommatesForm: document.querySelector("#roommates-form"),
  personA: document.querySelector("#person-a"),
  personB: document.querySelector("#person-b"),
  paidBy: document.querySelector("#expense-paid-by"),
  expenseForm: document.querySelector("#expense-form"),
  expenseTitle: document.querySelector("#expense-title"),
  expenseAmount: document.querySelector("#expense-amount"),
  expenseDate: document.querySelector("#expense-date"),
  totalShared: document.querySelector("#total-shared"),
  paidA: document.querySelector("#paid-a"),
  paidB: document.querySelector("#paid-b"),
  paidALabel: document.querySelector("#paid-a-label"),
  paidBLabel: document.querySelector("#paid-b-label"),
  balanceTitle: document.querySelector("#balance-title"),
  balanceDetail: document.querySelector("#balance-detail"),
  expenseList: document.querySelector("#expense-list"),
  expenseTemplate: document.querySelector("#expense-template"),
  clearAll: document.querySelector("#clear-all"),
  restartTour: document.querySelector("#restart-tour"),
};

function loadState() {
  const fallback = {
    people: ["Maya", "Lily"],
    expenses: [],
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.people) || !Array.isArray(saved.expenses)) {
      return fallback;
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

function totals() {
  const paid = Object.fromEntries(state.people.map((person) => [person, 0]));
  const total = state.expenses.reduce((sum, expense) => {
    paid[expense.paidBy] = (paid[expense.paidBy] || 0) + expense.amount;
    return sum + expense.amount;
  }, 0);

  const expectedShare = total / 2;
  const firstDelta = paid[state.people[0]] - expectedShare;
  return { total, paid, expectedShare, firstDelta };
}

function renderPeople() {
  elements.personA.value = state.people[0];
  elements.personB.value = state.people[1];
  elements.paidBy.replaceChildren();

  state.people.forEach((person) => {
    const option = document.createElement("option");
    option.value = person;
    option.textContent = person;
    elements.paidBy.append(option);
  });

  elements.paidALabel.textContent = `${state.people[0]} paid`;
  elements.paidBLabel.textContent = `${state.people[1]} paid`;
}

function renderSummary() {
  const { total, paid, firstDelta } = totals();
  elements.totalShared.textContent = formatMoney(total);
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
    empty.textContent = "No expenses yet. Add your first shared purchase above.";
    elements.expenseList.append(empty);
    return;
  }

  state.expenses
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .forEach((expense) => {
      const item = elements.expenseTemplate.content.firstElementChild.cloneNode(true);
      item.dataset.id = expense.id;
      item.querySelector("h3").textContent = expense.title;
      item.querySelector("p").textContent = `Paid by ${expense.paidBy} on ${formatDate(expense.date)}`;
      item.querySelector("strong").textContent = formatMoney(expense.amount);
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
  }));
  render();
});

elements.expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(elements.expenseAmount.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return;
  }

  state.expenses.push({
    id: crypto.randomUUID(),
    title: elements.expenseTitle.value.trim(),
    amount,
    paidBy: elements.paidBy.value,
    date: elements.expenseDate.value,
    createdAt: Date.now(),
  });

  elements.expenseForm.reset();
  elements.expenseDate.value = today();
  render();
});

elements.expenseList.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-expense");
  if (!button) {
    return;
  }

  const item = button.closest(".expense-item");
  state.expenses = state.expenses.filter((expense) => expense.id !== item.dataset.id);
  render();
});

elements.clearAll.addEventListener("click", () => {
  if (!state.expenses.length) {
    return;
  }
  state.expenses = [];
  render();
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
          description: "Add the two roommates so the app can split every shared cost evenly.",
        },
      },
      {
        element: "#expense-panel",
        popover: {
          title: "Log each shared expense",
          description: "Enter what it was, the amount, the date, and who paid at the register.",
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
render();

window.addEventListener("load", () => {
  window.setTimeout(() => runTour(false), 450);
});
