// app/services/offlineQueueService.ts
// Offline queue for resilient API updates during network disruptions

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

const QUEUE_STORAGE_KEY = 'offlineApiQueue';
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;

// Queued request structure
interface QueuedRequest {
    id: string;
    timestamp: number;
    endpoint: string;
    method: string;
    body: any;
    retryCount: number;
    priority: 'high' | 'normal' | 'low';
}

// Queue state
let isProcessing = false;
let isOnline = true;
let networkUnsubscribe: (() => void) | null = null;

// Generate unique ID
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Load queue from storage
async function loadQueue(): Promise<QueuedRequest[]> {
    try {
        const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (e) {
        console.warn('[OfflineQueue] Failed to load queue:', e);
        return [];
    }
}

// Save queue to storage
async function saveQueue(queue: QueuedRequest[]): Promise<void> {
    try {
        await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
        console.warn('[OfflineQueue] Failed to save queue:', e);
    }
}

// Add request to queue
export async function queueRequest(
    endpoint: string,
    method: string,
    body: any,
    priority: 'high' | 'normal' | 'low' = 'normal'
): Promise<string> {
    const request: QueuedRequest = {
        id: generateId(),
        timestamp: Date.now(),
        endpoint,
        method,
        body,
        retryCount: 0,
        priority,
    };

    const queue = await loadQueue();
    queue.push(request);
    await saveQueue(queue);

    console.log(`[OfflineQueue] Queued request: ${method} ${endpoint}`);

    // Try to process immediately if online
    if (isOnline && !isProcessing) {
        processQueue();
    }

    return request.id;
}

// Process queued requests
async function processQueue(): Promise<void> {
    if (isProcessing || !isOnline) return;

    isProcessing = true;
    console.log('[OfflineQueue] Processing queue...');

    try {
        let queue = await loadQueue();
        if (queue.length === 0) {
            isProcessing = false;
            return;
        }

        // Sort by priority and timestamp
        queue.sort((a, b) => {
            const priorityOrder = { high: 0, normal: 1, low: 2 };
            if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            }
            return a.timestamp - b.timestamp;
        });

        const processedIds: string[] = [];
        const failedRequests: QueuedRequest[] = [];

        for (const request of queue) {
            // Check if still online before each request
            if (!isOnline) {
                console.log('[OfflineQueue] Went offline, pausing...');
                break;
            }

            try {
                const token = await AsyncStorage.getItem('authToken');
                const headers: Record<string, string> = {
                    'Content-Type': 'application/json',
                };
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }

                const response = await fetch(request.endpoint, {
                    method: request.method,
                    headers,
                    body: request.body ? JSON.stringify(request.body) : undefined,
                });

                if (response.ok) {
                    processedIds.push(request.id);
                    console.log(`[OfflineQueue] Processed: ${request.method} ${request.endpoint}`);
                } else if (response.status >= 500) {
                    // Server error - retry later
                    request.retryCount++;
                    if (request.retryCount < MAX_RETRIES) {
                        failedRequests.push(request);
                        console.warn(`[OfflineQueue] Retry ${request.retryCount}/${MAX_RETRIES}: ${request.endpoint}`);
                    } else {
                        processedIds.push(request.id);
                        console.error(`[OfflineQueue] Max retries reached, discarding: ${request.endpoint}`);
                    }
                } else {
                    // Client error (4xx) - don't retry, discard
                    processedIds.push(request.id);
                    console.warn(`[OfflineQueue] Client error ${response.status}, discarding: ${request.endpoint}`);
                }
            } catch (e) {
                // Network error - retry
                request.retryCount++;
                if (request.retryCount < MAX_RETRIES) {
                    failedRequests.push(request);
                    console.warn(`[OfflineQueue] Network error, will retry: ${request.endpoint}`);
                } else {
                    processedIds.push(request.id);
                    console.error(`[OfflineQueue] Max retries reached after network errors: ${request.endpoint}`);
                }

                // Assume we're offline if fetch fails
                const netState = await NetInfo.fetch();
                if (!netState.isConnected) {
                    isOnline = false;
                    break;
                }
            }

            // Small delay between requests to avoid overwhelming server
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Update queue: remove processed, keep failed for retry
        queue = queue.filter(r => !processedIds.includes(r.id));
        // Update retry counts for failed requests
        for (const failed of failedRequests) {
            const idx = queue.findIndex(r => r.id === failed.id);
            if (idx >= 0) {
                queue[idx] = failed;
            }
        }
        await saveQueue(queue);

        console.log(`[OfflineQueue] Complete. Remaining: ${queue.length}`);
    } catch (e) {
        console.error('[OfflineQueue] Error processing queue:', e);
    } finally {
        isProcessing = false;
    }
}

// Handle network state changes
function handleNetworkChange(state: NetInfoState): void {
    const wasOnline = isOnline;
    isOnline = state.isConnected ?? false;

    console.log(`[OfflineQueue] Network: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

    // Just came back online - process queue
    if (!wasOnline && isOnline) {
        console.log('[OfflineQueue] Network recovered, syncing...');
        // Add small delay to let connection stabilize
        setTimeout(() => processQueue(), 1000);
    }
}

// Initialize network monitoring
export function initializeOfflineQueue(): void {
    // Get initial network state
    NetInfo.fetch().then(state => {
        isOnline = state.isConnected ?? true;
        console.log(`[OfflineQueue] Initial network: ${isOnline ? 'ONLINE' : 'OFFLINE'}`);

        // Process any existing queued requests
        if (isOnline) {
            processQueue();
        }
    });

    // Subscribe to network changes
    networkUnsubscribe = NetInfo.addEventListener(handleNetworkChange);
}

// Cleanup
export function destroyOfflineQueue(): void {
    if (networkUnsubscribe) {
        networkUnsubscribe();
        networkUnsubscribe = null;
    }
}

// Get queue status
export async function getQueueStatus(): Promise<{ count: number; isOnline: boolean; isProcessing: boolean }> {
    const queue = await loadQueue();
    return {
        count: queue.length,
        isOnline,
        isProcessing,
    };
}

// Check if online
export function isNetworkOnline(): boolean {
    return isOnline;
}

// Force process queue (for manual retry)
export function forceProcessQueue(): void {
    if (!isProcessing) {
        processQueue();
    }
}

// Export service
const OfflineQueueService = {
    initialize: initializeOfflineQueue,
    destroy: destroyOfflineQueue,
    queueRequest,
    getStatus: getQueueStatus,
    isOnline: isNetworkOnline,
    forceProcess: forceProcessQueue,
};

export default OfflineQueueService;
