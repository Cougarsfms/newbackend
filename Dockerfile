# Use the official Node.js image as the builder
FROM node:20-alpine AS builder

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for building)
RUN npm i --legacy-peer-deps

# Copy the rest of the application code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the NestJS application
RUN npm run build

# --- Stage 2: Runner ---
# Use a smaller footprint image for production
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Install only production dependencies
COPY package*.json ./
RUN npm ci --only=production --legacy-peer-deps

# Copy necessary files from the builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Expose the application port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:prod"]
