// Diagnostic utility to test API connectivity
import { getCurrentApiUrl } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function testApiConnection() {
  const apiUrl = getCurrentApiUrl();
  const results = {
    apiUrl,
    tests: [] as { name: string; status: 'pass' | 'fail'; message: string; duration: number }[],
  };

  console.log('[Diagnostics] Testing API connection to:', apiUrl);

  // Test 1: Health check
  try {
    const start = Date.now();
    const baseUrl = apiUrl.replace('/api', '');
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
    });
    const duration = Date.now() - start;
    const data = await response.json();
    
    results.tests.push({
      name: 'Health Check',
      status: response.ok ? 'pass' : 'fail',
      message: `${response.status} - ${data.status || 'Unknown'} (${duration}ms)`,
      duration,
    });
  } catch (error: any) {
    results.tests.push({
      name: 'Health Check',
      status: 'fail',
      message: `Error: ${error.message}`,
      duration: 0,
    });
  }

  // Test 2: Auth endpoint (should return 401)
  try {
    const start = Date.now();
    const response = await fetch(`${apiUrl}/user/profile-picture`, {
      method: 'POST',
    });
    const duration = Date.now() - start;
    
    results.tests.push({
      name: 'Profile Upload Endpoint',
      status: response.status === 401 ? 'pass' : 'fail',
      message: `${response.status} ${response.statusText} (${duration}ms) - Expected 401`,
      duration,
    });
  } catch (error: any) {
    results.tests.push({
      name: 'Profile Upload Endpoint',
      status: 'fail',
      message: `Error: ${error.message}`,
      duration: 0,
    });
  }

  // Test 3: Check auth token exists
  try {
    const token = await AsyncStorage.getItem('authToken');
    results.tests.push({
      name: 'Auth Token',
      status: token ? 'pass' : 'fail',
      message: token ? `Token exists (${token.substring(0, 20)}...)` : 'No token found',
      duration: 0,
    });
  } catch (error: any) {
    results.tests.push({
      name: 'Auth Token',
      status: 'fail',
      message: `Error: ${error.message}`,
      duration: 0,
    });
  }

  return results;
}

export function printDiagnostics(results: any) {
  console.log('\n========================================');
  console.log('API Connection Diagnostics');
  console.log('========================================');
  console.log('API URL:', results.apiUrl);
  console.log('----------------------------------------');
  
  results.tests.forEach((test: any) => {
    const icon = test.status === 'pass' ? '✅' : '❌';
    console.log(`${icon} ${test.name}: ${test.message}`);
  });
  
  console.log('========================================\n');
  
  const allPassed = results.tests.every((t: any) => t.status === 'pass');
  return allPassed;
}
