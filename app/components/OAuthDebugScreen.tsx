import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import { getCurrentApiUrl, getApiHostBase, pingServer, getApiOverride, setApiOverride, clearApiOverride } from '../services/api';

export default function OAuthDebugScreen() {
  const [debugInfo, setDebugInfo] = useState<any>({});
  const [overrideUrl, setOverrideUrlState] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    try {
  // Resolve scheme from app config so iOS/Android match the actual configured scheme
  const resolvedScheme = (Constants as any)?.expoConfig?.scheme || (Constants as any)?.manifest?.scheme || 'app';
  // Expo proxy-style redirect (recommended in development across devices)
  const proxyRedirectUri = AuthSession.makeRedirectUri({ preferLocalhost: false });
  // Native scheme redirect (when using custom scheme in app.json)
  const nativeRedirectUri = AuthSession.makeRedirectUri({ scheme: resolvedScheme, preferLocalhost: false });
      
      setDebugInfo({
        proxyRedirectUri,
        nativeRedirectUri,
        apiBaseUrl: getCurrentApiUrl(),
        apiHostBase: getApiHostBase(),
        expoConstants: {
          linkingUri: Constants.linkingUri,
          manifest: Constants.manifest,
          platform: Constants.platform,
          scheme: resolvedScheme,
        },
        googleClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      });
      
      // Kick off an initial connectivity check
      (async () => {
        const savedOverride = await getApiOverride();
        if (savedOverride) setOverrideUrlState(savedOverride);
        const res = await pingServer(4000);
        setDebugInfo((prev: any) => ({ ...prev, apiPing: res }));
      })();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setDebugInfo({ error: message });
    }
  }, []);

  const handlePing = async () => {
    setDebugInfo((prev: any) => ({ ...prev, apiPing: { ok: false, error: 'Checking...' } }));
    const res = await pingServer(4000);
    setDebugInfo((prev: any) => ({ ...prev, apiPing: res }));
  };

  const handleSaveOverride = async () => {
    try {
      setSaving(true);
      await setApiOverride(overrideUrl);
      setDebugInfo((prev: any) => ({
        ...prev,
        apiBaseUrl: getCurrentApiUrl(),
        apiHostBase: getApiHostBase(),
      }));
      await handlePing();
    } finally {
      setSaving(false);
    }
  };

  const handleClearOverride = async () => {
    try {
      setSaving(true);
      await clearApiOverride();
      setDebugInfo((prev: any) => ({
        ...prev,
        apiBaseUrl: getCurrentApiUrl(),
        apiHostBase: getApiHostBase(),
      }));
      await handlePing();
    } finally {
      setSaving(false);
    }
  };

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
          <Text style={styles.label}>API Base URL:</Text>
          <Text style={styles.value}>{debugInfo.apiBaseUrl}</Text>
        </View>
        
        <View style={styles.infoBlock}>
          <Text style={styles.label}>API Host (no /api):</Text>
          <Text style={styles.value}>{debugInfo.apiHostBase}</Text>
        </View>
        
        <View style={styles.infoBlock}>
          <Text style={styles.label}>Linking URI:</Text>
          <Text style={styles.value}>{debugInfo.expoConstants?.linkingUri}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>API Base Override (Tunnel / Custom)</Text>
        <View style={styles.infoBlock}>
          <Text style={styles.label}>Override Base (http(s)://host[:port][/api])</Text>
          <TextInput
            value={overrideUrl}
            onChangeText={setOverrideUrlState}
            placeholder="https://your-tunnel.example.com/api"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={[styles.value, styles.inputBox]}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <TouchableOpacity disabled={saving || !overrideUrl} onPress={handleSaveOverride} style={[styles.button, { opacity: saving || !overrideUrl ? 0.6 : 1 }]}>
              <Text style={styles.buttonText}>{saving ? 'Saving…' : 'Save Override'}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={saving} onPress={handleClearOverride} style={[styles.button, { backgroundColor: '#999', opacity: saving ? 0.6 : 1 }]}>
              <Text style={styles.buttonText}>Clear Override</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { marginTop: 8 }]}>Tip: Paste your ngrok/Cloudflare tunnel URL here to avoid changing LAN IPs.</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>API Connectivity</Text>
        <View style={styles.infoBlock}>
          <Text style={styles.label}>GET /health</Text>
          <TouchableOpacity onPress={handlePing}>
            <Text style={[styles.value, { marginBottom: 6 }]}>Tap to Ping</Text>
          </TouchableOpacity>
          <Text style={styles.value}>
            {debugInfo?.apiPing
              ? debugInfo.apiPing.ok
                ? `OK: ${JSON.stringify(debugInfo.apiPing.data)}`
                : `Error: ${debugInfo.apiPing.error}`
              : 'Not checked'}
          </Text>
        </View>
      </View>

      <View style={styles.instructions}>
        <Text style={styles.instructionsTitle}>Add these URIs to Google Console:</Text>
        <Text style={styles.instructionsText}>
          1. Go to Google Cloud Console{'\n'}
          2. Select your project{'\n'}
          3. Go to APIs & Services → Credentials{'\n'}
          4. Edit your OAuth 2.0 client{'\n'}
          5. Add the Proxy Redirect URI to Authorized redirect URIs{'\n'}
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
  inputBox: {
    fontSize: 12,
    color: '#333',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 8,
    borderRadius: 4,
  },
  button: {
    marginTop: 8,
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});