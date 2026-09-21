import express from "express";
import { connectToDatabase, closeDatabaseConnection } from "./config/db.js";
import { attachOptionalAuth } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.js";
import categoryRoutes from "./routes/categories.js";
import transactionRoutes from "./routes/transactions.js";
import dashboardRoutes from "./routes/dashboard.js";

const app = express();

app.use(express.json());
app.use(attachOptionalAuth);
app.use(async (_req, _res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    next(error);
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api", dashboardRoutes);

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
export { closeDatabaseConnection };
