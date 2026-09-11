import app from "./app.js";

// API bootstrap: starts the Express app on the configured port.
const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`Expense Dashboard API listening on port ${port}`);
});
