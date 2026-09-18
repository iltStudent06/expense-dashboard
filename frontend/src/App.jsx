import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, Outlet, Route, Routes } from "react-router-dom";

// Optional API prefix, useful when frontend and backend are hosted on different origins.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

// Formats numeric values as USD for dashboard metrics and table amounts.
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amount || 0);
}

// Initializes the month filter to the current year-month (YYYY-MM).
function getCurrentMonth() {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

// Shared fetch helper that applies JSON headers and normalizes API errors.
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    let errorMessage = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.error) {
        errorMessage = payload.error;
      }
    } catch {
      // ignore malformed JSON
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

function AppShell() {
  return (
    <>
      <header className="topbar">
        <div className="page topbar-inner">
          <Link to="/" className="brand-link" aria-label="Expense Tracker dashboard">
            <span className="brand-mark">$</span>
            <span>Expense Tracker</span>
          </Link>

          <nav className="topnav" aria-label="Primary navigation">
            <Link to="/">Dashboard</Link>
            <Link to="/login">Login</Link>
            <Link to="/register">Register</Link>
          </nav>
        </div>
      </header>

      <Outlet />
    </>
  );
}

function LoginPage() {
  return (
    <main className="page">
      <section className="panel auth-panel">
        <div>
          <p className="eyebrow">Authentication</p>
          <h1>Login</h1>
          <p>
            Authentication is the next step. This route is now ready for the future sign-in form
            and JWT flow.
          </p>
        </div>
        <div className="auth-actions">
          <Link to="/" className="button-secondary">
            Back to dashboard
          </Link>
          <Link to="/register" className="button-primary">
            Go to register
          </Link>
        </div>
      </section>
    </main>
  );
}

function RegisterPage() {
  return (
    <main className="page">
      <section className="panel auth-panel">
        <div>
          <p className="eyebrow">Authentication</p>
          <h1>Register</h1>
          <p>
            Registration will live here once authentication is added. The route is already wired
            up under the /app basename.
          </p>
        </div>
        <div className="auth-actions">
          <Link to="/" className="button-secondary">
            Back to dashboard
          </Link>
          <Link to="/login" className="button-primary">
            Go to login
          </Link>
        </div>
      </section>
    </main>
  );
}

function DashboardPage() {
  // Global dashboard state: filters, API data, and request/error lifecycle.
  const [month, setMonth] = useState(getCurrentMonth());
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Inline editing state for a selected transaction row.
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    type: "expense",
    amount: "",
    category: "",
    description: "",
    date: ""
  });

  // Form state for creating a new transaction.
  const [form, setForm] = useState({
    type: "expense",
    amount: "",
    category: "",
    description: "",
    date: new Date().toISOString().slice(0, 10)
  });

  // Loads transactions, summary, and trend data for the selected month.
  async function loadDashboard(selectedMonth) {
    setLoading(true);
    setError("");

    try {
      const [txData, summaryData, trendData] = await Promise.all([
        request(`/api/transactions?month=${selectedMonth}`),
        request(`/api/summary?month=${selectedMonth}`),
        request("/api/trends?months=6")
      ]);

      setTransactions(txData);
      setSummary(summaryData);
      setTrends(trendData.trends || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  // Refresh dashboard whenever the month filter changes.
  useEffect(() => {
    loadDashboard(month);
  }, [month]);

  // Creates a new transaction and refreshes dashboard data.
  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      await request("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount)
        })
      });

      setForm((prev) => ({
        ...prev,
        amount: "",
        category: "",
        description: ""
      }));
      await loadDashboard(month);
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  // Puts a table row into edit mode and pre-fills editable fields.
  function startEditing(item) {
    setEditingId(item.id);
    setEditForm({
      type: item.type,
      amount: String(item.amount),
      category: item.category,
      description: item.description || "",
      date: new Date(item.date).toISOString().slice(0, 10)
    });
  }

  // Exits edit mode and clears temporary edit fields.
  function cancelEditing() {
    setEditingId(null);
    setEditForm({
      type: "expense",
      amount: "",
      category: "",
      description: "",
      date: ""
    });
  }

  // Saves an edited transaction via API and refreshes current view.
  async function handleUpdate(itemId) {
    setError("");

    try {
      await request(`/api/transactions/${itemId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...editForm,
          amount: Number(editForm.amount)
        })
      });

      cancelEditing();
      await loadDashboard(month);
    } catch (updateError) {
      setError(updateError.message);
    }
  }

  // Deletes a transaction via API and refreshes current view.
  async function handleDelete(itemId) {
    setError("");

    try {
      await request(`/api/transactions/${itemId}`, {
        method: "DELETE"
      });

      if (editingId === itemId) {
        cancelEditing();
      }

      await loadDashboard(month);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  // Derived totals fallback while summary is loading/unavailable.
  const totals = summary?.totals ?? { income: 0, expenses: 0, balance: 0 };

  // Sorts transactions newest-first for the Recent Transactions table.
  const orderedTransactions = useMemo(
    () => [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [transactions]
  );

  return (
    <main className="page">
      <section className="panel">
        <p className="eyebrow">Dashboard</p>
        <h1>Expense Tracker / Budget Dashboard</h1>
        <p className="section-copy">
          Track transactions, review monthly totals, and inspect trend data from the API.
        </p>
      </section>

      {/* Transaction entry form */}
      <section className="panel">
        <h2>Log Transaction</h2>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Type
            <select
              value={form.type}
              onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>

          <label>
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.amount}
              onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            />
          </label>

          <label>
            Category
            <input
              type="text"
              required
              value={form.category}
              onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            />
          </label>

          <label>
            Date
            <input
              type="date"
              required
              value={form.date}
              onChange={(event) => setForm((prev) => ({ ...prev, date: event.target.value }))}
            />
          </label>

          <label className="span-2">
            Description
            <input
              type="text"
              value={form.description}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>

          <button type="submit">Save Transaction</button>
        </form>
      </section>

      {/* Month filter controlling table and summary scope */}
      <section className="panel filters">
        <h2>Filters</h2>
        <label>
          Month
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
        </label>
      </section>

      {/* Request status messages */}
      {error ? <p className="error">{error}</p> : null}
      {loading ? <p>Loading...</p> : null}

      {/* High-level totals for selected month */}
      <section className="grid">
        <article className="panel">
          <h3>Income</h3>
          <p className="metric">{formatCurrency(totals.income)}</p>
        </article>
        <article className="panel">
          <h3>Expenses</h3>
          <p className="metric">{formatCurrency(totals.expenses)}</p>
        </article>
        <article className="panel">
          <h3>Balance</h3>
          <p className="metric">{formatCurrency(totals.balance)}</p>
        </article>
      </section>

      {/* Transaction list with inline edit/delete actions */}
      <section className="panel">
        <h2>Recent Transactions</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Category</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orderedTransactions.map((item) => {
                const isEditing = editingId === item.id;

                return (
                  <tr key={item.id}>
                    <td>
                      {isEditing ? (
                        <input
                          type="date"
                          value={editForm.date}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, date: event.target.value }))
                          }
                        />
                      ) : (
                        new Date(item.date).toLocaleDateString()
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          value={editForm.type}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, type: event.target.value }))
                          }
                        >
                          <option value="expense">Expense</option>
                          <option value="income">Income</option>
                        </select>
                      ) : (
                        item.type
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.category}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, category: event.target.value }))
                          }
                        />
                      ) : (
                        item.category
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.description}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, description: event.target.value }))
                          }
                        />
                      ) : (
                        item.description || "—"
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm.amount}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, amount: event.target.value }))
                          }
                        />
                      ) : (
                        formatCurrency(item.amount)
                      )}
                    </td>
                    <td>
                      <div className="actions">
                        {isEditing ? (
                          <>
                            <button type="button" onClick={() => handleUpdate(item.id)}>
                              Save
                            </button>
                            <button type="button" onClick={cancelEditing}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => startEditing(item)}>
                              Edit
                            </button>
                            <button type="button" onClick={() => handleDelete(item.id)}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!orderedTransactions.length ? (
                <tr>
                  <td colSpan={6}>No transactions for selected month.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Multi-month trend breakdown for income/expenses/balance */}
      <section className="panel">
        <h2>Trends (Last 6 Months)</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Income</th>
                <th>Expenses</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {trends.map((item) => (
                <tr key={item.month}>
                  <td>{item.month}</td>
                  <td>{formatCurrency(item.income)}</td>
                  <td>{formatCurrency(item.expenses)}</td>
                  <td>{formatCurrency(item.balance)}</td>
                </tr>
              ))}
              {!trends.length ? (
                <tr>
                  <td colSpan={4}>No trend data available.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
