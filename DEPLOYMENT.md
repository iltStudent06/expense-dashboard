# Deployment Guide

## Current deployment shape

The project currently runs in two main ways:

1. Local Docker Compose for full-stack validation
	- Nginx frontend container
	- Express API container
	- MongoDB container

2. Kubernetes manifests for the API service
	- API `Deployment`
	- API `Service`
	- example `Secret`

Today, the most complete path is Docker Compose. The Kubernetes files are focused on the API tier and expect an external MongoDB connection.

## Application routes and ports

### Docker Compose routes

- Landing page: `http://localhost:9000/`
- React app: `http://localhost:9000/app/`
- Login: `http://localhost:9000/app/login`
- Register: `http://localhost:9000/app/register`
- Categories: `http://localhost:9000/app/categories`
- API: `http://localhost:3000`
- Health: `http://localhost:3000/health`

### Default Compose ports

- Frontend host port: `9000` when started with `FRONTEND_PORT=9000`
- API host port: `3000`
- MongoDB host port: `27018`

## Local deployment with Docker Compose

From the repository root:

```bash
FRONTEND_PORT=9000 docker compose up --build -d
```

This starts:

- the Nginx frontend container
- the Express API container
- the MongoDB container

To rebuild only the frontend after UI changes:

```bash
FRONTEND_PORT=9000 docker compose up --build -d frontend
```

To rebuild only the API after backend changes:

```bash
docker compose up --build -d api
```

To stop the stack:

```bash
docker compose down
```

To stop and remove the database volume:

```bash
docker compose down -v
```

## Smoke test checklist after deployment

After the stack starts, verify:

1. `GET /health` returns `200`
2. the landing page loads at `/`
3. the React app loads at `/app/`
4. login and register pages load
5. a user can sign in
6. dashboard data loads
7. categories page loads and can create a category

Examples:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/dashboard
```

## Authentication in deployed environments

The API now includes JWT authentication.

Required auth routes:

- `POST /api/auth/register`
- `POST /api/auth/login`

Protected write routes require:

```text
Authorization: Bearer <token>
```

Protected routes include:

- `POST /api/transactions`
- `PUT /api/transactions/:id`
- `DELETE /api/transactions/:id`
- `POST /api/categories`
- `PUT /api/categories/:id`
- `DELETE /api/categories/:id`

Important production note:

- do not rely on the development fallback JWT secret
- provide a real `JWT_SECRET` through environment variables or Kubernetes secrets

## Tests before deployment

Run backend tests from the repository root:

```bash
npm test
```

Run frontend tests:

```bash
cd frontend
npm test
```

Recommended pre-deploy sequence:

```bash
npm test
cd frontend && npm test && npm run build
```

## Kubernetes deployment notes

The repository currently includes these API manifests:

- [k8s/expense-api-deployment.yaml](k8s/expense-api-deployment.yaml)
- [k8s/expense-api-service.yaml](k8s/expense-api-service.yaml)
- [k8s/expense-api-secret.example.yaml](k8s/expense-api-secret.example.yaml)

### What the manifests currently do

- deploy 2 API replicas
- expose the API internally through a `ClusterIP` service
- use readiness and liveness probes on `/health`
- pull MongoDB settings from a Kubernetes secret
- pull `JWT_SECRET` from a Kubernetes secret
- use a rolling update strategy with `maxUnavailable: 0`
- run the container as a non-root user

### Secret setup

Create the API secret before applying the deployment:

```bash
kubectl create secret generic expense-api-secrets \
  --from-literal=MONGO_URI='mongodb://<username>:<password>@<mongo-host>:27017/expense_dashboard?authSource=admin' \
  --from-literal=MONGO_DB='expense_dashboard' \
  --from-literal=MONGO_COLLECTION='transactions' \
  --from-literal=JWT_SECRET='<long-random-secret>'
```

Or copy and edit the example file first:

```bash
cp k8s/expense-api-secret.example.yaml /tmp/expense-api-secret.yaml
# edit values
kubectl apply -f /tmp/expense-api-secret.yaml
```

### Apply the manifests

```bash
kubectl apply -f k8s/expense-api-deployment.yaml
kubectl apply -f k8s/expense-api-service.yaml
kubectl rollout status deployment/expense-api --timeout=180s
```

To test the API locally from the cluster without an ingress yet:

```bash
kubectl port-forward service/expense-api 3000:80
```

### Kubernetes limitations right now

The current Kubernetes config does not yet include:

- frontend deployment manifests
- ingress configuration
- TLS setup
- MongoDB deployment/stateful storage in cluster
- autoscaling rules

So the current k8s setup should be treated as API-focused infrastructure, not a complete full-stack cluster deployment.

## Frontend deployment plan

The frontend is currently production-ready in Docker because it is built by Vite and served by Nginx.

### Current runtime behavior

- `/` serves the landing page
- `/app/` serves the React app
- `/api/` proxies requests to the Express API

### Recommended Kubernetes approach for the frontend

For a fuller cluster deployment, add:

1. a frontend `Deployment`
2. a frontend `Service`
3. an `Ingress` that routes:
	- `/` to the frontend service
	- `/app/` to the frontend service
	- `/api/` to the API service

### Why this is the preferred setup

- keeps the API service internal as `ClusterIP`
- lets the ingress controller handle public traffic
- preserves the same path-based routing already used in Docker Compose
- makes TLS and domain routing easier later

### Suggested frontend rollout flow

1. build and tag the frontend image
2. push it to the container registry
3. deploy/update the frontend `Deployment`
4. attach it to an internal `Service`
5. route public traffic through `Ingress`

### Suggested next Kubernetes files to add later

- `k8s/expense-frontend-deployment.yaml`
- `k8s/expense-frontend-service.yaml`
- `k8s/expense-ingress.yaml`

## Production deployment plan

At a high level:

1. Run tests locally or in CI
2. Build an immutable Docker image
3. Scan the image for vulnerabilities
4. Push the image to a registry such as Amazon ECR
5. Update the Kubernetes deployment to the new image tag
6. Wait for rollout success
7. Run post-deploy health and API checks

## Chosen target and trade-offs

### Docker Compose on a single host

Pros:

- fastest to set up
- lowest complexity
- good for demos and small environments

Cons:

- manual scaling
- weaker high availability story
- more manual ops work

### EKS / Kubernetes

Pros:

- rolling updates
- better scaling model
- better orchestration and health recovery

Cons:

- more infrastructure complexity
- higher cost
- more secrets/networking configuration work

## Secrets handling in production

Production secrets should not be committed.

Recommended pattern:

- secret manager or CI secret store
- injected into Kubernetes `Secret` objects or runtime environment variables
- consumed by the container at startup

Required sensitive values include:

- `MONGO_URI`
- `JWT_SECRET`
- any future cloud credentials or third-party API keys

## Scaling guidance

Scale horizontally when:

- request volume increases
- API latency rises under concurrent load
- health checks stay good but throughput needs grow

Scale vertically when:

- each process needs more CPU or memory
- workloads are heavier per request
- you are still at low replica counts and want simpler capacity growth first

## Cost considerations

Typical cloud cost drivers:

- container registry storage
- cluster compute
- load balancers
- logging and metrics
- managed secret storage
- managed database costs if MongoDB is hosted externally

Ways to reduce cost:

1. expire old container images
2. reduce log retention where safe
3. keep non-production environments small
4. scale replicas based on actual traffic
5. avoid oversized worker nodes
