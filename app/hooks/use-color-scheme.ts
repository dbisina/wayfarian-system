/**
 * Re-exports `useColorScheme` from react-native for consistent import paths
 * across the codebase. Keeping it here lets us swap the underlying hook
 * (e.g. for a custom provider) without touching every consumer.
 */
export { useColorScheme } from 'react-native';
