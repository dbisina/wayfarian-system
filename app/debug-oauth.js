// Quick debug script to check OAuth redirect URI
import * as AuthSession from 'expo-auth-session';

console.log('=== OAuth Debug Info ===');

// Test the redirect URI generation
const proxyRedirectUri = AuthSession.makeRedirectUri({ useProxy: true });
const nativeRedirectUri = AuthSession.makeRedirectUri({ useProxy: false });

console.log('Proxy Redirect URI:', proxyRedirectUri);
console.log('Native Redirect URI:', nativeRedirectUri);

// Check current Expo configuration
console.log('Expo Constants:', {
  scheme: 'app', // from app.json
  linkingUri: 'exp://localhost:19000/--/',
});

console.log('=== End Debug Info ===');