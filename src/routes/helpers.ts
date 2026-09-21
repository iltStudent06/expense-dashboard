import mongoose from "mongoose";
import type { Category } from "../models/Category.js";
import type { Transaction } from "../models/Transaction.js";

const VALID_TYPES = new Set(["income", "expense"] as const);

export interface AuthPayloadInput {
  name?: unknown;
  email?: unknown;
  password?: unknown;
  role?: unknown;
}

export interface CategoryPayloadInput {
  name?: unknown;
  color?: unknown;
  description?: unknown;
}

export interface TransactionPayloadInput {
  type?: unknown;
  amount?: unknown;
  category?: unknown;
  categoryId?: unknown;
  description?: unknown;
  date?: unknown;
}

export function toMonthKey(dateValue: Date | string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

export function toPublicUser(document: { _id: { toString(): string }; name: string; email: string; role: "user" | "admin" }) {
  return {
    id: document._id.toString(),
    name: document.name,
    email: document.email,
    role: document.role
  };
}

export function toPublicCategory(document: {
  _id: { toString(): string };
  name: string;
  color: string;
  description?: string;
  ownerUserId?: mongoose.Types.ObjectId | string;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: document._id.toString(),
    name: document.name,
    color: document.color,
    description: document.description ?? "",
    ownerUserId: document.ownerUserId ? document.ownerUserId.toString() : null,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt
  };
}

export function toPublicTransaction(document: {
  _id: { toString(): string };
  type: "income" | "expense";
  amount: number;
  category: string;
  categoryId?: mongoose.Types.ObjectId | string | null;
  description?: string;
  date: Date;
}) {
  return {
    id: document._id.toString(),
    type: document.type,
    amount: document.amount,
    category: document.category,
    categoryId: document.categoryId ? document.categoryId.toString() : null,
    description: document.description ?? "",
    date: document.date.toISOString()
  };
}

export function normalizeAuthPayload(payload: AuthPayloadInput) {
  const { name, email, password, role = "user" } = payload;

  if (typeof email !== "string" || !email.includes("@")) {
    return { error: "email must be valid" } as const;
  }

  if (typeof password !== "string" || password.trim().length < 6) {
    return { error: "password must be at least 6 characters" } as const;
  }

  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "name is required" } as const;
  }

  if (role !== "user" && role !== "admin") {
    return { error: "role must be either 'user' or 'admin'" } as const;
  }

  return {
    value: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      role
    }
  } as const;
}

export function normalizeCategoryPayload(payload: CategoryPayloadInput) {
  const { name, color = "#2563eb", description = "" } = payload;

  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "name is required" } as const;
  }

  if (typeof color !== "string" || color.trim().length === 0) {
    return { error: "color is required" } as const;
  }

  return {
    value: {
      name: name.trim(),
      color: color.trim(),
      description: typeof description === "string" ? description.trim() : ""
    }
  } as const;
}

export function normalizeTransaction(payload: TransactionPayloadInput) {
  const { type, amount, category, categoryId, description = "", date } = payload;

  if (type !== "income" && type !== "expense") {
    return { error: "type must be either 'income' or 'expense'" } as const;
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { error: "amount must be a positive number" } as const;
  }

  if (typeof category !== "string" || category.trim().length === 0) {
    return { error: "category is required" } as const;
  }

  if (
    typeof categoryId === "string" &&
    categoryId.trim().length > 0 &&
    !mongoose.Types.ObjectId.isValid(categoryId)
  ) {
    return { error: "categoryId is invalid" } as const;
  }

  const txDate = date ? new Date(String(date)) : new Date();
  if (Number.isNaN(txDate.getTime())) {
    return { error: "date must be a valid date string" } as const;
  }

  return {
    value: {
      type,
      amount: Number(numericAmount.toFixed(2)),
      category: category.trim(),
      ...(typeof categoryId === "string" && categoryId.trim().length > 0
        ? { categoryId: new mongoose.Types.ObjectId(categoryId.trim()) }
        : {}),
      description: typeof description === "string" ? description.trim() : "",
      date: txDate
    }
  } as const;
}

export function buildTransactionQuery(filters: {
  type?: unknown;
  category?: unknown;
  month?: unknown;
  ownerUserId?: string | null;
}) {
  const query: Record<string, unknown> = {};

  if (filters.ownerUserId) {
    query.ownerUserId = new mongoose.Types.ObjectId(filters.ownerUserId);
  }

  if (typeof filters.type === "string") {
    query.type = VALID_TYPES.has(filters.type as "income" | "expense")
      ? (filters.type as "income" | "expense")
      : ("__invalid__" as never);
  }

  if (typeof filters.category === "string" && filters.category.trim()) {
    query.category = { $regex: `^${filters.category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
  }

  if (typeof filters.month === "string") {
    const monthRange = buildMonthRange(filters.month);
    if (!monthRange) {
      query.date = { $eq: new Date("invalid") } as never;
    } else {
      query.date = {
        $gte: monthRange.start,
        $lt: monthRange.end
      };
    }
  }

  return query;
}

export function buildCategoryQuery(filters: { name?: unknown; ownerUserId?: string | null }) {
  const query: Record<string, unknown> = {};

  if (typeof filters.name === "string" && filters.name.trim()) {
    query.name = { $regex: `^${filters.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" };
  }

  if (filters.ownerUserId) {
    query.ownerUserId = new mongoose.Types.ObjectId(filters.ownerUserId);
  }

  return query;
}

export function buildMonthRange(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return null;
  }

  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);

  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 1))
  };
}
