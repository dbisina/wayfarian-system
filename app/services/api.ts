// app/services/api.ts
// Central API service for all backend communication

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Resolve API base URL dynamically for dev: env > LAN IP from Expo host > Android emulator alias > localhost
const deriveApiUrl = (): string => {
  // 1) In development, ignore EXPO_PUBLIC_API_URL and auto-detect
  if (!__DEV__ && process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (__DEV__ && process.env.EXPO_PUBLIC_API_URL) {
    console.log('[API] Dev mode: ignoring EXPO_PUBLIC_API_URL in favor of auto-detect');
  }

  // 2) Try to derive LAN IP from Expo dev server hostUri
  const hostUri = (Constants as any)?.expoConfig?.hostUri
    || (Constants as any)?.manifest?.hostUri
    || '';
  const hostIp = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';
  if (hostIp && /^\d+\.\d+\.\d+\.\d+$/.test(hostIp)) {
    return `http://${hostIp}:3001/api`;
  }

  // 3) Android emulator special alias to host machine
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3001/api';
  }

  // 4) Fallback to localhost
  return 'http://localhost:3001/api';
};

export const API_URL = deriveApiUrl();
console.log(`[API] Base URL: ${API_URL}`);

// Returns the host base (without trailing /api)
export const getApiHostBase = (): string => {
  // Always reflect the live base rather than initial constant
  const base = getCurrentApiUrl();
  if (base.endsWith('/api')) return base.slice(0, -4);
  return base.replace(/\/$/, '');
};

// Simple server health ping (GET /health)
export const pingServer = async (timeoutMs: number = 5000): Promise<{ ok: boolean; data?: any; error?: string }> => {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    const url = `${getApiHostBase()}/health`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: res.ok, data };
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? `Timeout after ${timeoutMs}ms` : (e?.message || 'Ping failed');
    return { ok: false, error: msg };
  }
};

// Runtime fallback: if first request fails with timeout/network error, probe common bases and switch
let currentApiUrl = API_URL;
let probingInProgress: Promise<string | null> | null = null;

// Optional developer override persisted in AsyncStorage (e.g., tunnel URL)
const API_OVERRIDE_KEY = 'apiOverrideUrl';
let overrideLoaded = false;
let loadOverridePromise: Promise<void> | null = null;

const normalizeBase = (base: string): string => {
  // ensure protocol present and append /api when missing
  let b = base.trim();
  if (!/^https?:\/\//i.test(b)) {
    b = `http://${b}`;
  }
  if (!/\/api\/?$/i.test(b)) {
    b = b.replace(/\/$/, '') + '/api';
  }
  return b;
};

const loadApiOverride = async () => {
  if (overrideLoaded) return;
  const saved = await AsyncStorage.getItem(API_OVERRIDE_KEY);
  if (saved) {
    const normalized = normalizeBase(saved);
    currentApiUrl = normalized;
    console.log(`[API] Using saved override base: ${currentApiUrl}`);
  }
  // If no saved override, try to adopt server-advertised public base from /health
  if (!saved) {
    try {
      const baseHost = currentApiUrl.endsWith('/api') ? currentApiUrl.slice(0, -4) : currentApiUrl;
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${baseHost}/health`, { signal: controller.signal });
      clearTimeout(id);
      if (res.ok) {
        const json = await res.json();
        const adv = json?.publicBaseUrl as string | undefined;
        if (adv && typeof adv === 'string') {
          const normalized = normalizeBase(adv);
          currentApiUrl = normalized;
          await AsyncStorage.setItem(API_OVERRIDE_KEY, normalized);
          console.log(`[API] Adopted server public base: ${currentApiUrl}`);
        }
      }
    } catch {
      // ignore network errors here
    }
  }
  overrideLoaded = true;
};

export const getApiOverride = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(API_OVERRIDE_KEY);
  } catch {
    return null;
  }
};

export const setApiOverride = async (base: string): Promise<void> => {
  const normalized = normalizeBase(base);
  await AsyncStorage.setItem(API_OVERRIDE_KEY, normalized);
  currentApiUrl = normalized;
  console.log(`[API] Override base set: ${currentApiUrl}`);
};

export const clearApiOverride = async (): Promise<void> => {
  await AsyncStorage.removeItem(API_OVERRIDE_KEY);
  // Revert to derived default
  currentApiUrl = deriveApiUrl();
  console.log('[API] Override cleared; using derived base:', currentApiUrl);
};

// Expose the live base for non-json/multipart helpers
export const getCurrentApiUrl = () => currentApiUrl;

const probeBases = async (): Promise<string | null> => {
  const candidates: string[] = [];
  // Keep current first, then emulator alias, then derived LAN, then localhost
  candidates.push(currentApiUrl);
  candidates.push('http://10.0.2.2:3001/api');
  const hostUri = (Constants as any)?.expoConfig?.hostUri || (Constants as any)?.manifest?.hostUri || '';
  const hostIp = typeof hostUri === 'string' ? hostUri.split(':')[0] : '';
  if (hostIp && /^\d+\.\d+\.\d+\.\d+$/.test(hostIp)) {
    candidates.push(`http://${hostIp}:3001/api`);
  }
  candidates.push('http://localhost:3001/api');

  for (const base of candidates) {
    try {
      const baseHost = base.endsWith('/api') ? base.slice(0, -4) : base;
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${baseHost}/health`, { signal: controller.signal });
      clearTimeout(id);
      if (res.ok) {
        console.log(`[API] Fallback selected: ${base}`);
        return base;
      }
    } catch {
      // ignore and try next
    }
  }
  return null;
};
// const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3001';


// Token management
export const getAuthToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem('authToken');
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
};

export const setAuthToken = async (token: string): Promise<void> => {
  try {
    await AsyncStorage.setItem('authToken', token);
  } catch (error) {
    console.error('Error setting auth token:', error);
  }
};

export const removeAuthToken = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem('authToken');
  } catch (error) {
    console.error('Error removing auth token:', error);
  }
};

// Base API request function with timeout and retry logic
const apiRequest = async (
  endpoint: string,
  method: string = 'GET',
  data: any = null,
  requiresAuth: boolean = true,
  timeoutMs: number = 20000, // Increased to 20 seconds
  retryCount: number = 0
) => {
  const maxRetries = 2; // Will try up to 3 times total (initial + 2 retries)
  
  try {
    // Ensure any saved override is loaded before first network call
    if (!overrideLoaded) {
      loadOverridePromise = loadOverridePromise || loadApiOverride();
      await loadOverridePromise;
      loadOverridePromise = null;
    }
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (requiresAuth) {
      const token = await getAuthToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const config: RequestInit = {
      method,
      headers,
    };

    if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      config.body = JSON.stringify(data);
    }

    // Add timeout to fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    config.signal = controller.signal;

    if (retryCount === 0) {
      console.log(`[API] ${method} ${currentApiUrl}${endpoint}`);
    } else {
      console.log(`[API] Retry ${retryCount}/${maxRetries}: ${method} ${currentApiUrl}${endpoint}`);
    }
    
    const response = await fetch(`${currentApiUrl}${endpoint}`, config);
    clearTimeout(timeoutId);
    
    const text = await response.text();
    let responseData: any = null;
    try {
      responseData = text ? JSON.parse(text) : null;
    } catch {
      responseData = { raw: text };
    }

    if (!response.ok) {
      const errMsg = (responseData && (responseData.message || responseData.error)) || 'API request failed';
      
      // Rate limit - don't retry
      if (response.status === 429) {
        const retryAfter = responseData?.retryAfter || 60;
        console.warn(`[API] Rate limited: ${endpoint} - Retry after ${retryAfter}s`);
        const error = new Error(`Too many requests. Please wait ${retryAfter} seconds.`) as any;
        error.status = 429;
        error.retryAfter = retryAfter;
        throw error;
      }
      
      // Server errors (5xx) - retry with exponential backoff
      if (response.status >= 500 && retryCount < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 5000); // Max 5s backoff
        console.warn(`[API] Server error ${response.status}, retrying after ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        return apiRequest(endpoint, method, data, requiresAuth, timeoutMs, retryCount + 1);
      }
      
      if (responseData && (responseData.errors || responseData.details)) {
        console.error(`[API Error] ${method} ${endpoint}: ${response.status} - ${errMsg}`, {
          errors: responseData.errors || responseData.details,
        });
      } else {
        console.error(`[API Error] ${method} ${endpoint}: ${response.status} - ${errMsg}`);
      }
      
      const error = new Error(errMsg) as any;
      error.status = response.status;
      error.body = responseData;
      throw error;
    }

    if (retryCount > 0) {
      console.log(`[API Success] ${method} ${endpoint} (after ${retryCount} ${retryCount === 1 ? 'retry' : 'retries'})`);
    } else {
      console.log(`[API Success] ${method} ${endpoint}`);
    }
    return responseData;
  } catch (error: any) {
    const isTimeout = error?.name === 'AbortError' || /timed out/i.test(String(error?.message || ''));
    const isNetwork = /Network request failed|Failed to fetch|TypeError/i.test(String(error?.message || ''));
    
    // Retry on timeout/network errors
    if ((isTimeout || isNetwork) && retryCount < maxRetries) {
      const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 5000);
      console.warn(`[API] ${isTimeout ? 'Timeout' : 'Network error'}, retrying after ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      
      // Try probing for better base on first retry
      if (retryCount === 0) {
        try {
          probingInProgress = probingInProgress || probeBases();
          const newBase = await probingInProgress;
          probingInProgress = null;
          if (newBase && newBase !== currentApiUrl) {
            currentApiUrl = newBase;
            console.log(`[API] Switched to new base: ${currentApiUrl}`);
          }
        } catch {
          // Continue with retry even if probing fails
        }
      }
      
      return apiRequest(endpoint, method, data, requiresAuth, timeoutMs, retryCount + 1);
    }
    
    if (error?.name === 'AbortError') {
      console.error(`[API Timeout] ${method} ${endpoint} - Request timed out after ${timeoutMs}ms`);
      throw new Error('Request timed out. Please check your internet connection and try again.');
    }
    
    // Don't log again if we already threw a formatted error
    if (!error?.status) {
      console.error(`[API Request Error] ${method} ${endpoint}:`, error);
    }
    throw error;
  }
};

// Auth API
export const authAPI = {
  login: async (idToken: string, additionalData?: { displayName?: string; photoURL?: string; phoneNumber?: string }) => {
    // Send idToken and optional profile fields to help server avoid defaulting to 'Wayfarian User'
    const payload: any = { idToken };
    if (additionalData) {
      if (additionalData.displayName) payload.displayName = additionalData.displayName;
      if (additionalData.photoURL) payload.photoURL = additionalData.photoURL;
      if (additionalData.phoneNumber) payload.phoneNumber = additionalData.phoneNumber;
    }
    return apiRequest('/auth/login', 'POST', payload, false);
  },
  
  register: async (idToken: string, userData: any) => {
    // Registration is handled same as login on server; only idToken required
    return apiRequest('/auth/register', 'POST', { idToken }, false);
  },
  
  getCurrentUser: async () => {
    return apiRequest('/auth/me', 'GET');
  },
  
  updateProfile: async (profileData: any) => {
    return apiRequest('/auth/profile', 'PUT', profileData);
  },
  
  logout: async () => {
    await removeAuthToken();
    return apiRequest('/auth/logout', 'POST');
  },

  refreshToken: async (refreshToken: string) => {
    return apiRequest('/auth/refresh', 'POST', { refreshToken }, false);
  },

  checkAvailability: async (email?: string, phoneNumber?: string) => {
    const params = new URLSearchParams();
    if (email) params.append('email', email);
    if (phoneNumber) params.append('phoneNumber', phoneNumber);
    return apiRequest(`/auth/check-availability?${params.toString()}`, 'GET', null, false);
  },
};

// User API
export const userAPI = {
  getProfile: async () => {
    return apiRequest('/user/profile', 'GET');
  },
  
  updateProfile: async (data: {
    displayName?: string;
    phoneNumber?: string;
    country?: string | null;
    countryCode?: string | null;
  }) => {
    return apiRequest('/user/profile', 'PUT', data);
  },
  
  getStats: async (timeframe: 'allTime' | 'week' | 'month' | 'year' = 'allTime') => {
    return apiRequest(`/user/stats?timeframe=${timeframe}`, 'GET');
  },
  
  getJourneyHistory: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
    vehicle?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const queryString = new URLSearchParams(params as any).toString();
    return apiRequest(`/user/journey-history?${queryString}`, 'GET');
  },
  
  getDashboard: async () => {
    const result = await apiRequest('/user/dashboard', 'GET');
    return result;
  },
  
  getAchievements: async () => {
    return apiRequest('/user/achievements', 'GET');
  },
  
  getFriends: async () => {
    const result = await apiRequest('/user/friends', 'GET');
    return result;
  },
  
  addFriend: async (friendId: string) => {
    return apiRequest('/user/friends', 'POST', { friendId });
  },
};

// Journey API
export const journeyAPI = {
  startJourney: async (journeyData: {
    startLatitude?: number;
    startLongitude?: number;
    latitude?: number;
    longitude?: number;
    vehicle?: string;
    title?: string;
    groupId?: string;
  }) => {
    // Server expects latitude/longitude, map from startLatitude/startLongitude if provided
    const lat = (journeyData.latitude ?? journeyData.startLatitude);
    const lng = (journeyData.longitude ?? journeyData.startLongitude);
    const payload: any = {
      latitude: typeof lat === 'string' ? Number(lat) : lat,
      longitude: typeof lng === 'string' ? Number(lng) : lng,
      vehicle: journeyData.vehicle,
      title: journeyData.title,
    };
    // Only include groupId if it's actually provided (exclude null/undefined for solo journeys)
    if (journeyData.groupId) {
      payload.groupId = journeyData.groupId;
    }
    return apiRequest('/journey/start', 'POST', payload);
  },
  
  updateJourney: async (journeyId: string, updateData: {
    currentLatitude?: number;
    currentLongitude?: number;
    currentSpeed?: number;
    latitude?: number;
    longitude?: number;
    speed?: number;
    timestamp?: string;
  }) => {
    // Server uses PUT /:journeyId/progress with latitude/longitude/speed
    const payload: any = {
      latitude: updateData.latitude ?? updateData.currentLatitude,
      longitude: updateData.longitude ?? updateData.currentLongitude,
      speed: updateData.speed ?? updateData.currentSpeed,
      ...(updateData.timestamp ? { timestamp: updateData.timestamp } : {}),
    };
    return apiRequest(`/journey/${journeyId}/progress`, 'PUT', payload);
  },
  
  endJourney: async (journeyId: string, endData: {
    endLatitude?: number;
    endLongitude?: number;
    latitude?: number;
    longitude?: number;
  }) => {
    // Server expects PUT with latitude/longitude
    const payload = {
      latitude: endData.latitude ?? endData.endLatitude,
      longitude: endData.longitude ?? endData.endLongitude,
    };
    return apiRequest(`/journey/${journeyId}/end`, 'PUT', payload);
  },
  
  pauseJourney: async (journeyId: string) => {
    return apiRequest(`/journey/${journeyId}/pause`, 'POST');
  },
  
  resumeJourney: async (journeyId: string) => {
    return apiRequest(`/journey/${journeyId}/resume`, 'POST');
  },

  forceClearJourney: async (journeyId: string) => {
    return apiRequest(`/journey/${journeyId}/force-clear`, 'DELETE');
  },
  
  getActiveJourney: async () => {
    return apiRequest('/journey/active', 'GET');
  },
  
  getJourney: async (journeyId: string) => {
    return apiRequest(`/journey/${journeyId}`, 'GET');
  },
  
  getJourneyHistory: async (params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) => {
    const queryString = new URLSearchParams(params as any).toString();
    return apiRequest(`/journey/history?${queryString}`, 'GET');
  },
};

// Group API
export const groupAPI = {
  createGroup: async (groupData: {
    name: string;
    description?: string;
    maxMembers?: number;
    isPrivate?: boolean;
  }) => {
    // Server expects /group/create
    return apiRequest('/group/create', 'POST', groupData);
  },
  
  joinGroup: async (code: string) => {
    return apiRequest('/group/join', 'POST', { code });
  },
  
  getGroup: async (groupId: string) => {
    return apiRequest(`/group/${groupId}`, 'GET');
  },
  
  getUserGroups: async (status: 'active' | 'all' = 'active', page?: number, limit?: number) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (page) params.append('page', String(page));
    if (limit) params.append('limit', String(limit));
    return apiRequest(`/group/my-groups?${params.toString()}`, 'GET');
  },
  
  getGroupMembers: async (groupId: string) => {
    return apiRequest(`/group/${groupId}/members`, 'GET');
  },

  uploadGroupCover: async (groupId: string, fileUri: string, filename?: string) => {
    const token = await getAuthToken();
    const url = `${getCurrentApiUrl()}/group/${groupId}/cover`;
    
    // Use fetch with FormData for compatibility with latest expo-file-system
    const formData = new FormData();
    formData.append('cover', {
      uri: fileUri,
      type: 'image/jpeg',
      name: filename || 'cover.jpg',
    } as any);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.message || 'Failed to upload cover');
    }

    return response.json();
  },
  
  updateGroupMemberLocation: async (groupId: string, locationData: {
    latitude: number;
    longitude: number;
  }) => {
    // Endpoint not provided on server; no-op fallback
    console.warn('updateGroupMemberLocation endpoint not available on server');
    return { success: false };
  },
  
  leaveGroup: async (groupId: string) => {
    // Server uses DELETE method
    return apiRequest(`/group/${groupId}/leave`, 'DELETE');
  },
};

// Leaderboard API
export const leaderboardAPI = {
  getGlobalLeaderboard: async (params?: {
    sortBy?: 'totalDistance' | 'topSpeed' | 'totalTrips' | 'totalTime';
    page?: number;
    limit?: number;
  }) => {
    const queryString = new URLSearchParams(params as any).toString();
    const result = await apiRequest(`/leaderboard/global?${queryString}`, 'GET');
    return result;
  },
  
  getGroupLeaderboard: async (groupId: string, params?: {
    sortBy?: 'totalDistance' | 'topSpeed' | 'totalTrips' | 'totalTime';
  }) => {
    const queryString = new URLSearchParams(params as any).toString();
    return apiRequest(`/leaderboard/group/${groupId}?${queryString}`, 'GET');
  },
  
  getFriendsLeaderboard: async (params?: {
    sortBy?: 'totalDistance' | 'topSpeed' | 'totalTrips' | 'totalTime';
  }) => {
    const queryString = new URLSearchParams(params as any).toString();
    return apiRequest(`/leaderboard/friends?${queryString}`, 'GET');
  },
  
  getUserPosition: async (params?: { sortBy?: 'totalDistance' | 'topSpeed' | 'totalTrips' | 'totalTime' }) => {
    const queryString = new URLSearchParams(params as any).toString();
    return apiRequest(`/leaderboard/position?${queryString}`, 'GET');
  },
};

// Gallery API
export const galleryAPI = {
  uploadPhoto: async (photoData: FormData) => {
    const token = await getAuthToken();

    const response = await fetch(`${getCurrentApiUrl()}/gallery/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: photoData,
    });
    
    return response.json();
  },
  
  getJourneyPhotos: async (journeyId: string) => {
    return apiRequest(`/gallery/journey/${journeyId}`, 'GET');
  },
  
  getUserPhotos: async (params?: {
    page?: number;
    limit?: number;
  }) => {
    const queryString = new URLSearchParams(params as any).toString();
    return apiRequest(`/gallery/photos?${queryString}`, 'GET');
  },
  
  deletePhoto: async (photoId: string) => {
    return apiRequest(`/gallery/photo/${photoId}`, 'DELETE');
  },
};

// Map/Places API (uses external APIs but through our backend)
export const placesAPI = {
  searchNearby: async (params: {
    latitude: number;
    longitude: number;
    type: string;
    radius?: number;
  }) => {
    const queryString = new URLSearchParams(params as any).toString();
    // Server exposes /api/maps/nearby-places
    return apiRequest(`/maps/nearby-places?${queryString}`, 'GET');
  },
  geocode: async (address: string) => {
    const params = new URLSearchParams({ address });
    return apiRequest(`/maps/geocode?${params.toString()}`, 'GET');
  },
  autocomplete: async (params: { input: string; latitude?: number; longitude?: number; radius?: number }) => {
    const query = new URLSearchParams(params as any).toString();
    return apiRequest(`/maps/autocomplete?${query}`, 'GET');
  },
  placeDetails: async (placeId: string) => {
    return apiRequest(`/maps/place-details/${placeId}`, 'GET');
  },
};

// Export wrapper with options object for custom API calls (modern API)
export const apiRequestWithOptions = async (
  endpoint: string,
  options?: {
    method?: string;
    body?: string;
    requiresAuth?: boolean;
    timeoutMs?: number;
  }
) => {
  const method = options?.method || 'GET';
  const data = options?.body ? JSON.parse(options.body) : null;
  const requiresAuth = options?.requiresAuth !== false;
  const timeoutMs = options?.timeoutMs || 15000;
  return apiRequest(endpoint, method, data, requiresAuth, timeoutMs);
};

// Internal alias for calling the base function from within this module
const internalApiRequest = apiRequest;

// Export shorthand for backward compat
export { apiRequestWithOptions as apiRequest };

// Group Journey API
export const groupJourneyAPI = {
  getActiveForGroup: async (groupId: string) => {
    return internalApiRequest(`/group-journey/active/${groupId}`, 'GET');
  },
  // Return the user's most recent ACTIVE or PAUSED instance (minimal payload)
  getMyActiveInstance: async () => {
    return internalApiRequest('/group-journey/my-active-instance', 'GET');
  },
  join: async (groupJourneyId: string) => {
    return internalApiRequest(`/group-journey/${groupJourneyId}/join`, 'POST');
  },
  getDetails: async (groupJourneyId: string) => {
    return internalApiRequest(`/group-journey/${groupJourneyId}`, 'GET');
  },
  pauseInstance: async (instanceId: string) => {
    return internalApiRequest(`/group-journey/instance/${instanceId}/pause`, 'POST');
  },
  resumeInstance: async (instanceId: string) => {
    return internalApiRequest(`/group-journey/instance/${instanceId}/resume`, 'POST');
  },
  completeInstance: async (instanceId: string, coords?: { endLatitude?: number; endLongitude?: number }) => {
    return internalApiRequest(`/group-journey/instance/${instanceId}/complete`, 'POST', coords || {});
  },
  listEvents: async (groupJourneyId: string, params?: { since?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.since) qs.append('since', params.since);
    if (params?.limit) qs.append('limit', String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return internalApiRequest(`/group-journey/${groupJourneyId}/events${suffix}`, 'GET');
  },
};

export default {
  auth: authAPI,
  user: userAPI,
  journey: journeyAPI,
  group: groupAPI,
  groupJourney: groupJourneyAPI,
  leaderboard: leaderboardAPI,
  gallery: galleryAPI,
  places: placesAPI,
  getAuthToken,
  setAuthToken,
  removeAuthToken,
  getCurrentApiUrl,
  getApiOverride,
  setApiOverride,
  clearApiOverride,
};
