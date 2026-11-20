import { localBackend } from './local';
import { createSupabaseBackend } from './supabase';
import type { Backend } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Supabase when VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set (see .env.example),
 * otherwise the device-only demo backend.
 */
export const backend: Backend = url && anonKey ? createSupabaseBackend(url, anonKey) : localBackend;

export * from './types';
