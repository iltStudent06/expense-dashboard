import mongoose from "mongoose";

const mongoUri = process.env.MONGO_URI ?? "mongodb://localhost:27017/expense_dashboard";
const mongoDbName = process.env.MONGO_DB ?? "expense_dashboard";

let connectionPromise: Promise<typeof mongoose> | null = null;

export async function connectToDatabase() {
  if (!connectionPromise) {
    connectionPromise = mongoose.connect(mongoUri, {
      dbName: mongoDbName
    });
  }

  return connectionPromise;
}

export async function closeDatabaseConnection() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }

  connectionPromise = null;
}
