# Use Node.js official image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port (assuming Express server runs on port 3001 or process.env.PORT)
EXPOSE 3001

# Start the application
CMD ["npm", "start"]