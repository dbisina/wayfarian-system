// app/services/api.ts
// Central API service for all backend communication

import AsyncStorage from '@react-native-async-storage/async-storage';

// Default to server's actual default port (5001) if env is not set
const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:5001/api';
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

// Base API request function
const apiRequest = async (
  endpoint: string,
  method: string = 'GET',
  data: any = null,
  requiresAuth: boolean = true
) => {
  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
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

    const response = await fetch(`${API_URL}${endpoint}`, config);
    const responseData = await response.json();

    if (!response.ok) {
      throw new Error(responseData.message || 'API request failed');
    }

    return responseData;
  } catch (error) {
    console.warn('API Request Error:', error);
    return null;
  }
};

// Auth API
export const authAPI = {
  login: async (idToken: string, additionalData?: any) => {
    return apiRequest('/auth/login', 'POST', { idToken, ...additionalData }, false);
  },
  
  register: async (idToken: string, userData: any) => {
    return apiRequest('/auth/register', 'POST', { idToken, ...userData }, false);
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
    const payload: any = {
      latitude: journeyData.latitude ?? journeyData.startLatitude,
      longitude: journeyData.longitude ?? journeyData.startLongitude,
      vehicle: journeyData.vehicle,
      title: journeyData.title,
      groupId: journeyData.groupId,
    };
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
    
    const response = await fetch(`${API_URL}/gallery/upload`, {
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

export default {
  auth: authAPI,
  user: userAPI,
  journey: journeyAPI,
  group: groupAPI,
  leaderboard: leaderboardAPI,
  gallery: galleryAPI,
  places: placesAPI,
  getAuthToken,
  setAuthToken,
  removeAuthToken,
};