#!/bin/bash

# Cloud Run Deployment Script for Webpage Replicator
# Make sure to replace PROJECT_ID with your actual Google Cloud Project ID

set -e

# Configuration
PROJECT_ID="your-project-id"  # Replace with your actual project ID
REGION="us-central1"          # Replace with your preferred region
FRONTEND_SERVICE="webpage-replicator-frontend"
BACKEND_SERVICE="webpage-replicator-backend"

echo "🚀 Starting deployment to Google Cloud Run..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed. Please install it first."
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ Error: You are not authenticated with gcloud. Please run 'gcloud auth login' first."
    exit 1
fi

# Set the project
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "📋 Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com

# Build and deploy backend
echo "🔧 Building and deploying backend..."
cd backend
gcloud builds submit --tag gcr.io/$PROJECT_ID/$BACKEND_SERVICE
gcloud run deploy $BACKEND_SERVICE \
    --image gcr.io/$PROJECT_ID/$BACKEND_SERVICE \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --port 3001 \
    --memory 1Gi \
    --cpu 1 \
    --max-instances 100
cd ..

# Build and deploy frontend
echo "🎨 Building and deploying frontend..."
cd frontend
gcloud builds submit --tag gcr.io/$PROJECT_ID/$FRONTEND_SERVICE
gcloud run deploy $FRONTEND_SERVICE \
    --image gcr.io/$PROJECT_ID/$FRONTEND_SERVICE \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --port 3000 \
    --memory 512Mi \
    --cpu 1 \
    --max-instances 100
cd ..

echo "✅ Deployment complete!"
echo ""
echo "📝 Service URLs:"
echo "Backend:  $(gcloud run services describe $BACKEND_SERVICE --region=$REGION --format='value(status.url)')"
echo "Frontend: $(gcloud run services describe $FRONTEND_SERVICE --region=$REGION --format='value(status.url)')"
echo ""
echo "💡 Don't forget to:"
echo "1. Update your frontend to use the backend URL"
echo "2. Set up environment variables for the backend (API keys, etc.)"
echo "3. Configure CORS settings if needed"