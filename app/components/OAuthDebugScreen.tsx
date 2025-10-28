import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';

export default function OAuthDebugScreen() {
  const [debugInfo, setDebugInfo] = useState<any>({});

  useEffect(() => {
    try {
      const proxyRedirectUri = AuthSession.makeRedirectUri({ useProxy: true });
      const nativeRedirectUri = AuthSession.makeRedirectUri({ useProxy: false });
      
      setDebugInfo({
        proxyRedirectUri,
        nativeRedirectUri,
        expoConstants: {
          linkingUri: Constants.linkingUri,
          manifest: Constants.manifest,
          platform: Constants.platform,
        },
        googleClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      });
    } catch (error) {
      setDebugInfo({ error: error.message });
    }
  }, []);

  const copyToClipboard = (text: string) => {
    // In a real app, you'd use Clipboard.setStringAsync(text);
    console.log('Copy this URI to Google Console:', text);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>OAuth Debug Information</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Redirect URIs</Text>
        
        <View style={styles.infoBlock}>
          <Text style={styles.label}>Proxy Redirect URI (Recommended):</Text>
          <TouchableOpacity onPress={() => copyToClipboard(debugInfo.proxyRedirectUri)}>
            <Text style={styles.value}>{debugInfo.proxyRedirectUri}</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.infoBlock}>
          <Text style={styles.label}>Native Redirect URI:</Text>
          <TouchableOpacity onPress={() => copyToClipboard(debugInfo.nativeRedirectUri)}>
            <Text style={styles.value}>{debugInfo.nativeRedirectUri}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Configuration</Text>
        
        <View style={styles.infoBlock}>
          <Text style={styles.label}>Google Client ID:</Text>
          <Text style={styles.value}>{debugInfo.googleClientId}</Text>
        </View>
        
        <View style={styles.infoBlock}>
          <Text style={styles.label}>Linking URI:</Text>
          <Text style={styles.value}>{debugInfo.expoConstants?.linkingUri}</Text>
        </View>
      </View>

      <View style={styles.instructions}>
        <Text style={styles.instructionsTitle}>Add these URIs to Google Console:</Text>
        <Text style={styles.instructionsText}>
          1. Go to Google Cloud Console{'\n'}
          2. Select your project{'\n'}
          3. Go to APIs & Services → Credentials{'\n'}
          4. Edit your OAuth 2.0 client{'\n'}
          5. Add the Proxy Redirect URI to "Authorized redirect URIs"{'\n'}
          6. Save the configuration
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  section: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  infoBlock: {
    marginBottom: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 5,
  },
  value: {
    fontSize: 12,
    color: '#007AFF',
    backgroundColor: '#f8f8f8',
    padding: 8,
    borderRadius: 4,
    fontFamily: 'monospace',
  },
  instructions: {
    backgroundColor: '#e8f4f8',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  instructionsText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
});