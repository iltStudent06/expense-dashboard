import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import App from "./App";

const AUTH_STORAGE_KEY = "expense-dashboard-auth";

function renderApp(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <App />
    </MemoryRouter>
  );
}

function createJsonResponse<T>(body: T, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body
  } as Response;
}

describe("App", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  test("redirects unauthenticated users from dashboard to login", async () => {
    renderApp(["/"]);

    expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(screen.getByText(/Sign in to manage transactions/i)).toBeInTheDocument();
  });

  test("renders dashboard data for an authenticated user", async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        token: "test-token",
        user: { id: "user-1", name: "Test User", email: "test@example.com", role: "user" }
      })
    );

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation((path: string | URL | Request, options: RequestInit = {}) => {
      if (typeof path === "string" && path.startsWith("/api/transactions?month=")) {
        return Promise.resolve(
          createJsonResponse([
            {
              id: "tx-1",
              type: "expense",
              amount: 45.25,
              category: "Groceries",
              categoryId: "cat-1",
              description: "Weekly shopping",
              date: "2026-09-18T00:00:00.000Z"
            }
          ])
        );
      }

      if (path === "/api/summary?month=2026-09") {
        return Promise.resolve(
          createJsonResponse({
            totals: { income: 2500, expenses: 45.25, balance: 2454.75 }
          })
        );
      }

      if (path === "/api/trends?months=6") {
        return Promise.resolve(
          createJsonResponse({
            trends: [{ month: "2026-09", income: 2500, expenses: 45.25, balance: 2454.75 }]
          })
        );
      }

      if (path === "/api/dashboard") {
        return Promise.resolve(
          createJsonResponse({
            totals: { transactions: 1, users: 1, categories: 2 },
            recentTransactions: []
          })
        );
      }

      if (path === "/api/categories") {
        const headers = new Headers(options.headers);
        expect(headers.get("Authorization")).toBe("Bearer test-token");
        return Promise.resolve(
          createJsonResponse([
            {
              id: "cat-1",
              name: "Groceries",
              color: "#10b981",
              description: "Food",
              updatedAt: "2026-09-18T00:00:00.000Z"
            },
            {
              id: "cat-2",
              name: "Utilities",
              color: "#2563eb",
              description: "Bills",
              updatedAt: "2026-09-19T00:00:00.000Z"
            }
          ])
        );
      }

      return Promise.reject(new Error(`Unhandled fetch path: ${String(path)}`));
    });

    renderApp(["/"]);

    expect(
      await screen.findByRole("heading", { name: /Expense Tracker \/ Budget Dashboard/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Total Categories")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Weekly shopping")).toBeInTheDocument();
    expect(screen.getAllByText("$2,454.75").length).toBeGreaterThan(0);
  });

  test("renders categories page and submits a new category", async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        token: "test-token",
        user: { id: "user-1", name: "Test User", email: "test@example.com", role: "user" }
      })
    );

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        createJsonResponse([
          {
            id: "cat-1",
            name: "Groceries",
            color: "#10b981",
            description: "Food",
            updatedAt: "2026-09-18T00:00:00.000Z"
          }
        ])
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          id: "cat-2",
          name: "Travel",
          color: "#f97316",
          description: "Trips",
          updatedAt: "2026-09-20T00:00:00.000Z"
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse([
          {
            id: "cat-1",
            name: "Groceries",
            color: "#10b981",
            description: "Food",
            updatedAt: "2026-09-18T00:00:00.000Z"
          },
          {
            id: "cat-2",
            name: "Travel",
            color: "#f97316",
            description: "Trips",
            updatedAt: "2026-09-20T00:00:00.000Z"
          }
        ])
      );

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderApp(["/categories"]);

    expect(await screen.findByRole("heading", { name: "Manage Categories" })).toBeInTheDocument();
    expect(screen.getByText("Groceries")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Travel" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Trips" } });
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#f97316" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Category" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    const postCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(postCall[0]).toBe("/api/categories");
    expect(postCall[1].method).toBe("POST");
    expect(new Headers(postCall[1].headers).get("Authorization")).toBe("Bearer test-token");
    expect(JSON.parse(String(postCall[1].body))).toEqual({
      name: "Travel",
      color: "#f97316",
      description: "Trips"
    });

    expect(await screen.findByText("Travel")).toBeInTheDocument();
  });
});
