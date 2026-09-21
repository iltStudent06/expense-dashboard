import type { NextFunction, Request, Response } from "express";

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error("Request failed", error);
  res.status(500).json({ error: "internal server error" });
}

export function asyncHandler<T extends Request>(
  handler: (req: T, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: T, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
