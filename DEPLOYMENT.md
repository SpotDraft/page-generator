# Cloud Run Deployment Guide

This guide will help you deploy the webpage replicator application to Google Cloud Run.

## Prerequisites

1. **Google Cloud Account**: You need a Google Cloud account with billing enabled
2. **Google Cloud CLI**: Install the `gcloud` CLI tool
3. **Docker**: Ensure Docker is installed and running (for local testing)
4. **Project Setup**: Create a Google Cloud project

## Quick Deployment

### Option 1: Using the deployment script (Recommended)

1. **Update the deployment script**:
   ```bash
   # Edit deploy.sh and replace 'your-project-id' with your actual project ID
   nano deploy.sh
   ```

2. **Make the script executable and run it**:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

### Option 2: Manual deployment using YAML files

1. **Set your project ID**:
   ```bash
   export PROJECT_ID="your-project-id"
   gcloud config set project $PROJECT_ID
   ```

2. **Enable required APIs**:
   ```bash
   gcloud services enable cloudbuild.googleapis.com
   gcloud services enable run.googleapis.com
   ```

3. **Update YAML files**:
   - Replace `PROJECT_ID` in both `frontend/cloudrun.yaml` and `backend/cloudrun.yaml` with your actual project ID

4. **Build and deploy backend**:
   ```bash
   cd backend
   gcloud builds submit --tag gcr.io/$PROJECT_ID/webpage-replicator-backend
   gcloud run services replace cloudrun.yaml --region=us-central1
   cd ..
   ```

5. **Build and deploy frontend**:
   ```bash
   cd frontend
   gcloud builds submit --tag gcr.io/$PROJECT_ID/webpage-replicator-frontend
   gcloud run services replace cloudrun.yaml --region=us-central1
   cd ..
   ```

## Configuration

### Backend Configuration

The backend service may require environment variables for API keys and other configuration. You can set these using:

```bash
gcloud run services update webpage-replicator-backend \
    --region=us-central1 \
    --set-env-vars="GEMINI_API_KEY=your-api-key-here"
```

Or use Google Secret Manager for sensitive data:

```bash
# Create a secret
gcloud secrets create gemini-api-key --data-file=api-key.txt

# Update the service to use the secret
gcloud run services update webpage-replicator-backend \
    --region=us-central1 \
    --set-secrets="GEMINI_API_KEY=gemini-api-key:latest"
```

### Frontend Configuration

If your frontend needs to communicate with the backend, update any API endpoint URLs in your frontend code to use the deployed backend URL.

## Monitoring and Logs

- **View logs**: `gcloud run logs read webpage-replicator-backend --region=us-central1`
- **Monitor metrics**: Visit the Cloud Console > Cloud Run to view metrics and performance

## Costs

Cloud Run pricing is based on:
- CPU and memory allocation
- Number of requests
- Request duration

The current configuration uses:
- **Frontend**: 1 vCPU, 512Mi memory
- **Backend**: 2 vCPU, 1Gi memory

Both services scale to zero when not in use, so you only pay for actual usage.

## Troubleshooting

### Common Issues

1. **Build failures**: Check that all dependencies are properly listed in `package.json`
2. **Port issues**: Ensure your application listens on the port specified in the `PORT` environment variable
3. **Health check failures**: Make sure your backend has a `/health` endpoint or update the health check path

### Useful Commands

```bash
# View service details
gcloud run services describe webpage-replicator-backend --region=us-central1

# View recent deployments
gcloud run revisions list --service=webpage-replicator-backend --region=us-central1

# Delete a service
gcloud run services delete webpage-replicator-backend --region=us-central1
```

## Security Considerations

- Both services are currently configured to allow unauthenticated access
- For production, consider implementing authentication
- Use IAM roles to control access to your services
- Store sensitive configuration in Google Secret Manager