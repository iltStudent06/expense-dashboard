import express from "express";
import { MongoClient, ObjectId } from "mongodb";

const app = express();
app.use(express.json());

const mongoUri = process.env.MONGO_URI ?? "mongodb://localhost:27017/expense_dashboard";
const mongoDbName = process.env.MONGO_DB ?? "expense_dashboard";
const mongoCollectionName = process.env.MONGO_COLLECTION ?? "transactions";

const mongoClient = new MongoClient(mongoUri);
const transactionsCollectionPromise = mongoClient
  .connect()
  .then(() => mongoClient.db(mongoDbName).collection(mongoCollectionName));

const VALID_TYPES = new Set(["income", "expense"]);

function toMonthKey(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

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

function parseTransactionId(idValue) {
  if (!ObjectId.isValid(idValue)) {
    return { error: "transaction id is invalid" };
  }

  return { value: new ObjectId(idValue) };
}

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

function isValidMonth(value) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

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

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post(
  "/api/transactions",
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

app.put(
  "/api/transactions/:id",
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

app.delete(
  "/api/transactions/:id",
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

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

export default app;
