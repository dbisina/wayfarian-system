import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './index';

/**
 * Pre-typed `useDispatch` bound to `AppDispatch`.
 * Use this everywhere instead of the plain hook so thunk types flow through.
 */
export const useAppDispatch = () => useDispatch<AppDispatch>();

/**
 * Pre-typed `useSelector` bound to `RootState`.
 * Use this everywhere instead of the plain hook for full type inference on state selectors.
 */
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
