// app/services/sentry.ts

import * as Sentry from '@sentry/react-native';
import { reactNativeTracingIntegration, reactNavigationIntegration } from '@sentry/react-native';
import Constants from 'expo-constants';

// DSN must come from the environment — never hardcode it in source.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

const navigationIntegration = reactNavigationIntegration();

/**
 * Initialises the Sentry SDK for React Native.
 *
 * No-ops silently when `EXPO_PUBLIC_SENTRY_DSN` is not set, so local and CI
 * environments without the secret configured do not crash or log noise.
 *
 * Filtering rules applied via `beforeSend`:
 * - Auth errors (invalid/expired token, unauthorised, cancelled) are user-facing
 *   and not actionable by the engineering team, so they are dropped.
 * - Validation errors originate from bad user input and add no signal.
 * - Network errors in development are expected (local server down, proxies, etc.).
 *
 * `beforeBreadcrumb` strips Authorization headers and passwords from HTTP
 * breadcrumbs, and drops AsyncStorage breadcrumbs which may contain PII.
 */
export function initSentry() {
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

      // 10% sample rate in prod keeps costs down while preserving signal.
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
      profilesSampleRate: environment === 'production' ? 0.1 : 1.0,

      beforeSend(event, hint) {
        // Skip sending to Sentry in development unless explicitly opted in.
        if (environment === 'development' && !process.env.EXPO_PUBLIC_SENTRY_ENABLE_IN_DEV) {
          return null;
        }

        const error = hint.originalException;
        if (error && typeof error === 'object' && 'message' in error) {
          const message = String(error.message);

          // Auth and cancellation errors are user-facing, not actionable.
          if (
            message.includes('Invalid token') ||
            message.includes('Token expired') ||
            message.includes('Unauthorized') ||
            message.includes('cancelled') ||
            message.includes('canceled')
          ) {
            return null;
          }

          // Validation errors originate from user input.
          if (message.includes('Validation Error') || message.includes('Invalid input')) {
            return null;
          }

          // Development network errors are expected (no local server, VPN, etc.).
          if (message.includes('Network request failed') && environment === 'development') {
            return null;
          }
        }

        return event;
      },

      beforeBreadcrumb(breadcrumb) {
        // Strip auth headers from HTTP breadcrumbs to avoid leaking tokens.
        if (breadcrumb.category === 'http' && breadcrumb.data) {
          delete breadcrumb.data.Authorization;
          delete breadcrumb.data.authorization;
          delete breadcrumb.data.password;
          delete breadcrumb.data.token;
        }

        // AsyncStorage breadcrumbs may contain user PII — drop them entirely.
        if (breadcrumb.category === 'storage') {
          return null;
        }

        return breadcrumb;
      },

      debug: environment === 'development',
      attachStacktrace: true,
      enableNative: true,
      enableNativeCrashHandling: true,
      enableAutoSessionTracking: true,
      sessionTrackingIntervalMillis: 30000,

      integrations: [
        reactNativeTracingIntegration({
          enableHTTPTimings: true,
        }),
        navigationIntegration,
      ],
    });

    console.log('[Sentry] Error tracking initialized', { environment, release });
  } catch (error) {
    console.error('[Sentry] Failed to initialize:', error);
  }
}

/**
 * Captures an exception in Sentry with optional tags and extra context.
 *
 * @param error - The `Error` object to report.
 * @param context.tags - Key/value pairs for Sentry issue grouping and filtering.
 * @param context.extra - Arbitrary extra data attached to the event.
 * @param context.level - Sentry severity level (default: `'error'`).
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
 * Captures a free-form message in Sentry.
 *
 * @param message - The message string to record.
 * @param level - Sentry severity level (default: `'info'`).
 * @param context.tags - Key/value pairs for filtering.
 * @param context.extra - Arbitrary extra data.
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
 * Sets the authenticated user context on all subsequent Sentry events.
 * Call after successful login; clear with {@link clearUser} on logout.
 *
 * @param user.id - Unique user identifier (required).
 * @param user.email - Optional email address.
 * @param user.username - Optional display name.
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
 * Clears the user context from Sentry. Call on logout to prevent subsequent
 * events from being attributed to the previous session's user.
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
 * Adds a breadcrumb to the Sentry event trail for the current session.
 *
 * @param message - Human-readable description of the event.
 * @param data - Optional structured data attached to the breadcrumb.
 * @param category - Dot-namespaced category (default: `'custom'`).
 * @param level - Severity level (default: `'info'`).
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
 * Higher-order component that wraps a React component with a Sentry error boundary.
 * Uncaught render errors are reported and a fallback UI is shown.
 */
export const ErrorBoundary = Sentry.wrap;

export { Sentry };
