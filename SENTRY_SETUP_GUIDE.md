# Sentry Setup Guide

This guide will help you set up Sentry error tracking for the Wayfarian application.

## Overview

Sentry provides real-time error tracking and performance monitoring for both the server and mobile app. You'll need to create **two separate projects** in Sentry:
1. **Server Project** (Node.js)
2. **Client Project** (React Native)

---

## Step 1: Create a Sentry Account

1. Go to [https://sentry.io/signup/](https://sentry.io/signup/)
2. Sign up for a free account (free tier includes 5,000 errors/month)
3. Verify your email

---

## Step 2: Create Server Project

1. **Create New Project**
   - Click "Create Project" or go to Organization Settings
   - Select **Node.js** as the platform
   - Name it: `wayfarian-server` (or similar)
   - Click "Create Project"

2. **Get Server DSN**
   - After project creation, you'll see your DSN
   - Or go to: Settings → Projects → wayfarian-server → Client Keys (DSN)
   - Copy the DSN (looks like: `https://abc123@o123456.ingest.sentry.io/789012`)

3. **Configure Server**
   ```bash
   # Edit server/.env
   cd server
   ```
   
   Add to your `.env` file:
   ```env
   SENTRY_DSN="https://YOUR_KEY@YOUR_ORG.ingest.sentry.io/YOUR_PROJECT_ID"
   SENTRY_ENABLE_IN_DEV=false
   ```

---

## Step 3: Create Client Project

1. **Create Another Project**
   - Go back to Sentry dashboard
   - Click "Create Project" again
   - Select **React Native** as the platform
   - Name it: `wayfarian-app` (or similar)
   - Click "Create Project"

2. **Get Client DSN**
   - Copy the DSN from the setup wizard
   - Or go to: Settings → Projects → wayfarian-app → Client Keys (DSN)
   - This will be a **different DSN** than the server

3. **Configure Client**
   ```bash
   # Edit app/.env
   cd app
   ```
   
   Add to your `.env` file:
   ```env
   EXPO_PUBLIC_SENTRY_DSN="https://YOUR_KEY@YOUR_ORG.ingest.sentry.io/YOUR_PROJECT_ID"
   EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV=false
   ```

---

## Step 4: Test Sentry Integration

### Test Server Error Tracking

1. **Start the server:**
   ```bash
   cd server
   npm start
   ```

2. **Trigger a test error:**
   ```bash
   curl http://localhost:3001/api/test-sentry
   ```
   
   Or add a test route (temporary):
   ```javascript
   // In server/app.js (temporary)
   app.get('/api/test-sentry', (req, res) => {
     throw new Error('Test Sentry integration - Server');
   });
   ```

3. **Check Sentry Dashboard:**
   - Go to your server project in Sentry
   - You should see the error appear within seconds
   - Click on it to see stack trace, user context, etc.

### Test Client Error Tracking

1. **Start the mobile app:**
   ```bash
   cd app
   npm start
   ```

2. **Trigger a test error:**
   - Add a button in your app that throws an error:
   ```typescript
   import { captureException } from '../services/sentry';
   
   // In a component
   <Button 
     title="Test Sentry" 
     onPress={() => {
       captureException(new Error('Test Sentry integration - Client'));
     }}
   />
   ```

3. **Check Sentry Dashboard:**
   - Go to your client project in Sentry
   - You should see the error appear
   - Check device info, breadcrumbs, etc.

---

## Step 5: Configure Alerts (Optional)

1. **Set Up Email Alerts:**
   - Go to Alerts → Create Alert Rule
   - Choose "Issues"
   - Set condition: "When an issue is first seen"
   - Add your email as action
   - Save

2. **Set Up Slack/Discord (Optional):**
   - Go to Settings → Integrations
   - Connect Slack or Discord
   - Configure notifications

---

## Step 6: Performance Monitoring (Optional)

Both projects are configured with 10% performance sampling in production.

### View Performance Data:

1. **Server Performance:**
   - Go to server project → Performance
   - View transaction times, database queries, etc.

2. **Client Performance:**
   - Go to client project → Performance
   - View screen load times, navigation, etc.

### Adjust Sampling Rate:

If you want to change the sampling rate:

```javascript
// server/services/SentryService.js
tracesSampleRate: 0.1, // 10% - change to 0.5 for 50%, 1.0 for 100%

// app/services/sentry.ts
tracesSampleRate: 0.1, // 10% - change to 0.5 for 50%, 1.0 for 100%
```

---

## Configuration Reference

### Server Environment Variables

```env
# Required for Sentry to work
SENTRY_DSN="https://key@org.ingest.sentry.io/project"

# Optional: Enable in development (usually false)
SENTRY_ENABLE_IN_DEV=false

# Optional: Set release version for tracking
RELEASE_VERSION="1.0.0"
```

### Client Environment Variables

```env
# Required for Sentry to work
EXPO_PUBLIC_SENTRY_DSN="https://key@org.ingest.sentry.io/project"

# Optional: Enable in development (usually false)
EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV=false
```

---

## Features Enabled

### Server (Node.js)
- ✅ Automatic exception capturing
- ✅ Performance monitoring (10% sampling)
- ✅ Profiling integration
- ✅ Request/response context
- ✅ User context tracking
- ✅ Breadcrumb tracking
- ✅ Error filtering (skips auth/validation errors)
- ✅ Sensitive data filtering (removes passwords, tokens)

### Client (React Native)
- ✅ Automatic exception capturing
- ✅ Performance monitoring (10% sampling)
- ✅ Native crash handling
- ✅ React error boundaries
- ✅ Navigation tracking
- ✅ User interaction tracking
- ✅ App start performance
- ✅ Breadcrumb tracking
- ✅ Sensitive data filtering

---

## Troubleshooting

### Sentry Not Receiving Errors

1. **Check DSN is set correctly:**
   ```bash
   # Server
   cat server/.env | grep SENTRY_DSN
   
   # Client
   cat app/.env | grep EXPO_PUBLIC_SENTRY_DSN
   ```

2. **Check logs for Sentry initialization:**
   ```bash
   # Server logs should show:
   # [Sentry] Error tracking initialized
   
   # Client logs should show:
   # [Sentry] Error tracking initialized
   ```

3. **Verify NODE_ENV:**
   - If `NODE_ENV=development` and `SENTRY_ENABLE_IN_DEV=false`, errors won't be sent
   - Set `SENTRY_ENABLE_IN_DEV=true` for testing in development

4. **Check Sentry project status:**
   - Go to Sentry dashboard
   - Verify project is active
   - Check project DSN is correct

### Network Issues

If behind a firewall:
- Ensure `*.ingest.sentry.io` is allowed
- Check proxy settings

---

## Production Checklist

Before deploying to production:

- [ ] Server SENTRY_DSN is set
- [ ] Client EXPO_PUBLIC_SENTRY_DSN is set
- [ ] Both projects are separate in Sentry
- [ ] Test error capturing in staging
- [ ] Alerts are configured
- [ ] Performance monitoring tested
- [ ] SENTRY_ENABLE_IN_DEV=false
- [ ] Different DSNs for dev/staging/production (optional but recommended)

---

## Cost Considerations

**Free Tier (Suitable for small projects):**
- 5,000 errors/month
- 10,000 performance units/month
- 1 team member

**Paid Plans:**
- Start at $26/month for team plan
- More errors, performance units, and team members
- Advanced features (custom alerts, integrations, etc.)

**Recommendation for Production:**
- Start with free tier
- Monitor usage in Sentry dashboard
- Upgrade if you hit limits

---

## Additional Resources

- [Sentry Node.js Documentation](https://docs.sentry.io/platforms/node/)
- [Sentry React Native Documentation](https://docs.sentry.io/platforms/react-native/)
- [Sentry Performance Monitoring](https://docs.sentry.io/product/performance/)
- [Sentry Best Practices](https://docs.sentry.io/product/best-practices/)

---

## Support

If you encounter issues:
1. Check the Sentry documentation
2. Review the `SECURITY.md` file
3. Check Sentry's status page: [https://status.sentry.io/](https://status.sentry.io/)
4. Contact Sentry support (paid plans only)

---

**Setup Completed!** 🎉

Once configured, Sentry will automatically capture and report errors from both your server and mobile app, helping you identify and fix issues quickly.
