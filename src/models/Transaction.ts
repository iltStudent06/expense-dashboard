import { HydratedDocument, InferSchemaType, Schema, Types, model } from "mongoose";

const transactionSchema = new Schema(
  {
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["income", "expense"], required: true },
    amount: { type: Number, required: true, min: 0.01 },
    category: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },
    description: { type: String, default: "", trim: true },
    date: { type: Date, required: true }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

transactionSchema.index({ ownerUserId: 1, date: -1 });
transactionSchema.index({ categoryId: 1 });

export type Transaction = InferSchemaType<typeof transactionSchema>;
export type TransactionDocument = HydratedDocument<Transaction>;
export const TransactionModel = model<Transaction>("Transaction", transactionSchema);
export type TransactionId = Types.ObjectId;
