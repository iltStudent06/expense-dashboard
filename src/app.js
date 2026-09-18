import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const app = express();
app.use(express.json());

// Runtime MongoDB configuration (supports overrides via environment variables).
const mongoUri = process.env.MONGO_URI ?? "mongodb://localhost:27017/expense_dashboard";
const mongoDbName = process.env.MONGO_DB ?? "expense_dashboard";
const mongoCollectionName = process.env.MONGO_COLLECTION ?? "transactions";
const usersCollectionName = process.env.MONGO_USERS_COLLECTION ?? "users";
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-in-production";

// Shared Mongo client/collection promise reused across all requests.
const mongoClient = new MongoClient(mongoUri);
const dbPromise = mongoClient.connect().then(() => mongoClient.db(mongoDbName));
const transactionsCollectionPromise = dbPromise.then((db) => db.collection(mongoCollectionName));
const usersCollectionPromise = dbPromise.then((db) => db.collection(usersCollectionName));

// Accepted transaction types.
const VALID_TYPES = new Set(["income", "expense"]);

// Converts an ISO date string to YYYY-MM for month-based grouping/filtering.
function toMonthKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

// Validates and normalizes incoming transaction payloads.
function normalizeTransaction(payload) {
  const { type, amount, category, description = "", date } = payload;

  if (!VALID_TYPES.has(type)) {
    return { error: "type must be either 'income' or 'expense'" };
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { error: "amount must be a positive number" };
  }

  if (typeof category !== "string" || category.trim().length === 0) {
    return { error: "category is required" };
  }

  const txDate = date ? new Date(date) : new Date();
  if (Number.isNaN(txDate.getTime())) {
    return { error: "date must be a valid date string" };
  }

  return {
    value: {
      type,
      amount: Number(numericAmount.toFixed(2)),
      category: category.trim(),
      description: typeof description === "string" ? description.trim() : "",
      date: txDate.toISOString()
    }
  };
}

// Validates and converts URL id parameter to Mongo ObjectId.
function parseTransactionId(idValue) {
  if (!ObjectId.isValid(idValue)) {
    return { error: "transaction id is invalid" };
  }

  return { value: new ObjectId(idValue) };
}

// Maps Mongo documents to API response shape.
function toPublicTransaction(document) {
  return {
    id: document._id.toString(),
    type: document.type,
    amount: document.amount,
    category: document.category,
    description: document.description,
    date: document.date
  };
}

// Validates month filter format.
function isValidMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

// Builds inclusive start/exclusive end ISO date bounds for a month filter.
function buildMonthRange(month) {
  if (!isValidMonth(month)) {
    return null;
  }

  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);

  const start = new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, monthNumber, 1)).toISOString();

  return { start, end };
}

// Builds Mongo query object from optional API filters.
function buildTransactionQuery({ type, category, month }) {
  const query = {};

  if (type) {
    if (!VALID_TYPES.has(type)) {
      query.type = "__invalid__";
    } else {
      query.type = type;
    }
  }

  if (category) {
    query.category = { $regex: `^${String(category).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
  }

  if (month) {
    const monthRange = buildMonthRange(String(month));
    if (!monthRange) {
      query.date = { $eq: "__invalid__" };
    } else {
      query.date = {
        $gte: monthRange.start,
        $lt: monthRange.end
      };
    }
  }

  return query;
}

// Wraps async route handlers with consistent 500 error responses.
function withErrorHandling(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("Request failed", error);
      res.status(500).json({ error: "internal server error" });
    }
  };
}

// Creates a signed JWT for a user.
function createAuthToken(user) {
  return jwt.sign({ userId: user._id.toString(), role: user.role }, jwtSecret, { expiresIn: "7d" });
}

// Maps Mongo user documents to API response shape.
function toPublicUser(document) {
  return {
    id: document._id.toString(),
    name: document.name,
    email: document.email,
    role: document.role
  };
}

// Validates registration and login payloads.
function normalizeAuthPayload(payload) {
  const { name, email, password, role = "user" } = payload;

  if (typeof email !== "string" || !email.includes("@")) {
    return { error: "email must be valid" };
  }

  if (typeof password !== "string" || password.trim().length < 6) {
    return { error: "password must be at least 6 characters" };
  }

  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "name is required" };
  }

  if (role !== "user" && role !== "admin") {
    return { error: "role must be either 'user' or 'admin'" };
  }

  return {
    value: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role
    }
  };
}

// Verifies bearer token and rejects unauthenticated writes.
function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "authorization token required" });
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: "invalid or expired token" });
  }
}

// Registration endpoint.
app.post(
  "/api/auth/register",
  withErrorHandling(async (req, res) => {
    const { value, error } = normalizeAuthPayload(req.body ?? {});

    if (error) {
      return res.status(400).json({ error });
    }

    const usersCollection = await usersCollectionPromise;
    const existingUser = await usersCollection.findOne({ email: value.email });
    if (existingUser) {
      return res.status(409).json({ error: "email already exists" });
    }

    const passwordHash = await bcrypt.hash(value.password, 10);
    const insertResult = await usersCollection.insertOne({
      name: value.name,
      email: value.email,
      passwordHash,
      role: value.role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const user = {
      _id: insertResult.insertedId,
      name: value.name,
      email: value.email,
      role: value.role
    };

    return res.status(201).json({ token: createAuthToken(user), user: toPublicUser(user) });
  })
);

// Login endpoint.
app.post(
  "/api/auth/login",
  withErrorHandling(async (req, res) => {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "email and password are required" });
    }

    const usersCollection = await usersCollectionPromise;
    const user = await usersCollection.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    return res.status(200).json({ token: createAuthToken(user), user: toPublicUser(user) });
  })
);

// Lightweight health endpoint used by Docker/Kubernetes probes.
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

// Creates a transaction document.
app.post(
  "/api/transactions",
  requireAuth,
  withErrorHandling(async (req, res) => {
  const { value, error } = normalizeTransaction(req.body ?? {});

  if (error) {
    return res.status(400).json({ error });
  }

    const collection = await transactionsCollectionPromise;
    const insertResult = await collection.insertOne(value);
    return res.status(201).json({
      id: insertResult.insertedId.toString(),
      type: value.type,
      amount: value.amount,
      category: value.category,
      description: value.description,
      date: value.date
    });
  })
);

// Returns transactions, optionally filtered by type/category/month.
app.get(
  "/api/transactions",
  withErrorHandling(async (req, res) => {
  const { type, category, month } = req.query;

    const query = buildTransactionQuery({ type, category, month });
    const collection = await transactionsCollectionPromise;
    const documents = await collection.find(query).toArray();

    res.status(200).json(documents.map(toPublicTransaction));
  })
);

// Updates one transaction by id.
app.put(
  "/api/transactions/:id",
  requireAuth,
  withErrorHandling(async (req, res) => {
    const { value: transactionId, error: idError } = parseTransactionId(req.params.id);
    if (idError) {
      return res.status(400).json({ error: idError });
    }

    const { value, error } = normalizeTransaction(req.body ?? {});
    if (error) {
      return res.status(400).json({ error });
    }

    const collection = await transactionsCollectionPromise;
    const updated = await collection.findOneAndUpdate(
      { _id: transactionId },
      { $set: value },
      { returnDocument: "after" }
    );

    if (!updated) {
      return res.status(404).json({ error: "transaction not found" });
    }

    return res.status(200).json(toPublicTransaction(updated));
  })
);

// Deletes one transaction by id.
app.delete(
  "/api/transactions/:id",
  requireAuth,
  withErrorHandling(async (req, res) => {
    const { value: transactionId, error: idError } = parseTransactionId(req.params.id);
    if (idError) {
      return res.status(400).json({ error: idError });
    }

    const collection = await transactionsCollectionPromise;
    const removed = await collection.findOneAndDelete({ _id: transactionId });

    if (!removed) {
      return res.status(404).json({ error: "transaction not found" });
    }

    return res.status(200).json(toPublicTransaction(removed));
  })
);

// Aggregates totals and category breakdown for a month or all-time.
app.get(
  "/api/summary",
  withErrorHandling(async (req, res) => {
  const { month } = req.query;

    const collection = await transactionsCollectionPromise;
    const query = buildTransactionQuery({ month });
    const inScopeDocuments = await collection.find(query).toArray();
    const inScope = inScopeDocuments.map(toPublicTransaction);

  let totalIncome = 0;
  let totalExpenses = 0;
  const expensesByCategory = {};
  const incomeByCategory = {};

  for (const entry of inScope) {
    if (entry.type === "income") {
      totalIncome += entry.amount;
      incomeByCategory[entry.category] = (incomeByCategory[entry.category] ?? 0) + entry.amount;
    } else {
      totalExpenses += entry.amount;
      expensesByCategory[entry.category] = (expensesByCategory[entry.category] ?? 0) + entry.amount;
    }
  }

    res.status(200).json({
      month: month ?? "all",
      totals: {
        income: Number(totalIncome.toFixed(2)),
        expenses: Number(totalExpenses.toFixed(2)),
        balance: Number((totalIncome - totalExpenses).toFixed(2))
      },
      byCategory: {
        income: Object.fromEntries(
          Object.entries(incomeByCategory).map(([key, value]) => [key, Number(value.toFixed(2))])
        ),
        expenses: Object.fromEntries(
          Object.entries(expensesByCategory).map(([key, value]) => [key, Number(value.toFixed(2))])
        )
      },
      transactionCount: inScope.length
    });
  })
);

// Builds month-by-month income/expense/balance trend data.
app.get(
  "/api/trends",
  withErrorHandling(async (req, res) => {
  const monthsParam = Number(req.query.months ?? 6);
  const months = Number.isInteger(monthsParam) && monthsParam > 0 ? monthsParam : 6;

  const now = new Date();
  const order = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const monthKey = `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, "0")}`;
    order.push(monthKey);
  }

    const firstMonthRange = buildMonthRange(order[0]);
    const collection = await transactionsCollectionPromise;
    const documents = await collection
      .find({ date: { $gte: firstMonthRange.start } })
      .toArray();
    const transactions = documents.map(toPublicTransaction);

  const trendMap = new Map(order.map((key) => [key, { month: key, income: 0, expenses: 0, balance: 0 }]));

  for (const entry of transactions) {
    const key = toMonthKey(entry.date);
    if (!trendMap.has(key)) {
      continue;
    }

    const bucket = trendMap.get(key);
    if (entry.type === "income") {
      bucket.income += entry.amount;
    } else {
      bucket.expenses += entry.amount;
    }
    bucket.balance = bucket.income - bucket.expenses;
  }

  const trends = order.map((key) => {
    const value = trendMap.get(key);
    return {
      month: value.month,
      income: Number(value.income.toFixed(2)),
      expenses: Number(value.expenses.toFixed(2)),
      balance: Number(value.balance.toFixed(2))
    };
  });

    res.status(200).json({ months, trends });
  })
);

// Catch-all for unknown routes.
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

export default app;
