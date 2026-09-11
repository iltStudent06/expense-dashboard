# Production deployment plan

## Docker image build and push workflow (local build → ECR → cluster) 

At a high level, the deployment flow is:

1. Local validation first: build the API image locally and run a quick smoke check (for example, /health) to catch obvious issues before CI/CD.

2. CI builds immutable image: GitHub Actions builds the Docker image from the repo and tags it with an immutable identifier.

3. Security gate: the image is scanned and the pipeline fails on serious vulnerabilities.

4. Push to ECR: after passing checks, CI authenticates to AWS and pushes the image to Amazon ECR.

5. Deploy to cluster: CI updates the EKS Deployment image to that exact ECR tag and applies manifests.

6. Rollout + verification: Kubernetes performs rolling update with readiness/liveness probes; CI waits for rollout success and then runs post-deploy API checks.

## Chosen deployment target (EC2 with Docker Compose vs. EKS) and the trade-offs of each approach 

The chosen deployment target is EKS. The trade-off is mostly simplicity vs. operational maturity.

EC2 + Docker Compose is fast to set up with minimal moving parts and lower cost for very low traffic. But it needs mostly manual scaling/deployments and more hands-on patching, backups, failover, and monitoring integration.

EKS is more robust and better for growth because it has built-in orchestration, rolling updates, health-based restarts, and easier horizontal scaling (replicas). However, it has higher cost and more complexity.

## How you would handle environment secrets in production (not committed to the repository) 

Production secrets are handled outside the repository and injected at deploy/runtime. The model is: AWS secret store > Kubernetes Secret injection > container env vars.

## Scaling strategy: when would you scale horizontally (more replicas) vs. vertically (larger instances)? 

I would scale horizontally (more replicas) when traffic grows or latency rises under load. I would scale vertically (larger instances) when a single pod is resource-constrained or requests are heavy enough that each pod needs more capacity.

## Cost considerations: what AWS resources are used and how would you minimize cost? 

AWS resources used include 1) EKS control plane to run Kubernetes API/control services for the cluster, 2) EKS worker compute, 3) ECR to store Docker images pushed by CI/CD, 4) load balancing, 5) CloudWatch to collect logs and metrics, and 6) Secrets Manager to store runtime secrets like Mongo connection settings.

I would use the following ways to minimize cost:

1. reduce ECR spend by enabling lifecycle policies to expire old/unused images
2. set CloudWatch retention and avoid excessive logging
3. separate dev/test/production environments and schedule off-hours for non-prod clusters
