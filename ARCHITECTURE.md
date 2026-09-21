# Architecture

## System Diagram

```text
Browser
  ├─ /            -> Nginx landing page
  ├─ /app/*       -> React + TypeScript SPA
  └─ /api/*       -> Express + TypeScript API
                        ├─ JWT auth middleware
                        ├─ category routes
                        ├─ transaction routes
                        ├─ dashboard aggregation routes
                        └─ Mongoose models
                               ├─ User
                               ├─ Category
                               └─ Transaction
                                      │
                                      ▼
                                  MongoDB
```

## Technology Stack

| Layer | Technology | Version |
| --- | --- | --- |
| Frontend SPA | React | 18.3.1 |
| Frontend routing | React Router DOM | 7.18.4 |
| Frontend build | Vite | 5.4.2 |
| Frontend language | TypeScript | 5.9.3 |
| API runtime | Node.js | 20+ |
| API framework | Express | 4.21.2 |
| API language | TypeScript | 5.9.3 |
| Database ODM | Mongoose | 9.10.1 |
| Database | MongoDB | 7 |
| Auth | JWT + bcryptjs | jsonwebtoken 9.0.3 / bcryptjs 3.0.3 |
| Testing | Node test, Supertest, Vitest, Testing Library | current repo versions |
| Containers | Docker, Docker Compose | current Docker engine |
| Orchestration | Kubernetes / Amazon EKS | Kubernetes networking.k8s.io/v1 |

## Data Model Relationships

- `User` authenticates access and owns authored records.
- `Category` references `User` through `ownerUserId`.
- `Transaction` references `User` through `ownerUserId`.
- `Transaction` references `Category` through `categoryId`.

## API Endpoints

| Method | Endpoint | Purpose | Auth |
| --- | --- | --- | --- |
| GET | /health | Health probe | No |
| POST | /api/auth/register | Create account and issue JWT | No |
| POST | /api/auth/login | Login and issue JWT | No |
| GET | /api/categories | List categories | Optional |
| GET | /api/categories/:id | Category detail | No |
| POST | /api/categories | Create category | Yes |
| PUT | /api/categories/:id | Update category | Yes |
| DELETE | /api/categories/:id | Delete category | Yes |
| GET | /api/transactions | List transactions with filters | No |
| GET | /api/transactions/:id | Transaction detail with related category | No |
| POST | /api/transactions | Create transaction | Yes |
| PUT | /api/transactions/:id | Update transaction | Yes |
| DELETE | /api/transactions/:id | Delete transaction | Yes |
| GET | /api/summary | Monthly aggregate totals | No |
| GET | /api/trends | Multi-month trend data | No |
| GET | /api/dashboard | Dashboard totals and recent activity | No |

## Local Deployment Architecture

- `frontend` container serves:
  - `/` -> static landing page
  - `/app` -> built React SPA
  - `/api` -> proxied to API container
- `api` container runs the Express + TypeScript server on port `3000`.
- `mongodb` container stores application data in a named Docker volume.

## Kubernetes Deployment Architecture

- Namespace: `expense-dashboard`
- MongoDB runs as an in-cluster `Deployment` with a `PersistentVolumeClaim` and `ClusterIP` `Service`.
- API runs as a 2-replica `Deployment` behind the `expense-api` `ClusterIP` `Service`.
- Frontend runs as a 2-replica `Deployment` behind the `expense-frontend` `LoadBalancer` `Service`.
- Optional `Ingress` keeps path-based routing for `/`, `/app`, and `/api` when an ingress controller is installed.
- Secrets are injected with Kubernetes `Secret` values for MongoDB credentials, connection string, and JWT signing.

## CI/CD Flow

1. Push or pull request triggers the CI workflow.
2. Backend dependencies install, typecheck runs, tests run, and the API Docker image builds.
3. Frontend dependencies install, typecheck runs, tests run, and the frontend Docker image builds.
4. Tag-based deployment workflow can push images to ECR and roll out Kubernetes changes to EKS.
