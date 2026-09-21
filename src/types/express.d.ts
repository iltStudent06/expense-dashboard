import type { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface UserPayload extends JwtPayload {
      userId: string;
      role: "user" | "admin";
    }

    interface Request {
      user?: UserPayload;
    }
  }
}

export {};
