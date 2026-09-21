import bcrypt from "bcryptjs";
import { HydratedDocument, Model, Schema, model } from "mongoose";

export type UserRole = "user" | "admin";

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserMethods {
  comparePassword(password: string): Promise<boolean>;
}

export type UserDocument = HydratedDocument<IUser, UserMethods>;

type UserModel = Model<IUser, {}, UserMethods>;

const userSchema = new Schema<IUser, UserModel, UserMethods>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

userSchema.methods.comparePassword = function comparePassword(password: string) {
  return bcrypt.compare(password, this.passwordHash);
};

export const User = model<IUser, UserModel>("User", userSchema);
