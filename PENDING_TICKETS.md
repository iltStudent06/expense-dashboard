# Pending Tickets

This file tracks the remaining work that is not yet complete for the capstone.

## 1. Move to the new repository
**Description:** Copy the finished capstone into the new repository and verify the project still builds, tests, and runs correctly after the move.

**Acceptance criteria:**
- code is present in the new repository
- local checks still pass after the move
- paths, workflows, and docs still work in the new repository

## 2. Recreate GitHub Actions settings
**Description:** Add the required repository variables and AWS deploy secret in the new repository so CI/CD can run there.

**Acceptance criteria:**
- `AWS_REGION` is configured
- `EKS_CLUSTER_NAME` is configured
- `ECR_REPOSITORY` is configured
- `K8S_NAMESPACE` is configured
- `AWS_ROLE_TO_ASSUME` is configured

## 3. Build and push container images
**Description:** Build the API and frontend production images and push them to the ECR repositories in AWS.

**Acceptance criteria:**
- API image exists in ECR with a usable tag
- frontend image exists in ECR with a usable tag
- images are pullable from ECR

## 4. Deploy to EKS
**Description:** Apply the Kubernetes manifests to the EKS cluster and confirm all pods and services come up correctly.

**Acceptance criteria:**
- namespace is created
- secret is created
- MongoDB is running
- API is running
- frontend is running
- service/load balancer is exposed

## 5. Verify the live deployment
**Description:** Smoke test the public app URL end to end.

**Acceptance criteria:**
- landing page loads
- SPA loads
- login/register works
- category CRUD works
- transaction CRUD works
- transaction detail works
- dashboard loads real data

## 6. Finalize documentation
**Description:** Update the README and architecture/deployment docs with the final live URL and final deployment details.

**Acceptance criteria:**
- README includes the live deployment URL
- README reflects the final deployment state
- architecture/deployment docs match the final system

## 7. Prepare presentation
**Description:** Rehearse the demo flow and confirm the final presentation assets are ready.

**Acceptance criteria:**
- demo flow is rehearsed
- final presentation materials are ready
- live app can be presented without issues

## 8. Clean up AWS resources
**Description:** Delete temporary AWS resources after the demo to avoid charges.

**Acceptance criteria:**
- EKS cluster is deleted
- ECR repositories are deleted if no longer needed
- cleanup is verified in AWS
