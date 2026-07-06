import * as Sentry from '@sentry/react-native';

/**
 * Sentry is entirely optional — if EXPO_PUBLIC_SENTRY_DSN isn't set, this is
 * a no-op and the app runs exactly as before. Set it in .env to get crash
 * reports with stack traces from real devices in the field, instead of only
 * finding out a coordinator's app crashed when they call to say so.
 */
const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initSentry(): void {
  if (!DSN) {
    if (__DEV__) {
      console.log('Sentry DSN not configured — crash reporting disabled');
    }
    return;
  }

  Sentry.init({
    dsn: DSN,
    debug: false,
    tracesSampleRate: 0.2,
    // Don't send auth tokens or other sensitive request data.
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers.Authorization;
        delete event.request.headers.authorization;
      }
      return event;
    }
  });
}

export { Sentry };
