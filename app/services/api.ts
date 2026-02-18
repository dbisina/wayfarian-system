// app/services/api.ts
// Central API service for all backend communication

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getAuth } from 'firebase/auth';

const DEFAULT_API_URL = 'https://wayfarian-system-production.up.railway.app/api';
const TOKEN_STORAGE_KEY = 'authToken';

// Track if a token refresh is in progress to prevent multiple simultaneous refreshes
let tokenRefreshPromise: Promise<string | null> | null = null;

export type ApiRequestOptions = {
  method?: string;
  body?: any;
  requiresAuth?: boolean;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

const resolveBaseUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) {
    return envUrl;
  }
  console.warn('[API] EXPO_PUBLIC_API_URL is not set; falling back to production default');
  return DEFAULT_API_URL;
};

export const API_URL = resolveBaseUrl();
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

const currentApiUrl = API_URL;
// const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL || 'http://localhost:3001';

export const getCurrentApiUrl = (): string => currentApiUrl;


// Token management
const secureStoreAvailable = Boolean(SecureStore?.setItemAsync);

// Memory cache for token to avoid async delay on every request
// and to allow synchronous "set + update UI" flows without race conditions
let cachedToken: string | null = null;

const secureGetItem = async (key: string): Promise<string | null> => {
  if (secureStoreAvailable) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.warn('[SecureStore] getItem failed, falling back to AsyncStorage', error);
    }
  }
  return AsyncStorage.getItem(key);
};

const secureSetItem = async (key: string, value: string): Promise<void> => {
  if (secureStoreAvailable) {
    try {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      return;
    } catch (error) {
      console.warn('[SecureStore] setItem failed, falling back to AsyncStorage', error);
    }
  }
  await AsyncStorage.setItem(key, value);
};

const secureRemoveItem = async (key: string): Promise<void> => {
  if (secureStoreAvailable) {
    try {
      await SecureStore.deleteItemAsync(key);
      return;
    } catch (error) {
      console.warn('[SecureStore] deleteItem failed, falling back to AsyncStorage', error);
    }
  }
  await AsyncStorage.removeItem(key);
};

export const getAuthToken = async (): Promise<string | null> => {
  // Return cached token if available
  if (cachedToken) {
    return cachedToken;
  }

  try {
    const token = await secureGetItem(TOKEN_STORAGE_KEY);
    // Update cache
    if (token) {
      cachedToken = token;
    }
    return token;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
};

export const setAuthToken = async (token: string): Promise<void> => {
  // Update cache immediately
  cachedToken = token;

  try {
    await secureSetItem(TOKEN_STORAGE_KEY, token);
  } catch (error) {
    console.error('Error setting auth token:', error);
  }
};

export const removeAuthToken = async (): Promise<void> => {
  // Clear cache immediately
  cachedToken = null;

  try {
    await secureRemoveItem(TOKEN_STORAGE_KEY);
  } catch (error) {
    console.error('Error removing auth token:', error);
  }
};

// FIX: Add token refresh function for 401 handling
// This refreshes the Firebase ID token and updates storage
const refreshAuthToken = async (): Promise<string | null> => {
  // If a refresh is already in progress, wait for it instead of starting another
  if (tokenRefreshPromise) {
    console.log('[API] Token refresh already in progress, waiting...');
    return tokenRefreshPromise;
  }

  tokenRefreshPromise = (async () => {
    try {
      const auth = getAuth();
      const currentUser = auth.currentUser;

      if (!currentUser) {
        console.warn('[API] No Firebase user for token refresh');
        return null;
      }

      console.log('[API] Refreshing Firebase token...');
      // Force refresh the token
      const newToken = await currentUser.getIdToken(true);

      if (newToken) {
        await setAuthToken(newToken);
        console.log('[API] Token refreshed successfully');
        return newToken;
      }

      return null;
    } catch (error) {
      console.error('[API] Token refresh failed:', error);
      return null;
    } finally {
      tokenRefreshPromise = null;
    }
  })();

  return tokenRefreshPromise;
};

// Base API request function with timeout and retry logic
export const apiRequest = async (
  endpoint: string,
  methodOrOptions: string | ApiRequestOptions = 'GET',
  data: any = null,
  requiresAuthDefault: boolean = true,
  timeoutMsDefault: number = 10000, // Reduced to 10 seconds for faster feedback
  retryCount: number = 0
): Promise<any> => {
  const maxRetries = 2; // Will try up to 3 times total (initial + 2 retries)

  const isOptionsObject = typeof methodOrOptions === 'object' && methodOrOptions !== null;
  const options = isOptionsObject ? (methodOrOptions as ApiRequestOptions) : undefined;

  const method = isOptionsObject ? options?.method ?? 'GET' : (methodOrOptions as string) ?? 'GET';
  const requiresAuth = isOptionsObject ? options?.requiresAuth ?? true : requiresAuthDefault;
  const timeoutMs = isOptionsObject ? options?.timeoutMs ?? timeoutMsDefault : timeoutMsDefault;
  const headersOverride = options?.headers;
  const payload = isOptionsObject ? options?.body : data;

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(headersOverride ?? {}),
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

    const shouldAttachBody = payload !== undefined && payload !== null && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE');

    if (shouldAttachBody) {
      if (payload instanceof FormData) {
        config.body = payload;
        delete (config.headers as Record<string, string>)['Content-Type'];
      } else if (typeof payload === 'string') {
        config.body = payload;
      } else {
        config.body = JSON.stringify(payload);
      }
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

      if (response.status === 429) {
        const retryAfter = responseData?.retryAfter || 60;
        console.warn(`[API] Rate limited: ${endpoint} - Retry after ${retryAfter}s`);
        const error = new Error(`Too many requests. Please wait ${retryAfter} seconds.`) as any;
        error.status = 429;
        error.retryAfter = retryAfter;
        throw error;
      }

      // FIX: Handle 401 Unauthorized - attempt token refresh and retry once
      if (response.status === 401 && requiresAuth && retryCount === 0) {
        console.log(`[API] 401 Unauthorized on ${endpoint}, attempting token refresh...`);
        const newToken = await refreshAuthToken();

        if (newToken) {
          console.log(`[API] Token refreshed, retrying ${endpoint}...`);
          // Retry the request with the new token (increment retryCount to prevent infinite loop)
          return apiRequest(endpoint, methodOrOptions, data, requiresAuthDefault, timeoutMsDefault, retryCount + 1);
        } else {
          // Token refresh failed - likely user needs to re-login
          console.error(`[API] Token refresh failed for ${endpoint}, user may need to re-authenticate`);
          const error = new Error('Session expired. Please sign in again.') as any;
          error.status = 401;
          error.requiresReauth = true;
          throw error;
        }
      }

      if (response.status >= 500 && retryCount < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 5000); // Max 5s backoff
        console.warn(`[API] Server error ${response.status}, retrying after ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        // Preserve original options format in retry to avoid losing payload
        return apiRequest(endpoint, methodOrOptions, data, requiresAuthDefault, timeoutMsDefault, retryCount + 1);
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

    if ((isTimeout || isNetwork) && retryCount < maxRetries) {
      const backoffMs = Math.min(1000 * Math.pow(2, retryCount), 5000);
      console.warn(`[API] ${isTimeout ? 'Timeout' : 'Network error'}, retrying after ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      // Preserve original options format in retry to avoid losing payload
      return apiRequest(endpoint, methodOrOptions, data, requiresAuthDefault, timeoutMsDefault, retryCount + 1);
    }

    if (error?.name === 'AbortError') {
      console.error(`[API Timeout] ${method} ${endpoint} - Request timed out after ${timeoutMs}ms`);
      throw new Error('Request timed out. Please check your internet connection and try again.');
    }

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

  deleteAccount: async () => {
    return apiRequest('/auth/account', 'DELETE', { confirmDelete: true });
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
    includeHidden?: boolean;
  }) => {
    const queryString = new URLSearchParams(params as any).toString();
    return apiRequest(`/user/journey-history?${queryString}`, 'GET');
  },

  getDashboard: async () => {
    const result = await apiRequest('/user/dashboard', 'GET');
    return result;
  },

  getDashboardStats: async () => {
    return apiRequest('/user/dashboard-stats', 'GET');
  },

  getAchievements: async () => {
    return apiRequest('/user/achievements', 'GET');
  },

  getStreak: async () => {
    return apiRequest('/user/streak', 'GET');
  },

  getUnlockedAchievements: async () => {
    return apiRequest('/user/unlocked-achievements', 'GET');
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
  createJourney: async (journeyData: {
    startLatitude?: number;
    startLongitude?: number;
    latitude?: number;
    longitude?: number;
    vehicle?: string;
    title?: string;
    groupId?: string;
    status?: 'ACTIVE' | 'PLANNED';
    startTime?: string;
    endLatitude?: number;
    endLongitude?: number;
    notes?: string;
  }) => {
    const lat = (journeyData.latitude ?? journeyData.startLatitude);
    const lng = (journeyData.longitude ?? journeyData.startLongitude);
    const payload: any = {
      latitude: typeof lat === 'string' ? Number(lat) : lat,
      longitude: typeof lng === 'string' ? Number(lng) : lng,
      vehicle: journeyData.vehicle,
      title: journeyData.title,
      status: journeyData.status,
      startTime: journeyData.startTime,
      endLatitude: journeyData.endLatitude,
      endLongitude: journeyData.endLongitude,
      notes: journeyData.notes,
    };
    if (journeyData.groupId) {
      payload.groupId = journeyData.groupId;
    }
    return apiRequest('/journey/create', 'POST', payload);
  },

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

    try {
      return await apiRequest(`/journey/${journeyId}/progress`, 'PUT', payload);
    } catch (error: any) {
      // If network error, queue for later - don't let it stop tracking
      if (error.message?.includes('Network') || error.message?.includes('fetch')) {
        console.log('[journeyAPI] Network error, queuing update for later');
        const { queueRequest } = await import('./offlineQueueService');
        const endpoint = `${getCurrentApiUrl()}/journey/${journeyId}/progress`;
        await queueRequest(endpoint, 'PUT', payload, 'normal');
        // Return success-like response so tracking continues
        return { queued: true, message: 'Update queued for sync' };
      }
      throw error;
    }
  },

  endJourney: async (journeyId: string, endData: {
    endLatitude?: number;
    endLongitude?: number;
    latitude?: number;
    longitude?: number;
    totalDistance?: number; // Roads API snapped distance in kilometers
    totalTime?: number; // Client-calculated total time in seconds
  }) => {
    // Server expects PUT with latitude/longitude and optionally totalDistance/totalTime
    const payload: any = {
      latitude: endData.latitude ?? endData.endLatitude,
      longitude: endData.longitude ?? endData.endLongitude,
    };
    // Include totalDistance if provided (from Roads API snapped data)
    if (endData.totalDistance !== undefined) {
      payload.totalDistance = endData.totalDistance;
    }
    // Include totalTime if provided (for accurate time tracking)
    if (endData.totalTime !== undefined) {
      payload.totalTime = endData.totalTime;
    }
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

  updateJourneyPreferences: async (journeyId: string, prefs: { customTitle?: string | null; isHidden?: boolean }) => {
    return apiRequest(`/journey/${journeyId}/preferences`, 'PATCH', prefs);
  },

  restoreHiddenJourneys: async () => {
    return apiRequest('/journey/restore-hidden', 'POST');
  },

  clearCustomJourneyTitles: async () => {
    return apiRequest('/journey/clear-custom-titles', 'POST');
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

  deleteJourney: async (journeyId: string) => {
    return apiRequest(`/journey/${journeyId}`, 'DELETE');
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

    // Determine file type and name
    const name = filename || fileUri.split('/').pop() || 'cover.jpg';
    const match = /\.(\w+)$/.exec(name);
    const type = match ? `image/${match[1] === 'jpg' ? 'jpeg' : match[1]}` : 'image/jpeg';

    // Use fetch with FormData for compatibility with latest expo-file-system
    const formData = new FormData();
    formData.append('cover', {
      uri: fileUri,
      type,
      name,
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

  updateGroup: async (groupId: string, data: {
    name?: string;
    description?: string;
    maxMembers?: number;
    isPrivate?: boolean;
  }) => {
    return apiRequest(`/group/${groupId}`, 'PUT', data);
  },

  deleteGroup: async (groupId: string) => {
    return apiRequest(`/group/${groupId}`, 'DELETE');
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
    // Add timestamp to bust cache and ensure fresh data
    const queryParams = { ...params, _t: Date.now() };
    const queryString = new URLSearchParams(queryParams as any).toString();
    const result = await apiRequest(`/leaderboard/global?${queryString}`, 'GET');
    return result;
  },

  getGroupLeaderboard: async (groupId: string, params?: {
    sortBy?: 'totalDistance' | 'topSpeed' | 'totalTrips' | 'totalTime';
  }) => {
    // Add timestamp to bust cache and ensure fresh data
    const queryParams = { ...params, _t: Date.now() };
    const queryString = new URLSearchParams(queryParams as any).toString();
    return apiRequest(`/leaderboard/group/${groupId}?${queryString}`, 'GET');
  },

  getFriendsLeaderboard: async (params?: {
    sortBy?: 'totalDistance' | 'topSpeed' | 'totalTrips' | 'totalTime';
  }) => {
    // Add timestamp to bust cache and ensure fresh data
    const queryParams = { ...params, _t: Date.now() };
    const queryString = new URLSearchParams(queryParams as any).toString();
    return apiRequest(`/leaderboard/friends?${queryString}`, 'GET');
  },

  getUserPosition: async (params?: { sortBy?: 'totalDistance' | 'topSpeed' | 'totalTrips' | 'totalTime' }) => {
    // Add timestamp to bust cache and ensure fresh data
    const queryParams = { ...params, _t: Date.now() };
    const queryString = new URLSearchParams(queryParams as any).toString();
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

  uploadPhotoWithProgress: async (
    photoUri: string,
    journeyId: string,
    onProgress: (progress: number) => void,
    captureStats?: { speed?: number; distance?: number }
  ) => {
    const token = await getAuthToken();
    const url = `${getCurrentApiUrl()}/gallery/upload`;

    // Use FormData with fetch instead of deprecated createUploadTask
    const formData = new FormData();
    formData.append('photo', {
      uri: photoUri,
      type: 'image/jpeg',
      name: `journey_photo_${Date.now()}.jpg`,
    } as any);
    formData.append('journeyId', journeyId);
    if (captureStats?.speed != null) {
      formData.append('speed', String(captureStats.speed));
    }
    if (captureStats?.distance != null) {
      formData.append('distance', String(captureStats.distance));
    }

    // Use XMLHttpRequest for progress tracking since fetch doesn't support it
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const progress = event.loaded / event.total;
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            resolve(response);
          } catch {
            reject(new Error('Invalid response format'));
          }
        } else {
          let errorMessage = 'Upload failed';
          try {
            const errorBody = JSON.parse(xhr.responseText || '{}');
            errorMessage = errorBody.message || errorBody.error || errorMessage;
          } catch { }
          reject(new Error(errorMessage));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload aborted'));
      });

      xhr.open('POST', url);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.send(formData as any);
    });
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

  getGroupJourneyPhotos: async (groupJourneyId: string) => {
    return apiRequest(`/gallery/group-journey/${groupJourneyId}`, 'GET');
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
    body?: any;
    requiresAuth?: boolean;
    timeoutMs?: number;
    headers?: Record<string, string>;
  }
) => {
  return apiRequest(endpoint, {
    method: options?.method,
    body: options?.body,
    requiresAuth: options?.requiresAuth,
    timeoutMs: options?.timeoutMs,
    headers: options?.headers,
  });
};

// Internal alias for calling the base function from within this module
const internalApiRequest = apiRequest;

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
  postEvent: async (
    groupJourneyId: string,
    payload: {
      type: 'MESSAGE' | 'PHOTO' | 'CHECKPOINT' | 'STATUS' | 'EMERGENCY' | 'CUSTOM';
      message?: string;
      latitude?: number;
      longitude?: number;
      mediaUrl?: string;
      data?: any;
      captureSpeed?: number;
      captureDistance?: number;
    }
  ) => {
    return internalApiRequest(`/group-journey/${groupJourneyId}/events`, 'POST', payload);
  },

  getSummary: async (groupJourneyId: string) => {
    return internalApiRequest(`/group-journey/${groupJourneyId}/summary`, 'GET');
  },

  adminEndJourney: async (groupJourneyId: string) => {
    return internalApiRequest(`/group-journey/${groupJourneyId}/end`, 'POST', {});
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
  apiRequest,
  apiRequestWithOptions,
  getAuthToken,
  setAuthToken,
  removeAuthToken,
  getCurrentApiUrl,
};
