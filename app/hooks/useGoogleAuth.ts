// app/hooks/useGoogleAuth.ts
// Google authentication hook following Expo best practices

import { useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, useAuthRequest, ResponseType } from 'expo-auth-session';
import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';

// Complete the auth session
WebBrowser.maybeCompleteAuthSession();

// Google OAuth configuration
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

// Discovery endpoint for Google OAuth
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export function useGoogleAuth(auth: any, onAuthSuccess: (user: any) => Promise<void>) {
  // Create auth request configuration
  const authRequest = {
    clientId: GOOGLE_WEB_CLIENT_ID!,
    scopes: ['openid', 'profile', 'email'],
    redirectUri: makeRedirectUri({
      scheme: 'app', // from app.json
    }),
    responseType: ResponseType.Code,
    extraParams: {},
  };

  // Use the auth request hook
  const [request, response, promptAsync] = useAuthRequest(authRequest, discovery);

  // Handle the response
  useEffect(() => {
    if (response?.type === 'success') {
      handleGoogleAuth(response);
    } else if (response?.type === 'error') {
      console.error('Google Auth Error:', response.error);
    }
  }, [response]);

  const handleGoogleAuth = async (authResponse: any) => {
    try {
      console.log('Authorization code received, exchanging for tokens...');
      
      // Exchange the authorization code for tokens
      const tokenRequest = {
        code: authResponse.params.code,
        client_id: GOOGLE_WEB_CLIENT_ID!,
        redirect_uri: authRequest.redirectUri,
        grant_type: 'authorization_code',
      };

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: Object.entries(tokenRequest)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
          .join('&'),
      });

      const tokens = await tokenResponse.json();
      
      if (!tokens.id_token) {
        throw new Error('No ID token received from Google');
      }

      console.log('Token exchange successful, received ID token');

      // Create Firebase credential with Google ID token
      const googleCredential = GoogleAuthProvider.credential(tokens.id_token);
      
      // Sign in to Firebase with Google credential
      console.log('Signing into Firebase...');
      const firebaseResult = await signInWithCredential(auth, googleCredential);
      console.log('Firebase sign-in successful');
      
      // Call the success callback
      await onAuthSuccess(firebaseResult.user);
      console.log('Google Sign-In completed successfully');
      
    } catch (error) {
      console.error('Error during Google authentication:', error);
      throw error;
    }
  };

  return {
    request,
    response,
    promptAsync,
    isReady: !!request,
  };
}