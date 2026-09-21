import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth, getAuthUserId } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { parseObjectId } from "../middleware/validate.js";
import { CategoryModel } from "../models/Category.js";
import { TransactionModel } from "../models/Transaction.js";
import { buildTransactionQuery, normalizeTransaction, toPublicCategory, toPublicTransaction } from "./helpers.js";

const router = Router();

async function populateTransactionCategory(document: {
  _id: { toString(): string };
  type: "income" | "expense";
  amount: number;
  category: string;
  categoryId?: mongoose.Types.ObjectId | null;
  description?: string;
  date: Date;
}) {
  if (!document.categoryId) {
    return toPublicTransaction(document);
  }

  const category = await CategoryModel.findById(document.categoryId).lean();
  return {
    ...toPublicTransaction(document),
    categoryDetails: category ? toPublicCategory(category) : null
  };
}

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const ownerUserId = getAuthUserId(req);
    if (!ownerUserId) {
      return res.status(401).json({ error: "authorization token required" });
    }

    const normalized = normalizeTransaction(req.body ?? {});
    if ("error" in normalized) {
      return res.status(400).json({ error: normalized.error });
    }

    const created = await TransactionModel.create({
      ...normalized.value,
      ownerUserId
    });

    return res.status(201).json(toPublicTransaction(created));
  })
);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const documents = await TransactionModel.find(
      buildTransactionQuery({
        type: req.query.type,
        category: req.query.category,
        month: req.query.month
      })
    )
      .sort({ date: -1 })
      .lean();

    res.status(200).json(documents.map(toPublicTransaction));
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = parseObjectId(String(req.params.id), "transaction id");
    if ("error" in parsed) {
      return res.status(400).json({ error: parsed.error });
    }

    const document = await TransactionModel.findById(parsed.value).lean();
    if (!document) {
      return res.status(404).json({ error: "transaction not found" });
    }

    return res.status(200).json(await populateTransactionCategory(document));
  })
);

router.put(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = parseObjectId(String(req.params.id), "transaction id");
    if ("error" in parsed) {
      return res.status(400).json({ error: parsed.error });
    }

    const normalized = normalizeTransaction(req.body ?? {});
    if ("error" in normalized) {
      return res.status(400).json({ error: normalized.error });
    }

    const updated = await TransactionModel.findByIdAndUpdate(
      parsed.value,
      { $set: normalized.value },
      { returnDocument: "after", runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: "transaction not found" });
    }

    return res.status(200).json(toPublicTransaction(updated));
  })
);

router.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = parseObjectId(String(req.params.id), "transaction id");
    if ("error" in parsed) {
      return res.status(400).json({ error: parsed.error });
    }

    const removed = await TransactionModel.findByIdAndDelete(parsed.value).lean();
    if (!removed) {
      return res.status(404).json({ error: "transaction not found" });
    }

    return res.status(200).json(toPublicTransaction(removed));
  })
);

export default router;
