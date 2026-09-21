import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod;
let app;
let closeDatabaseConnection;
let authToken;
let categoryId;
let transactionId;

before(async () => {
  mongod = await MongoMemoryServer.create();

  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = "test-secret";
  process.env.MONGO_URI = mongod.getUri("expense_dashboard_test");
  process.env.MONGO_DB = "expense_dashboard_test";
  process.env.MONGO_COLLECTION = "transactions";
  process.env.MONGO_USERS_COLLECTION = "users";
  process.env.MONGO_CATEGORIES_COLLECTION = "categories";

  const apiModule = await import("../src/app.ts");
  app = apiModule.default;
  closeDatabaseConnection = apiModule.closeDatabaseConnection;
});

after(async () => {
  if (closeDatabaseConnection) {
    await closeDatabaseConnection();
  }

  if (mongod) {
    await mongod.stop();
  }
});

describe("Expense Dashboard API", () => {
  test("registers a user and returns a token", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "Test User",
      email: "test@example.com",
      password: "secret123",
      role: "user"
    });

    assert.equal(response.status, 201);
    assert.ok(response.body.token);
    assert.equal(response.body.user.email, "test@example.com");
    authToken = response.body.token;
  });

  test("rejects protected transaction creation without auth", async () => {
    const response = await request(app).post("/api/transactions").send({
      type: "expense",
      amount: 18.25,
      category: "Lunch",
      description: "Unauthorized request",
      date: "2026-09-21"
    });

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "authorization token required");
  });

  test("creates a category for the authenticated user", async () => {
    const response = await request(app)
      .post("/api/categories")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        name: "Groceries",
        color: "#10b981",
        description: "Food and household purchases"
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.name, "Groceries");
    assert.equal(response.body.color, "#10b981");
    categoryId = response.body.id;
  });

  test("creates, updates, and fetches a linked transaction", async () => {
    const createResponse = await request(app)
      .post("/api/transactions")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        type: "expense",
        amount: 42.5,
        category: "Groceries",
        categoryId,
        description: "Weekly shopping",
        date: "2026-09-18"
      });

    assert.equal(createResponse.status, 201);
    assert.equal(createResponse.body.categoryId, categoryId);
    transactionId = createResponse.body.id;

    const updateResponse = await request(app)
      .put(`/api/transactions/${transactionId}`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        type: "expense",
        amount: 50,
        category: "Groceries",
        categoryId,
        description: "Weekly shopping and snacks",
        date: "2026-09-18"
      });

    assert.equal(updateResponse.status, 200);
    assert.equal(updateResponse.body.amount, 50);
    assert.equal(updateResponse.body.description, "Weekly shopping and snacks");

    const getResponse = await request(app).get(`/api/transactions/${transactionId}`);

    assert.equal(getResponse.status, 200);
    assert.equal(getResponse.body.categoryDetails?.id, categoryId);
    assert.equal(getResponse.body.categoryDetails?.name, "Groceries");
  });

  test("returns dashboard totals and category collection data", async () => {
    const categoriesResponse = await request(app).get("/api/categories");
    assert.equal(categoriesResponse.status, 200);
    assert.equal(categoriesResponse.body.length, 1);
    assert.equal(categoriesResponse.body[0].id, categoryId);

    const dashboardResponse = await request(app).get("/api/dashboard");
    assert.equal(dashboardResponse.status, 200);
    assert.equal(dashboardResponse.body.totals.users, 1);
    assert.equal(dashboardResponse.body.totals.categories, 1);
    assert.equal(dashboardResponse.body.totals.transactions, 1);
    assert.equal(dashboardResponse.body.recentTransactions[0].id, transactionId);
  });

  test("logs in and deletes seeded test records", async () => {
    const loginResponse = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      password: "secret123"
    });

    assert.equal(loginResponse.status, 200);
    assert.ok(loginResponse.body.token);

    const deleteTransactionResponse = await request(app)
      .delete(`/api/transactions/${transactionId}`)
      .set("Authorization", `Bearer ${loginResponse.body.token}`);
    assert.equal(deleteTransactionResponse.status, 200);

    const deleteCategoryResponse = await request(app)
      .delete(`/api/categories/${categoryId}`)
      .set("Authorization", `Bearer ${loginResponse.body.token}`);
    assert.equal(deleteCategoryResponse.status, 200);
  });
});
