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
