# Pharma Tracker API

A NestJS-based API for pharmaceutical tracking with environment-specific configurations.

## Features

- Environment-based configuration (staging/production)
- PostgreSQL database integration with schema separation
- JWT-based authentication
- RESTful API endpoints

## Environment Configuration

### Staging Environment

- Port: 3000
- Database Schema: `staging-pharma`
- Database: `pharmadb` at `localhost:5432`

### Production Environment

- Port: 3001
- Database Schema: `production-pharma`
- Database: `pharmadb` at `localhost:5432`

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database
- Database `pharmadb` should exist

## Installation

```bash
npm install
```

## Database Setup

1. Create PostgreSQL database:

```sql
CREATE DATABASE pharmadb;
```

2. Create schemas:

```sql
CREATE SCHEMA "staging-pharma";
CREATE SCHEMA "production-pharma";
```

## Running the Application

### Staging Environment

```bash
npm run start:staging
```

### Production Environment

```bash
npm run start:production
```

### Development Mode

```bash
npm run start:dev
```

## API Endpoints

**Base URL**: `/api`

### Authentication

#### POST /api/auth/authenticate

Authenticate user with username and password.

**Request Body:**

```json
{
  "username": "123456780",
  "password": "12345"
}
```

**Response:**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "username": "123456780",
  "expires_in": "8h"
}
```

### Greeting

#### GET /api/greeting

Public endpoint that returns a welcome message.

**Response:**

```
Hello! Welcome to Pharma Tracker API!
```

#### GET /api/greeting/authenticated

Protected endpoint that requires a valid JWT token in the Authorization header.

**Headers:**

```
Authorization: Bearer <your-jwt-token>
```

**Response:**

```
Hello {username}! Welcome to the authenticated area of Pharma Tracker API!
```

#### GET /api/greeting/sensitive

Protected endpoint with strict rate limiting (5 requests per minute).

**Headers:**

```
Authorization: Bearer <your-jwt-token>
```

**Response:**

```
Hello {username}! This is a sensitive endpoint with strict rate limiting.
```

#### GET /api/greeting/roles

Returns a list of all active role names from the user_role table.

**Response:**

```json
["admin", "editor", "manager", "user", "viewer"]
```

## Environment Variables

The application uses environment-specific configuration files:

- `env.staging` - Staging environment configuration
- `env.production` - Production environment configuration

## JWT Configuration

- Secret: Configurable via `JWT_SECRET` environment variable
- Expiry: 8 hours (configurable via `JWT_EXPIRES_IN`)

## Security Features

### Authentication

The application uses **global JWT authentication** for all endpoints by default. To make an endpoint public (skip authentication), use the `@SkipAuth()` decorator.

### Rate Limiting

The application includes **global rate limiting** to protect against abuse:

- **Default**: 100 requests per 15 minutes per IP address
- **Custom limits**: Use `@Throttle({ limit: 50, windowMs: 60000 })` for specific endpoints
- **IP detection**: Automatically detects real IP from various headers (X-Forwarded-For, X-Real-IP, etc.)

## Notes

- Password validation is currently hardcoded to "12345" as requested
- Database synchronization is disabled in production for safety
- CORS is enabled for cross-origin requests
- All endpoints require JWT authentication unless marked with `@SkipAuth()`
