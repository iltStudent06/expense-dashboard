import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate } from "react-router-dom";

// Optional API prefix, useful when frontend and backend are hosted on different origins.
const API_BASE = import.meta.env.VITE_API_BASE ?? "";
const AUTH_STORAGE_KEY = "expense-dashboard-auth";

const AuthContext = createContext(null);

function loadAuthSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveAuthSession(session) {
  if (session) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}

function AuthProvider({ children }) {
  const [session, setSession] = useState(loadAuthSession);

  function signIn(nextSession) {
    setSession(nextSession);
    saveAuthSession(nextSession);
  }

  function signOut() {
    setSession(null);
    saveAuthSession(null);
  }

  return (
    <AuthContext.Provider value={{ session, signIn, signOut, isAuthenticated: Boolean(session?.token) }}>
      {children}
    </AuthContext.Provider>
  );
}

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

function buildDashboardQuery(selectedMonth, selectedCategory) {
  const params = new URLSearchParams();

  if (selectedMonth) {
    params.set("month", selectedMonth);
  }

  if (selectedCategory) {
    params.set("category", selectedCategory);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function getBreakdownEntries(group = {}) {
  return Object.entries(group)
    .map(([name, amount]) => ({ name, amount: Number(amount) || 0 }))
    .sort((a, b) => b.amount - a.amount);
}

function getTrendPresentation(metric) {
  if (metric === "income") {
    return { label: "Income", className: "income", accent: "#10b981" };
  }

  if (metric === "expenses") {
    return { label: "Expenses", className: "expense", accent: "#ef4444" };
  }

  return { label: "Balance", className: "balance", accent: "#2563eb" };
}

// Shared fetch helper that applies JSON headers and normalizes API errors.
async function request(path, options = {}) {
  const session = loadAuthSession();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
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
  const { isAuthenticated, signOut } = useAuth();

  return (
    <>
      <header className="topbar">
        <div className="page topbar-inner">
          <Link to="/" className="brand-link" aria-label="Expense Tracker dashboard">
            <span className="brand-mark">$</span>
            <span>Expense Tracker</span>
          </Link>

          <nav className="topnav" aria-label="Primary navigation">
            {isAuthenticated ? (
              <>
                <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : undefined)}>
                  Dashboard
                </NavLink>
                <NavLink
                  to="/categories"
                  className={({ isActive }) => (isActive ? "active" : undefined)}
                >
                  Categories
                </NavLink>
              </>
            ) : (
              <>
                <NavLink
                  to="/login"
                  className={({ isActive }) => (isActive ? "active" : undefined)}
                >
                  Login
                </NavLink>
                <NavLink
                  to="/register"
                  className={({ isActive }) => (isActive ? "active" : undefined)}
                >
                  Register
                </NavLink>
              </>
            )}
            {isAuthenticated ? (
              <button type="button" className="topnav-button" onClick={signOut}>
                Logout
              </button>
            ) : null}
          </nav>
        </div>
      </header>

      <Outlet />
    </>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(form)
      });

      signIn(response);
      navigate("/");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="panel auth-panel">
        <div className="auth-copy">
          <p className="eyebrow">Authentication</p>
          <h1>Login</h1>
          <p>Sign in to manage transactions and use the protected write endpoints.</p>
        </div>
      </section>

      <section className="panel auth-panel">
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              required
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            />
          </label>

          {error ? <p className="error">{error}</p> : null}

          <div className="auth-actions">
            <Link to="/register" className="button-secondary">
              Need an account?
            </Link>
            <button type="submit" className="button-primary" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function RegisterPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(form)
      });

      signIn(response);
      navigate("/");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page">
      <section className="panel auth-panel">
        <div className="auth-copy">
          <p className="eyebrow">Authentication</p>
          <h1>Register</h1>
          <p>Create an account to access protected transaction actions.</p>
        </div>
      </section>

      <section className="panel auth-panel">
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            Name
            <input
              type="text"
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>
          <label>
            Email
            <input
              type="email"
              required
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            />
          </label>
          <label>
            Role
            <select
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value }))}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          {error ? <p className="error">{error}</p> : null}

          <div className="auth-actions">
            <Link to="/login" className="button-secondary">
              Have an account?
            </Link>
            <button type="submit" className="button-primary" disabled={loading}>
              {loading ? "Creating..." : "Create account"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function DashboardPage() {
  // Global dashboard state: filters, API data, and request/error lifecycle.
  const [month, setMonth] = useState(getCurrentMonth());
  const [categoryFilter, setCategoryFilter] = useState("");
  const [trendMetric, setTrendMetric] = useState("balance");
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState([]);
  const [overview, setOverview] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Inline editing state for a selected transaction row.
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    type: "expense",
    amount: "",
    categoryId: "",
    category: "",
    description: "",
    date: ""
  });

  // Form state for creating a new transaction.
  const [form, setForm] = useState({
    type: "expense",
    amount: "",
    categoryId: "",
    category: "",
    description: "",
    date: new Date().toISOString().slice(0, 10)
  });

  // Loads transactions, summary, and trend data for the selected month.
  async function loadDashboard(selectedMonth, selectedCategory) {
    setLoading(true);
    setError("");

    try {
      const query = buildDashboardQuery(selectedMonth, selectedCategory);
      const [txData, summaryData, trendData, overviewData, categoryData] = await Promise.all([
        request(`/api/transactions${query}`),
        request(`/api/summary${query}`),
        request("/api/trends?months=6"),
        request("/api/dashboard"),
        request("/api/categories")
      ]);

      setTransactions(txData);
      setSummary(summaryData);
      setTrends(trendData.trends || []);
      setOverview(overviewData);
      setCategories(categoryData);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  // Refresh dashboard whenever the month filter changes.
  useEffect(() => {
    loadDashboard(month, categoryFilter);
  }, [month, categoryFilter]);

  // Creates a new transaction and refreshes dashboard data.
  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    try {
      await request("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          ...(form.categoryId ? { categoryId: form.categoryId } : {}),
          amount: Number(form.amount)
        })
      });

      setForm((prev) => ({
        ...prev,
        amount: "",
        categoryId: "",
        category: "",
        description: ""
      }));
      await loadDashboard(month, categoryFilter);
    } catch (submitError) {
      setError(submitError.message);
    }
  }

  // Puts a table row into edit mode and pre-fills editable fields.
  function startEditing(item) {
    const matchedCategory =
      categories.find((entry) => entry.id === item.categoryId) ??
      categories.find((entry) => entry.name.toLowerCase() === String(item.category).toLowerCase());

    setEditingId(item.id);
    setEditForm({
      type: item.type,
      amount: String(item.amount),
      categoryId: matchedCategory?.id ?? item.categoryId ?? "",
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
      categoryId: "",
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
          ...(editForm.categoryId ? { categoryId: editForm.categoryId } : {}),
          amount: Number(editForm.amount)
        })
      });

      cancelEditing();
      await loadDashboard(month, categoryFilter);
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

      await loadDashboard(month, categoryFilter);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  // Derived totals fallback while summary is loading/unavailable.
  const totals = summary?.totals ?? { income: 0, expenses: 0, balance: 0 };
  const appTotals = overview?.totals ?? { transactions: 0, users: 0, categories: 0 };
  const expenseBreakdown = getBreakdownEntries(summary?.byCategory?.expenses);
  const incomeBreakdown = getBreakdownEntries(summary?.byCategory?.income);
  const maxBreakdownAmount = Math.max(
    1,
    ...expenseBreakdown.map((entry) => entry.amount),
    ...incomeBreakdown.map((entry) => entry.amount)
  );
  const trendPresentation = getTrendPresentation(trendMetric);
  const maxTrendAmount = Math.max(1, ...trends.map((entry) => Math.abs(Number(entry[trendMetric]) || 0)));

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
          Track transactions, review monthly totals, inspect trend data, and manage model
          relationships with categories.
        </p>
      </section>

      <section className="grid">
        <article className="panel">
          <h3>Total Transactions</h3>
          <p className="metric">{appTotals.transactions}</p>
        </article>
        <article className="panel">
          <h3>Total Users</h3>
          <p className="metric">{appTotals.users}</p>
        </article>
        <article className="panel">
          <h3>Total Categories</h3>
          <p className="metric">{appTotals.categories}</p>
        </article>
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
            Linked Category
            <select
              value={form.categoryId}
              onChange={(event) => {
                const selectedId = event.target.value;
                const selectedCategory = categories.find((entry) => entry.id === selectedId);

                setForm((prev) => ({
                  ...prev,
                  categoryId: selectedId,
                  category: selectedCategory?.name ?? prev.category
                }));
              }}
            >
              <option value="">None</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
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
        <div className="filter-grid">
          <label>
            Month
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>

          <label>
            Category
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((item) => (
                <option key={item.id} value={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
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

      <section className="grid grid-2">
        <article className="panel">
          <h2>Expense Breakdown</h2>
          <div className="breakdown-list" aria-label="Expense breakdown by category">
            {expenseBreakdown.length ? (
              expenseBreakdown.map((entry) => (
                <div key={`expense-${entry.name}`} className="breakdown-item">
                  <div className="breakdown-labels">
                    <span>{entry.name}</span>
                    <strong>{formatCurrency(entry.amount)}</strong>
                  </div>
                  <div className="breakdown-bar-shell">
                    <div
                      className="breakdown-bar expense"
                      style={{ width: `${(entry.amount / maxBreakdownAmount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No expense categories for the current filter.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <h2>Income Breakdown</h2>
          <div className="breakdown-list" aria-label="Income breakdown by category">
            {incomeBreakdown.length ? (
              incomeBreakdown.map((entry) => (
                <div key={`income-${entry.name}`} className="breakdown-item">
                  <div className="breakdown-labels">
                    <span>{entry.name}</span>
                    <strong>{formatCurrency(entry.amount)}</strong>
                  </div>
                  <div className="breakdown-bar-shell">
                    <div
                      className="breakdown-bar income"
                      style={{ width: `${(entry.amount / maxBreakdownAmount) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">No income categories for the current filter.</p>
            )}
          </div>
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
                        <div className="cell-stack">
                          <input
                            type="text"
                            value={editForm.category}
                            onChange={(event) =>
                              setEditForm((prev) => ({ ...prev, category: event.target.value }))
                            }
                          />
                          <select
                            value={editForm.categoryId}
                            onChange={(event) => {
                              const selectedId = event.target.value;
                              const selectedCategory = categories.find((entry) => entry.id === selectedId);

                              setEditForm((prev) => ({
                                ...prev,
                                categoryId: selectedId,
                                category: selectedCategory?.name ?? prev.category
                              }));
                            }}
                          >
                            <option value="">No linked category</option>
                            {categories.map((categoryOption) => (
                              <option key={categoryOption.id} value={categoryOption.id}>
                                {categoryOption.name}
                              </option>
                            ))}
                          </select>
                        </div>
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
        <div className="panel-heading">
          <div>
            <h2>Trends (Last 6 Months)</h2>
            <p className="muted">Switch between income, expenses, and balance to compare months.</p>
          </div>

          <label className="trend-select">
            Trend Metric
            <select value={trendMetric} onChange={(event) => setTrendMetric(event.target.value)}>
              <option value="income">Income</option>
              <option value="expenses">Expenses</option>
              <option value="balance">Balance</option>
            </select>
          </label>
        </div>

        <div className="trend-chart-panel">
          <div className="trend-summary">
            <span
              className={`trend-dot ${trendPresentation.className}`}
              aria-hidden="true"
            />
            <div>
              <p className="eyebrow">Active metric</p>
              <h3>{trendPresentation.label}</h3>
            </div>
          </div>

          <div className="trend-chart" aria-label={`${trendPresentation.label} trend chart`}>
          {trends.map((item) => (
            <div key={`trend-chart-${item.month}`} className="trend-card">
              <div className="trend-row-header">
                <span>{item.month}</span>
                <strong>{formatCurrency(item[trendMetric])}</strong>
              </div>
              <div className="breakdown-bar-shell trend-bar-shell">
                <div
                  className={`breakdown-bar ${trendPresentation.className}`}
                  style={{ width: `${(Math.abs(item[trendMetric]) / maxTrendAmount) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {!trends.length ? <p className="muted">No trend data available.</p> : null}
          </div>
        </div>

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

function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: "",
    color: "#2563eb",
    description: ""
  });
  const [editForm, setEditForm] = useState({
    name: "",
    color: "#2563eb",
    description: ""
  });

  async function loadCategories() {
    setLoading(true);
    setError("");

    try {
      const data = await request("/api/categories");
      setCategories(data);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      await request("/api/categories", {
        method: "POST",
        body: JSON.stringify(form)
      });

      setForm({ name: "", color: "#2563eb", description: "" });
      await loadCategories();
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  function startEditing(category) {
    setEditingId(category.id);
    setEditForm({
      name: category.name,
      color: category.color,
      description: category.description || ""
    });
  }

  function cancelEditing() {
    setEditingId(null);
    setEditForm({ name: "", color: "#2563eb", description: "" });
  }

  async function handleUpdate(categoryId) {
    setSaving(true);
    setError("");

    try {
      await request(`/api/categories/${categoryId}`, {
        method: "PUT",
        body: JSON.stringify(editForm)
      });

      cancelEditing();
      await loadCategories();
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(categoryId) {
    setSaving(true);
    setError("");

    try {
      await request(`/api/categories/${categoryId}`, {
        method: "DELETE"
      });

      if (editingId === categoryId) {
        cancelEditing();
      }

      await loadCategories();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page">
      <section className="panel">
        <p className="eyebrow">Categories</p>
        <h1>Manage Categories</h1>
        <p className="section-copy">
          Create and maintain the second core model used to organize transactions and show
          model relationships in the app.
        </p>
      </section>

      <section className="panel">
        <h2>Create Category</h2>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Name
            <input
              type="text"
              required
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </label>

          <label>
            Color
            <input
              type="color"
              value={form.color}
              onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
            />
          </label>

          <label className="span-2">
            Description
            <input
              type="text"
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
            />
          </label>

          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save Category"}
          </button>
        </form>
      </section>

      {error ? <p className="error">{error}</p> : null}
      {loading ? <p>Loading...</p> : null}

      <section className="panel">
        <h2>Category Library</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Color</th>
                <th>Description</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => {
                const isEditing = editingId === category.id;

                return (
                  <tr key={category.id}>
                    <td>
                      {isEditing ? (
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, name: event.target.value }))
                          }
                        />
                      ) : (
                        category.name
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          type="color"
                          value={editForm.color}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, color: event.target.value }))
                          }
                        />
                      ) : (
                        <span className="color-chip-row">
                          <span
                            className="color-chip"
                            style={{ backgroundColor: category.color }}
                            aria-hidden="true"
                          />
                          {category.color}
                        </span>
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
                        category.description || "—"
                      )}
                    </td>
                    <td>{new Date(category.updatedAt).toLocaleDateString()}</td>
                    <td>
                      <div className="actions">
                        {isEditing ? (
                          <>
                            <button type="button" onClick={() => handleUpdate(category.id)}>
                              Save
                            </button>
                            <button type="button" onClick={cancelEditing}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" onClick={() => startEditing(category)}>
                              Edit
                            </button>
                            <button type="button" onClick={() => handleDelete(category.id)}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!categories.length ? (
                <tr>
                  <td colSpan={5}>No categories yet.</td>
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
    <AuthProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/categories"
            element={
              <ProtectedRoute>
                <CategoriesPage />
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
