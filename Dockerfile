# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY vite.config.ts ./
COPY tailwind.config.cjs ./
COPY postcss.config.cjs ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Build the application with BASE_PATH
ARG BASE_PATH=/
ENV BASE_PATH=${BASE_PATH}
RUN BASE_PATH=${BASE_PATH} npm run build

# Production stage
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin

# Create directories for uploads and temp files
RUN mkdir -p uploads temp

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV BASE_PATH=/

# Start the server
CMD ["node", "dist/server.js"]

