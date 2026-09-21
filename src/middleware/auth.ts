import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-in-production";

export function createAuthToken(user: { _id: { toString(): string }; role: "user" | "admin" }) {
  return jwt.sign({ userId: user._id.toString(), role: user.role }, jwtSecret, { expiresIn: "7d" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "authorization token required" });
  }

  try {
    req.user = jwt.verify(token, jwtSecret) as Express.UserPayload;
    return next();
  } catch {
    return res.status(401).json({ error: "invalid or expired token" });
  }
}

export function attachOptionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme === "Bearer" && token) {
    try {
      req.user = jwt.verify(token, jwtSecret) as Express.UserPayload;
    } catch {
      req.user = undefined;
    }
  }

  next();
}

export function getAuthUserId(req: Request) {
  return req.user?.userId ?? null;
}
