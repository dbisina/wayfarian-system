/**
 * Thin wrapper around Ionicons that exposes a platform-neutral `IconSymbol`
 * API. Keeping icon usage behind this abstraction makes it easy to swap the
 * underlying library (e.g. SF Symbols on iOS via expo-symbols) without
 * touching every call site.
 *
 * @prop name  - Ionicons icon name.
 * @prop size  - Icon size in dp (default 24).
 * @prop color - Icon colour (default '#000').
 */

import { Ionicons } from '@expo/vector-icons';
import { ComponentProps } from 'react';

export function IconSymbol({
  name,
  size = 24,
  color = '#000',
  ...props
}: ComponentProps<typeof Ionicons>) {
  return <Ionicons name={name as any} size={size} color={color} {...props} />;
}
