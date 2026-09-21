import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { CategoryModel } from "../models/Category.js";
import { TransactionModel } from "../models/Transaction.js";
import { User } from "../models/User.js";
import { buildTransactionQuery, toMonthKey, toPublicTransaction } from "./helpers.js";

const router = Router();

router.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const documents = await TransactionModel.find(
      buildTransactionQuery({ month: req.query.month, category: req.query.category })
    ).lean();

    let totalIncome = 0;
    let totalExpenses = 0;
    const expensesByCategory: Record<string, number> = {};
    const incomeByCategory: Record<string, number> = {};

    for (const entry of documents) {
      if (entry.type === "income") {
        totalIncome += entry.amount;
        incomeByCategory[entry.category] = (incomeByCategory[entry.category] ?? 0) + entry.amount;
      } else {
        totalExpenses += entry.amount;
        expensesByCategory[entry.category] = (expensesByCategory[entry.category] ?? 0) + entry.amount;
      }
    }

    res.status(200).json({
      month: typeof req.query.month === "string" ? req.query.month : "all",
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
      transactionCount: documents.length
    });
  })
);

router.get(
  "/trends",
  asyncHandler(async (req, res) => {
    const monthsParam = Number(req.query.months ?? 6);
    const months = Number.isInteger(monthsParam) && monthsParam > 0 ? monthsParam : 6;

    const now = new Date();
    const order: string[] = [];
    for (let offset = months - 1; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      const monthKey = `${date.getUTCFullYear()}-${`${date.getUTCMonth() + 1}`.padStart(2, "0")}`;
      order.push(monthKey);
    }

    const documents = await TransactionModel.find({}).lean();
    const trendMap = new Map(
      order.map((key) => [key, { month: key, income: 0, expenses: 0, balance: 0 }])
    );

    for (const entry of documents) {
      const key = toMonthKey(entry.date);
      if (!key || !trendMap.has(key)) {
        continue;
      }

      const bucket = trendMap.get(key)!;
      if (entry.type === "income") {
        bucket.income += entry.amount;
      } else {
        bucket.expenses += entry.amount;
      }
      bucket.balance = bucket.income - bucket.expenses;
    }

    const trends = order.map((key) => {
      const value = trendMap.get(key)!;
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

router.get(
  "/dashboard",
  asyncHandler(async (_req, res) => {
    const [transactionCount, userCount, categoryCount, recentDocuments, statusCounts] = await Promise.all([
      TransactionModel.countDocuments(),
      User.countDocuments(),
      CategoryModel.countDocuments(),
      TransactionModel.find({}).sort({ date: -1 }).limit(5).lean(),
      TransactionModel.aggregate([
        { $group: { _id: "$type", count: { $sum: 1 } } }
      ])
    ]);

    res.status(200).json({
      totals: {
        transactions: transactionCount,
        users: userCount,
        categories: categoryCount
      },
      groupedCounts: Object.fromEntries(statusCounts.map((entry) => [entry._id, entry.count])),
      recentTransactions: recentDocuments.map(toPublicTransaction)
    });
  })
);

export default router;
