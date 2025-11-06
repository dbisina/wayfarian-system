# Security Implementation Guide

This document outlines all security measures implemented in the Wayfarian system, best practices, and deployment procedures.

## Table of Contents
1. [Authentication & Authorization](#authentication--authorization)
2. [API Security](#api-security)
3. [Data Protection](#data-protection)
4. [Error Handling & Monitoring](#error-handling--monitoring)
5. [Environment Variables](#environment-variables)
6. [Deployment Checklist](#deployment-checklist)
7. [Incident Response](#incident-response)

---

## Authentication & Authorization

### Firebase Authentication
- **Provider**: Firebase Authentication with JWT tokens
- **Supported Methods**:
  - Email/Password
  - Google OAuth 2.0
  - Apple Sign-In (iOS only)

### Token Management
- **Tokens**: Firebase ID tokens (Bearer tokens in Authorization header)
- **Expiration**: Tokens expire after 1 hour
- **Refresh**: Client automatically refreshes tokens via Firebase SDK
- **Validation**: Server validates token expiration and age

#### Server-Side Token Validation
```javascript
// server/middleware/auth.js
- Verifies Firebase token signature
- Checks token expiration (exp claim)
- Validates token age (max 1 hour by default, configurable via TOKEN_MAX_AGE_SECONDS)
- Rejects expired or stale tokens
```

#### Security Configuration
```env
# Optional: Configure maximum token age (seconds)
TOKEN_MAX_AGE_SECONDS=3600  # 1 hour default
```

---

## API Security

### Rate Limiting
Environment-aware rate limiting protects against abuse:

```javascript
// Development
AUTH_ENDPOINTS: 100 requests / 15 minutes
JOURNEY_ENDPOINTS: 3000 requests / 15 minutes
GROUP_JOURNEY_ENDPOINTS: 1500 requests / 15 minutes

// Production
AUTH_ENDPOINTS: 30 requests / 15 minutes
JOURNEY_ENDPOINTS: 100 requests / 15 minutes
GROUP_JOURNEY_ENDPOINTS: 50 requests / 15 minutes
```

### CORS Protection
```javascript
// Development: Allow all origins (for mobile/LAN testing)
// Production: Whitelist-only via FRONTEND_URL env var
```

### Security Headers (Helmet)
```javascript
- Content Security Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- Strict-Transport-Security (HSTS)
- X-DNS-Prefetch-Control
```

### Input Validation
All user inputs are validated using:
- **express-validator**: Server-side validation
- **Custom middleware**: sanitizeInput removes XSS vectors
- **Prisma**: SQL injection protection via parameterized queries

#### Validation Middleware
```javascript
- validateCoordinates: GPS coordinates
- validateDateRange: Date ranges
- validatePagination: Pagination params
- validateFileUpload: File uploads
- validateGroupCode: Group join codes
- validateJourneyStatus: Journey statuses
- validateSpeed: Speed values
- validateVehicle: Vehicle types
- validateUUID: UUID formats
```

---

## Data Protection

### Environment Variables
**CRITICAL**: Never hardcode sensitive credentials in source code.

#### Required Environment Variables

**Server (.env):**
```env
# Database
DATABASE_URL="postgresql://user:pass@host:5432/dbname?sslmode=require"

# Firebase Admin SDK
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"

# Redis/Valkey
REDIS_URL="redis://localhost:6379"
# or
VALKEY_URL="redis://localhost:6379"
USE_VALKEY_QUEUE=true  # Enable persistent job queue

# Cloudinary
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Google Maps (server-side)
GOOGLE_MAPS_API_KEY="your-server-side-api-key"

# Sentry (optional but recommended)
SENTRY_DSN="https://xxxxx@yyyyy.ingest.sentry.io/zzzzz"
SENTRY_ENABLE_IN_DEV=false  # Don't send errors from dev

# Security
NODE_ENV="production"
TOKEN_MAX_AGE_SECONDS=3600
```

**Client (.env):**
```env
# Firebase Client
EXPO_PUBLIC_FIREBASE_API_KEY="your-firebase-api-key"
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
EXPO_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="123456789"
EXPO_PUBLIC_FIREBASE_APP_ID="1:123456789:web:abcdef"

# OAuth
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="your-oauth-client-id.apps.googleusercontent.com"

# Sentry (optional but recommended)
EXPO_PUBLIC_SENTRY_DSN="https://xxxxx@yyyyy.ingest.sentry.io/zzzzz"
EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV=false
```

### Encryption
- **In Transit**: All API requests use HTTPS/TLS
- **At Rest**: 
  - Database: Enable encryption at rest in PostgreSQL
  - Passwords: Hashed with bcrypt (cost factor 10)
  - PII: Consider encrypting sensitive fields (phone numbers, addresses)

### Data Sanitization
```javascript
// Prevent internal data leakage
- Never expose internal error messages in production
- Sanitize error responses (use generic messages)
- Filter sensitive headers from logs
- Redact credentials from logs
```

---

## Error Handling & Monitoring

### Sentry Integration

#### Server Configuration
```javascript
// Initialized in server/index.js (before other imports)
const sentryService = require('./services/SentryService');
sentryService.init();
```

Features:
- Automatic exception capturing
- Performance monitoring (10% sampling in production)
- User context tracking
- Breadcrumb tracking
- Graceful shutdown handling

#### Client Configuration
```typescript
// Initialized in app/app/_layout.tsx
import { initSentry } from '../services/sentry';
initSentry();
```

Features:
- React Native error boundaries
- Navigation tracking
- App start performance
- User interaction tracking
- Native crash handling

### Error Response Standards

**Development:**
```json
{
  "error": "Internal Server Error",
  "message": "Detailed error message",
  "stack": "Error stack trace...",
  "requestId": "req_123456",
  "timestamp": "2025-11-06T10:30:00.000Z"
}
```

**Production:**
```json
{
  "error": "Internal Server Error",
  "message": "Something went wrong. Please try again later.",
  "requestId": "req_123456",
  "timestamp": "2025-11-06T10:30:00.000Z"
}
```

---

## Environment Variables

### Security Best Practices

1. **Never commit .env files to version control**
   - Add `.env` to `.gitignore`
   - Use `.env.example` as template (no real values)

2. **Use different keys for each environment**
   - Development keys
   - Staging keys
   - Production keys

3. **Rotate keys regularly**
   - Firebase: Regenerate service account keys every 90 days
   - API keys: Rotate every 6 months
   - Database passwords: Rotate every 3 months

4. **Use secret management systems in production**
   - AWS Secrets Manager
   - Google Secret Manager
   - Azure Key Vault
   - HashiCorp Vault

### .env.example Template

**Server:**
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/wayfarian?sslmode=require"

# Firebase Admin SDK (get from Firebase Console > Project Settings > Service Accounts)
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_PRIVATE_KEY="your-private-key"
FIREBASE_CLIENT_EMAIL="your-service-account-email"

# Redis/Valkey
REDIS_URL="redis://localhost:6379"
USE_VALKEY_QUEUE=true

# Cloudinary
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Google Maps API (restrict to server IPs in Google Cloud Console)
GOOGLE_MAPS_API_KEY="your-server-api-key"

# Sentry (optional - get from sentry.io)
SENTRY_DSN="your-sentry-dsn"
SENTRY_ENABLE_IN_DEV=false

# Environment
NODE_ENV="development"
PORT=3001

# Security
TOKEN_MAX_AGE_SECONDS=3600
```

**Client:**
```env
# Firebase Client Configuration
EXPO_PUBLIC_FIREBASE_API_KEY="your-firebase-api-key"
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
EXPO_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project.firebasestorage.app"
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
EXPO_PUBLIC_FIREBASE_APP_ID="your-app-id"

# Google OAuth (get from Google Cloud Console)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID="your-web-client-id.apps.googleusercontent.com"

# Sentry (optional)
EXPO_PUBLIC_SENTRY_DSN="your-sentry-dsn"
EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV=false
```

---

## Deployment Checklist

### Pre-Deployment Security Audit

- [ ] **Code Review**
  - [ ] No hardcoded credentials in source code
  - [ ] No TODO/FIXME for security issues
  - [ ] All API endpoints have authentication
  - [ ] Input validation on all user inputs

- [ ] **Environment Configuration**
  - [ ] All required env vars set in production
  - [ ] Production uses different keys than dev/staging
  - [ ] Database connection uses SSL (`?sslmode=require`)
  - [ ] NODE_ENV set to "production"

- [ ] **API Security**
  - [ ] Rate limiting enabled
  - [ ] CORS configured with whitelist
  - [ ] Helmet security headers enabled
  - [ ] HTTPS/TLS enforced

- [ ] **Monitoring**
  - [ ] Sentry configured and tested
  - [ ] Logs aggregation setup
  - [ ] Health check endpoint configured
  - [ ] Alerts configured for errors

- [ ] **Database**
  - [ ] Encryption at rest enabled
  - [ ] Connection pooling configured
  - [ ] Backups scheduled
  - [ ] Indexes optimized

- [ ] **Dependencies**
  - [ ] Run `npm audit` and fix vulnerabilities
  - [ ] Update outdated packages
  - [ ] Remove unused dependencies

### Deployment Steps

1. **Build & Test**
   ```bash
   # Server
   cd server
   npm ci
   npm run lint
   npm test
   npm audit fix
   
   # Client
   cd app
   npm ci
   npm run lint
   npm test
   ```

2. **Set Environment Variables**
   - Configure all production env vars
   - Verify DATABASE_URL includes `?sslmode=require`
   - Verify REDIS_URL/VALKEY_URL if using persistent queue

3. **Database Migration**
   ```bash
   cd server
   npm run db:migrate  # or db:deploy for production
   ```

4. **Deploy**
   - Use CI/CD pipeline (recommended)
   - Or manual deployment with zero-downtime strategy

5. **Post-Deployment Verification**
   - [ ] Health check returns 200
   - [ ] Can create account and login
   - [ ] Sentry receiving events
   - [ ] Logs being collected
   - [ ] Database queries working

---

## Incident Response

### Security Incident Response Plan

#### 1. Detection
- Monitor Sentry for suspicious errors
- Check server logs for unusual patterns
- Review rate limit violations

#### 2. Containment
```bash
# Immediately rotate compromised keys
# Block suspicious IPs
# Disable compromised user accounts
```

#### 3. Investigation
- Review audit logs
- Check Sentry breadcrumbs
- Analyze database queries
- Review authentication logs

#### 4. Recovery
- Deploy patched code
- Rotate all potentially compromised keys
- Notify affected users
- Update security measures

#### 5. Post-Incident
- Document incident
- Update security measures
- Conduct team review
- Update incident response plan

### Key Rotation Procedures

**Firebase Service Account:**
1. Generate new key in Firebase Console
2. Update FIREBASE_PRIVATE_KEY env var
3. Deploy updated config
4. Verify authentication working
5. Delete old key from Firebase Console

**Database Credentials:**
1. Create new database user with same permissions
2. Update DATABASE_URL with new credentials
3. Deploy updated config
4. Verify connections working
5. Drop old database user

**API Keys (Google Maps, Cloudinary):**
1. Generate new key in provider console
2. Update env var
3. Deploy updated config
4. Verify functionality
5. Revoke old key

---

## Security Contacts

**Report Security Issues:**
- Email: security@wayfarian.com
- Response Time: 24 hours
- PGP Key: [Link to public key]

**Maintainers:**
- Lead Developer: [Name/Email]
- Security Officer: [Name/Email]
- DevOps Lead: [Name/Email]

---

## Compliance & Standards

### Frameworks & Standards
- OWASP Top 10 (2021)
- OWASP Mobile Security Testing Guide
- NIST Cybersecurity Framework
- GDPR (for EU users)
- CCPA (for California users)

### Regular Security Activities
- Weekly: Dependency updates (`npm audit`)
- Monthly: Security review of new code
- Quarterly: Key rotation
- Annually: Full security audit

---

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [React Native Security](https://reactnative.dev/docs/security)
- [Firebase Security Rules](https://firebase.google.com/docs/rules)

---

**Last Updated:** November 6, 2025  
**Version:** 1.0.0  
**Next Review:** December 6, 2025
