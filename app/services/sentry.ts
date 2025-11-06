// app/services/sentry.ts
// Sentry error tracking and performance monitoring for React Native

import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

// SECURITY: Never hardcode DSN - must be provided via environment variable
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * Initialize Sentry for React Native
 */
export function initSentry() {
  // Only initialize if DSN is provided
  if (!SENTRY_DSN) {
    console.warn('[Sentry] DSN not configured - error tracking disabled');
    return;
  }

  const environment = process.env.NODE_ENV || 'development';
  const release = `wayfarian-app@${Constants.expoConfig?.version || '1.0.0'}`;

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment,
      release,

      // Performance monitoring
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev
      
      // Enable for performance profiling in production
      profilesSampleRate: environment === 'production' ? 0.1 : 1.0,

      // Configure which errors to capture
      beforeSend(event, hint) {
        // Don't send errors in development unless explicitly enabled
        if (environment === 'development' && !process.env.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV) {
          return null;
        }

        // Filter out known user errors
        const error = hint.originalException;
        if (error && typeof error === 'object' && 'message' in error) {
          const message = String(error.message);
          
          // Don't send auth errors (these are user errors, not system errors)
          if (
            message.includes('Invalid token') ||
            message.includes('Token expired') ||
            message.includes('Unauthorized') ||
            message.includes('cancelled') ||
            message.includes('canceled')
          ) {
            return null;
          }

          // Don't send validation errors (user input errors)
          if (message.includes('Validation Error') || message.includes('Invalid input')) {
            return null;
          }

          // Don't send network errors that are expected
          if (message.includes('Network request failed') && environment === 'development') {
            return null;
          }
        }

        return event;
      },

      // Filter sensitive data from breadcrumbs
      beforeBreadcrumb(breadcrumb) {
        // Remove sensitive headers from network breadcrumbs
        if (breadcrumb.category === 'http' && breadcrumb.data) {
          delete breadcrumb.data.Authorization;
          delete breadcrumb.data.authorization;
          delete breadcrumb.data.password;
          delete breadcrumb.data.token;
        }

        // Filter out AsyncStorage breadcrumbs (may contain sensitive data)
        if (breadcrumb.category === 'storage') {
          return null;
        }

        return breadcrumb;
      },

      // Enable debug mode in development
      debug: environment === 'development',

      // Automatically capture console errors
      attachStacktrace: true,

      // Native crash handling
      enableNative: true,
      enableNativeCrashHandling: true,

      // Auto session tracking
      enableAutoSessionTracking: true,

      // Session timeout (30 minutes)
      sessionTrackingIntervalMillis: 30000,

      // Integration configuration
      integrations: [
        new Sentry.ReactNativeTracing({
          // Routing instrumentation for react-navigation
          routingInstrumentation: new Sentry.ReactNavigationInstrumentation(),
          
          // Track app start performance
          enableAppStartTracking: true,
          
          // Track stall performance
          enableStallTracking: true,
          
          // Track user interaction events
          enableUserInteractionTracing: true,
        }),
      ],
    });

    console.log('[Sentry] Error tracking initialized', {
      environment,
      release,
    });
  } catch (error) {
    console.error('[Sentry] Failed to initialize:', error);
  }
}

/**
 * Capture an exception in Sentry
 */
export function captureException(error: Error, context?: {
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  level?: Sentry.SeverityLevel;
}) {
  if (!SENTRY_DSN) return;

  try {
    Sentry.captureException(error, {
      tags: context?.tags,
      extra: context?.extra,
      level: context?.level || 'error',
    });
  } catch (err) {
    console.error('[Sentry] Failed to capture exception:', err);
  }
}

/**
 * Capture a message in Sentry
 */
export function captureMessage(
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
  }
) {
  if (!SENTRY_DSN) return;

  try {
    Sentry.captureMessage(message, {
      level,
      tags: context?.tags,
      extra: context?.extra,
    });
  } catch (err) {
    console.error('[Sentry] Failed to capture message:', err);
  }
}

/**
 * Set user context in Sentry
 */
export function setUser(user: {
  id: string;
  email?: string;
  username?: string;
}) {
  if (!SENTRY_DSN) return;

  try {
    Sentry.setUser({
      id: user.id,
      email: user.email,
      username: user.username,
    });
  } catch (err) {
    console.error('[Sentry] Failed to set user:', err);
  }
}

/**
 * Clear user context in Sentry
 */
export function clearUser() {
  if (!SENTRY_DSN) return;

  try {
    Sentry.setUser(null);
  } catch (err) {
    console.error('[Sentry] Failed to clear user:', err);
  }
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(
  message: string,
  data?: Record<string, any>,
  category: string = 'custom',
  level: Sentry.SeverityLevel = 'info'
) {
  if (!SENTRY_DSN) return;

  try {
    Sentry.addBreadcrumb({
      message,
      category,
      data,
      level,
    });
  } catch (err) {
    console.error('[Sentry] Failed to add breadcrumb:', err);
  }
}

/**
 * Wrap a component with Sentry error boundary
 */
export const ErrorBoundary = Sentry.wrap;

// Export Sentry for advanced usage
export { Sentry };
