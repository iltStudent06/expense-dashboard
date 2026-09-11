import { readFile } from "node:fs/promises";

// Runtime configuration: target API and source seed file can be overridden via env vars.
const apiBaseUrl = process.env.API_URL ?? "http://localhost:3000";
const inputFile = process.env.SEED_FILE ?? "seed/transactions.json";
const endpoint = `${apiBaseUrl.replace(/\/$/, "")}/api/transactions`;

// Loads and validates seed input from disk.
async function loadTransactions(filePath) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed)) {
    throw new Error("Seed file must contain a JSON array of transactions");
  }

  return parsed;
}

// Sends one transaction to the API and surfaces clear errors on failure.
async function postTransaction(transaction) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(transaction)
  });

  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      `Failed (${response.status}) for ${transaction.type}/${transaction.category}: ${JSON.stringify(payload)}`
    );
  }

  return payload;
}

// Orchestrates the full seed process and prints a completion summary.
async function main() {
  const transactions = await loadTransactions(inputFile);
  let created = 0;

  for (const transaction of transactions) {
    await postTransaction(transaction);
    created += 1;
  }

  console.log(`Seed complete: created ${created} transactions at ${endpoint}`);
}

// Top-level runner with process-level error handling for CLI usage.
main().catch((error) => {
  console.error(`Seed failed: ${error.message}`);
  process.exit(1);
});
