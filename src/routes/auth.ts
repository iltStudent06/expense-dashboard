import { Router } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { createAuthToken } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { normalizeAuthPayload, toPublicUser } from "./helpers.js";

const router = Router();

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const normalized = normalizeAuthPayload(req.body ?? {});
    if ("error" in normalized) {
      return res.status(400).json({ error: normalized.error });
    }

    const existingUser = await User.findOne({ email: normalized.value.email }).lean();
    if (existingUser) {
      return res.status(409).json({ error: "email already exists" });
    }

    const user = await User.create({
      name: normalized.value.name,
      email: normalized.value.email,
      passwordHash: normalized.value.password,
      role: normalized.value.role
    });

    return res.status(201).json({
      token: createAuthToken(user),
      user: toPublicUser(user)
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "invalid credentials" });
    }

    return res.status(200).json({
      token: createAuthToken(user),
      user: toPublicUser(user)
    });
  })
);

export default router;
