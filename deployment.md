# Deployment Guide

## Overview

This project uses GitHub Actions to automatically deploy to EC2 based on branch names:

- **`main` branch** → Production environment (port 3001)
- **`staging` branch** → Staging environment (port 3000)

## Prerequisites

### 1. EC2 Instance Setup

- Ubuntu 20.04+ instance running
- Instance endpoint: Configured via GitHub secret `EC2_HOST`
- Security group allows SSH access from GitHub Actions
- User `ubuntu` with sudo privileges

### 2. GitHub Repository Secrets

Add these secrets in your GitHub repository settings:

```
EC2_SSH_PRIVATE_KEY: Your private SSH key for EC2 access
EC2_HOST: Your EC2 instance endpoint (e.g., ec2-123-456-789-012.compute-1.amazonaws.com)
DB_PASSWORD: Your PostgreSQL database password
JWT_SECRET: Your JWT secret key for authentication
SMS_API_KEY: Your SMS API key for OTP functionality
AWS_ACCESS_KEY: Your AWS access key ID
AWS_SECRET_KEY: Your AWS secret access key
```

## Local Development

### AWS Credentials Auto-Loading

When running the application locally, AWS credentials are automatically loaded from your AWS CLI credentials file. This eliminates the need to hardcode credentials in your local environment files.

**How it works:**

1. Install and configure AWS CLI on your local machine:

   ```bash
   # Windows: Download from https://aws.amazon.com/cli/
   # Mac: brew install awscli
   # Linux: sudo apt-get install awscli

   # Configure credentials
   aws configure
   ```

2. The application automatically reads credentials from:

   - **Windows:** `C:\Users\<YourUser>\.aws\credentials`
   - **Mac/Linux:** `~/.aws/credentials`

3. When you run `npm run start:dev`, the app automatically (via `src/main.ts`):
   - Detects if AWS credentials are placeholders
   - Loads actual credentials from your AWS credentials file
   - Sets them as environment variables before the app initializes

**Benefits:**

- ✅ No need to replace placeholders in `env.staging` or `env.production` files
- ✅ Uses your existing AWS CLI configuration
- ✅ Works across Windows, Mac, and Linux
- ✅ Secure - credentials never committed to Git
- ✅ Runs automatically on application startup (built into `main.ts`)

## Setup Instructions

### 1. Generate SSH Key Pair

```bash
# Generate SSH key pair
ssh-keygen -t rsa -b 4096 -C "github-actions@yourdomain.com"

# Copy public key to EC2 (replace 'your-ec2-endpoint' with actual endpoint)
ssh-copy-id -i ~/.ssh/id_rsa.pub ubuntu@your-ec2-endpoint

# Copy private key content to GitHub secret
cat ~/.ssh/id_rsa
```

### 2. EC2 Instance Preparation

```bash
# SSH into your EC2 instance
ssh ubuntu@ec2instancename.xyz.com

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally (optional, for process management)
sudo npm install -g pm2

# Create application directory
sudo mkdir -p /opt/pharma-tracker-api
sudo chown ubuntu:ubuntu /opt/pharma-tracker-api
```

### 3. Database Setup

Ensure PostgreSQL is running and accessible:

```bash
# Install PostgreSQL if not already installed
sudo apt update
sudo apt install postgresql postgresql-contrib

# Create database and schemas
sudo -u postgres psql
CREATE DATABASE pharmadb;
\c pharmadb
CREATE SCHEMA "staging-pharma";
CREATE SCHEMA "production-pharma";
```

### 4. Environment Files

The environment files (`env.staging` and `env.production`) are templates that will be automatically populated during deployment with:

- **Database credentials**: `DB_PASSWORD` from GitHub secret
- **JWT secrets**: `JWT_SECRET` from GitHub secret
- **Environment-specific settings**: Ports, schemas, etc.
- **Sensitive data**: Never committed to repository

**Note**: The actual sensitive values (DB_PASSWORD, JWT_SECRET) are stored as GitHub repository secrets and injected during deployment.

## How It Works

### Branch-Based Deployment

1. **Push to `staging` branch** → Deploys to staging environment on port 3000
2. **Push to `main` branch** → Deploys to production environment on port 3001

### Deployment Process

1. GitHub Actions builds the application
2. Copies built files to EC2
3. Installs production dependencies
4. Creates/updates systemd service
5. Restarts the service

### Service Management

- **Staging service**: `pharma-tracker-staging`
- **Production service**: `pharma-tracker-production`

## Manual Deployment Commands

### Check Service Status

```bash
# Check staging service
sudo systemctl status pharma-tracker-staging

# Check production service
sudo systemctl status pharma-tracker-production
```

### Manual Service Control

```bash
# Start service
sudo systemctl start pharma-tracker-staging

# Stop service
sudo systemctl stop pharma-tracker-staging

# Restart service
sudo systemctl restart pharma-tracker-staging

# View logs
sudo journalctl -u pharma-tracker-staging -f
```

## Troubleshooting

### Common Issues

1. **SSH Connection Failed**

   - Verify EC2 security group allows SSH from GitHub Actions
   - Check SSH key is correctly added to GitHub secrets

2. **Service Won't Start**

   - Check logs: `sudo journalctl -u pharma-tracker-staging -f`
   - Verify environment file exists and has correct values
   - Check database connectivity

3. **Port Already in Use**
   - Verify no other services are using ports 3000/3001
   - Check firewall settings

### Log Locations

- **Application logs**: `/var/log/syslog`
- **Service logs**: `sudo journalctl -u pharma-tracker-staging`
- **Application directory**: `/opt/pharma-tracker-api/staging` or `/opt/pharma-tracker-api/production`

## Security Considerations

1. **SSH Key Management**

   - Use dedicated SSH key for deployments
   - Regularly rotate SSH keys
   - Limit SSH access to necessary IPs

2. **Environment Variables**

   - Never commit sensitive data to repository
   - Use strong JWT secrets
   - Secure database credentials

3. **Network Security**
   - Restrict EC2 security group access
   - Use VPC for additional network isolation
   - Consider using AWS Secrets Manager for sensitive data
