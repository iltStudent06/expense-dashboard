# Expense Tracker / Budget Dashboard

Full-stack capstone project with:

- a custom landing page (`/`)
- a React + TypeScript SPA (`/app`)
- an Express + TypeScript API
- MongoDB persistence
- Docker and Kubernetes deployment assets
- GitHub Actions CI and API deployment workflow

## Current architecture

- **Frontend**: React 18, TypeScript, Vite 5, React Router
- **Backend**: Express, TypeScript, Mongoose, JWT auth
- **Database**: MongoDB 7
- **Container runtime**: Docker / Docker Compose
- **Orchestration**: Kubernetes manifests under `k8s/`

## Repository layout

- `src/` backend TypeScript source
- `test/` backend integration tests
- `frontend/src/` frontend application source
- `frontend/public/landing.html` static landing page
- `scripts/seed-transactions.js` seed utility script
- `k8s/` Kubernetes manifests
- `.github/workflows/` CI and deployment workflows

## Prerequisites

- Node.js 20+
- npm
- Docker (optional)
- Kubernetes cluster + `kubectl` (optional)

## Environment variables (API)

Copy and update:

```bash
cp .env.example .env
```

Default values in `.env.example`:

- `MONGO_URI`
- `MONGO_DB`
- `JWT_SECRET`
- `PORT`

## Run locally (without Docker)

### 1) Start MongoDB

You need a MongoDB instance reachable by `MONGO_URI`.

Example using Docker:

```bash
docker run --rm -d \
  --name expense-mongo \
  -p 27017:27017 \
  -e MONGO_INITDB_ROOT_USERNAME=expense_user \
  -e MONGO_INITDB_ROOT_PASSWORD=expense_pass \
  mongo:7
```

### 2) Start backend API

From repo root:

```bash
npm install
npm run dev
```

API runs on `http://localhost:3000` by default.

Health check:

```bash
curl http://localhost:3000/health
```

### 3) Start frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend dev server runs on `http://localhost:5173`.

Notes:

- Vite dev proxy forwards `/api` to `http://localhost:3000`.
- Frontend build is configured with Vite base `/app/`.

## App routes

### Frontend routes

- `/` dashboard (protected)
- `/categories` categories management (protected)
- `/transactions/:id` transaction detail (protected)
- `/login`
- `/register`

### API routes

- `GET /health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/categories`
- `GET /api/categories/:id`
- `POST /api/categories` (auth required)
- `PUT /api/categories/:id` (auth required)
- `DELETE /api/categories/:id` (auth required)
- `GET /api/transactions`
- `GET /api/transactions/:id`
- `POST /api/transactions` (auth required)
- `PUT /api/transactions/:id` (auth required)
- `DELETE /api/transactions/:id` (auth required)
- `GET /api/summary`
- `GET /api/trends`
- `GET /api/dashboard`

## Authentication behavior

- JWT is returned by register/login endpoints.
- Write routes for categories and transactions require:

```text
Authorization: Bearer <token>
```

- If `JWT_SECRET` is not set, API falls back to a development default secret. Set a strong value for non-dev environments.

## Testing and type checking

### Backend (repo root)

```bash
npm run typecheck
npm test
```

### Frontend

```bash
cd frontend
npm run typecheck
npm test
npm run build
```

## Docker

### API image

```bash
docker build -t expense-dashboard-api .
```

### Frontend image

```bash
docker build -t expense-dashboard-frontend ./frontend
```

## Docker Compose (full stack)

Run:

```bash
docker compose up --build
```

Run detached:

```bash
docker compose up --build -d
```

Stop:

```bash
docker compose down
```

Stop and remove DB volume:

```bash
docker compose down -v
```

Default ports:

- Frontend: `8080` (host) → `80` (container)
- API: `3000` (host) → `3000` (container)
- MongoDB: `27018` (host) → `27017` (container)

Compose environment overrides:

- `FRONTEND_PORT`
- `API_PORT`
- `MONGO_PORT`
- `NODE_ENV`
- `PORT`
- `MONGO_DB`
- `MONGO_INITDB_ROOT_USERNAME`
- `MONGO_INITDB_ROOT_PASSWORD`

## Kubernetes

Manifests provided:

- `k8s/namespace.yaml`
- `k8s/expense-mongo.yaml`
- `k8s/expense-api-deployment.yaml`
- `k8s/expense-api-service.yaml`
- `k8s/expense-frontend-deployment.yaml`
- `k8s/expense-frontend-service.yaml`
- `k8s/expense-ingress.yaml`
- `k8s/expense-api-secret.example.yaml`

### Apply order

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/expense-api-secret.example.yaml
kubectl apply -f k8s/expense-mongo.yaml
kubectl apply -f k8s/expense-api-deployment.yaml
kubectl apply -f k8s/expense-api-service.yaml
kubectl apply -f k8s/expense-frontend-deployment.yaml
kubectl apply -f k8s/expense-frontend-service.yaml
kubectl apply -f k8s/expense-ingress.yaml
```

### Quick checks

```bash
kubectl get all -n expense-dashboard
kubectl rollout status deployment/expense-api -n expense-dashboard
kubectl rollout status deployment/expense-frontend -n expense-dashboard
kubectl rollout status deployment/expense-mongo -n expense-dashboard
```

## GitHub Actions workflows

- `ci.yml`
  - backend install/typecheck/tests/docker build
  - frontend install/typecheck/tests/build/docker build
- `deploy-api.yml`
  - builds/scans/pushes API image
  - deploys API to EKS and updates `expense-api` image

## Seed script status

`scripts/seed-transactions.js` posts directly to `POST /api/transactions` without auth headers.

Because that endpoint currently requires JWT authentication, the seed script will fail with `401` unless the API auth requirements are changed or the script is updated to include an auth token.

## Additional docs

- `DEPLOYMENT.md` detailed deployment notes
- `ARCHITECTURE.md` architecture summary
