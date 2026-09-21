# Expense Tracker / Budget Dashboard

Express API and React frontend for logging income and expenses, authenticating users, managing categories, and viewing dashboard summaries and trends.

## Current behavior

- The API persists users, categories, and transactions in MongoDB.
- Authenticated users can create, edit, and delete transactions and categories.
- The frontend includes a landing page, login/register flow, protected dashboard, and protected categories page.
- Data survives container restarts when the MongoDB volume is preserved.

## App routes

- Landing page: `http://localhost:9000/`
- React app root: `http://localhost:9000/app/`
- Login: `http://localhost:9000/app/login`
- Register: `http://localhost:9000/app/register`
- Categories: `http://localhost:9000/app/categories`
- API health: `http://localhost:3000/health`

## Prerequisites

- Node.js 20+
- npm
- Docker (optional, for containerized runs)
- kubectl + kind (optional, for local Kubernetes validation)

## Run locally (API)

```bash
npm install
export MONGO_URI="mongodb://localhost:27017/expense_dashboard"
npm run dev
```

- API URL: `http://localhost:3000`
- Health endpoint: `GET /health`
- If MongoDB is not running, API requests will fail until a database connection is available.

Auth notes:

- `POST /api/auth/register` creates a user and returns a JWT.
- `POST /api/auth/login` returns a JWT for an existing user.
- Protected write routes require `Authorization: Bearer <token>`.

For non-watch mode:

```bash
npm run start
```

## Run locally (Frontend)

```bash
cd frontend
npm install
npm run dev
```

- Frontend URL: `http://localhost:5173`
- Vite proxies `/api` requests to `http://localhost:3000`
- In Vite dev mode, the React app is served directly.
- In Docker Compose, Nginx serves the landing page at `/` and the React app at `/app/`.

## Testing

Backend API tests:

```bash
npm test
```

Frontend tests:

```bash
cd frontend
npm test
```

What is covered now:

- backend auth, categories, transactions, and dashboard integration tests
- frontend auth redirect, dashboard rendering, and category creation tests

## API endpoints

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/categories`
- `GET /api/categories/:id`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`
- `POST /api/transactions`
- `GET /api/transactions/:id`
- `PUT /api/transactions/:id`
- `DELETE /api/transactions/:id`
- `GET /api/transactions?type=income|expense&category=<name>&month=YYYY-MM`
- `GET /api/summary?month=YYYY-MM`
- `GET /api/trends?months=6`
- `GET /api/dashboard`

### Example: register a user

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo User",
    "email": "demo@example.com",
    "password": "secret123",
    "role": "user"
  }'
```

### Example: create a transaction

```bash
curl -X POST http://localhost:3000/api/transactions \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "expense",
    "amount": 45.25,
    "category": "Groceries",
    "description": "Weekly shopping",
    "date": "2026-09-09"
  }'
```

## Seed data (income + expenses)

Sample seed data is available in `seed/transactions.json`.

Run seed against local API:

```bash
npm run seed
```

Optional overrides:

```bash
API_URL=http://localhost:3000 npm run seed
SEED_FILE=seed/transactions.json npm run seed
```

Quick check after seeding:

```bash
curl "http://localhost:3000/api/summary?month=2026-09"
```

## Frontend features

- protected dashboard with monthly totals and recent transactions
- category filter on dashboard data
- visual income and expense breakdown bars by category
- protected categories CRUD page
- login/register forms with session persistence in local storage

## Docker (API)

Build:

```bash
docker build -t expense-dashboard-api .
```

Run:

```bash
docker run --rm -p 3000:3000 expense-dashboard-api
```

## Docker Compose (Frontend + API + MongoDB)

Run all services:

```bash
docker compose up --build
```

Detached mode:

```bash
docker compose up --build -d
```

Stop services:

```bash
docker compose down
```

Stop services and remove DB volume:

```bash
docker compose down -v
```

### Compose environment variables

- `API_PORT` (default: `3000`)
- `FRONTEND_PORT` (default: `8080`)
- `PORT` (default: `3000`, inside API container)
- `NODE_ENV` (default: `production`)
- `MONGO_PORT` (default: `27018`)
- `MONGO_DB` (default: `expense_dashboard`)
- `MONGO_INITDB_ROOT_USERNAME` (default: `expense_user`)
- `MONGO_INITDB_ROOT_PASSWORD` (default: `expense_pass`)

Notes:

- Compose includes a named volume: `expense_dashboard_mongodb_data`.
- Compose defines health checks for frontend, API, and MongoDB.
- API uses MongoDB via `MONGO_URI`/`MONGO_DB` environment variables.

## Kubernetes (API)

Kubernetes manifests are provided in the `k8s/` directory:

- `k8s/expense-api-secret.example.yaml`
- `k8s/expense-api-deployment.yaml`
- `k8s/expense-api-service.yaml`

Create secret for dev/staging:

```bash
kubectl create secret generic expense-api-secrets \
  --from-literal=MONGO_URI='mongodb://<username>:<password>@<mongo-host>:27017/expense_dashboard?authSource=admin' \
  --from-literal=MONGO_DB='expense_dashboard' \
  --from-literal=MONGO_COLLECTION='transactions' \
  --from-literal=JWT_SECRET='<long-random-secret>'
```

Or use a local copy of the example manifest:

```bash
cp k8s/expense-api-secret.example.yaml /tmp/expense-api-secret.yaml
# edit /tmp/expense-api-secret.yaml with real values
kubectl apply -f /tmp/expense-api-secret.yaml
```

Apply manifests:

```bash
# first apply your real secret (created via command above or local edited file)
kubectl apply -f k8s/expense-api-deployment.yaml
kubectl apply -f k8s/expense-api-service.yaml
kubectl rollout status deployment/expense-api --timeout=180s
```

## CI/CD

- GitHub Actions workflow: `.github/workflows/deploy-api.yml`
