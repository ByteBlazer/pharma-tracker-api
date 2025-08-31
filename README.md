# Pharma Tracker API

A NestJS-based API for pharmaceutical tracking with support for staging and production environments.

## Features

- **Environment Support**: Staging (port 3000) and Production (port 3001)
- **JWT Authentication**: Secure authentication with 8-hour token expiry
- **PostgreSQL Database**: Multi-schema support (staging-pharma, production-pharma)
- **Rate Limiting**: Global rate limiting with customizable limits
- **Global API Prefix**: All endpoints prefixed with `/api`
- **Automated Deployment**: GitHub Actions workflow for EC2 deployment

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd pharma-tracker-api

# Install dependencies
npm install

# Set up environment files
cp env.staging .env.staging
cp env.production .env.production

# Update environment variables as needed
```

### Running the Application

```bash
# Development mode with auto-restart
npm run start:dev

# Staging environment
npm run start:staging

# Production environment
npm run start:production

# Build the application
npm run build
```

## API Endpoints

### Authentication

- `POST /api/auth/authenticate` - Authenticate user (public)
  - Body: `{"username": "123456780", "password": "12345"}`

### Greeting

- `GET /api/greeting` - Public greeting (no auth required)
- `GET /api/greeting/authenticated` - Authenticated greeting
- `GET /api/greeting/sensitive` - Rate-limited sensitive endpoint
- `GET /api/greeting/roles` - Get user role names from database

## Environment Configuration

### Staging Environment (env.staging)

```
NODE_ENV=staging
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=will-be-replaced-at-deployment
DB_DATABASE=pharmadb
DB_SCHEMA=staging-pharma
JWT_SECRET=will-be-replaced-at-deployment
JWT_EXPIRES_IN=8h
```

### Production Environment (env.production)

```
NODE_ENV=production
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=will-be-replaced-at-deployment
DB_DATABASE=pharmadb
DB_SCHEMA=production-pharma
JWT_SECRET=will-be-replaced-at-deployment
JWT_EXPIRES_IN=8h
```

**Note**: `DB_PASSWORD` and `JWT_SECRET` are automatically replaced with GitHub repository secrets during deployment.

## Security Features

### JWT Authentication

- Global JWT guard applied to all endpoints
- Use `@SkipAuth()` decorator for public endpoints
- 8-hour token expiry

### Rate Limiting

- Global rate limiting (100 requests per 15 minutes)
- Custom limits with `@Throttle()` decorator
- IP-based tracking

## Database Schema

The application expects a `user_role` table with the following structure:

```sql
CREATE TABLE user_role (
  role_name VARCHAR(25) PRIMARY KEY,
  order_of_listing INT NOT NULL,
  description TEXT
);
```

## Deployment

### Automated Deployment with GitHub Actions

This project includes a GitHub Actions workflow that automatically deploys to EC2 based on branch names:

- **Push to `staging` branch** → Deploys to staging environment (port 3000)
- **Push to `main` branch** → Deploys to production environment (port 3001)

### Deployment Features

- **Branch-based environments**: Automatic environment detection
- **Zero-downtime deployment**: Graceful service restart
- **Systemd service management**: Automatic service creation and management
- **Environment-specific configuration**: Separate configs for staging/production

### Setup Requirements

1. **EC2 Instance**: Ubuntu 20.04+ with Node.js 18
2. **GitHub Secrets**: `EC2_SSH_PRIVATE_KEY` for SSH access
3. **Database**: PostgreSQL with staging/production schemas

For detailed deployment instructions, see [deployment.md](./deployment.md).

## Development

### Project Structure

```
src/
├── auth/           # Authentication module
├── common/         # Common utilities and guards
├── entities/       # TypeORM entities
├── greeting/       # Greeting module
├── services/       # Business logic services
└── main.ts         # Application entry point
```

### Available Scripts

- `npm run build` - Build the application
- `npm run start:dev` - Start in development mode
- `npm run start:staging` - Start staging environment
- `npm run start:production` - Start production environment
- `npm run lint` - Run ESLint
- `npm run test` - Run tests

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

This project is licensed under the MIT License.
