import { HydratedDocument, InferSchemaType, Schema, Types, model } from "mongoose";

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    color: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

categorySchema.index({ name: 1, ownerUserId: 1 }, { unique: true });

export type Category = InferSchemaType<typeof categorySchema>;
export type CategoryDocument = HydratedDocument<Category>;
export const CategoryModel = model<Category>("Category", categorySchema);
export type CategoryId = Types.ObjectId;
