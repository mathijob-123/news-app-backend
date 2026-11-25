import { pool } from '../config/db.js';
import { INITIAL_APP_SETTINGS } from '../data/mockData.js';
import type { AppSettings } from '../types.js';
import { validateEmailAddress } from './emailService.js';

const SUPABASE_REST_URL =
  process.env.SUPABASE_REST_URL ||
  `${(process.env.SUPABASE_URL || 'https://xylbmwffyaoojnvrjmlx.supabase.co').replace(/\/+$/, '')}/rest/v1`;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5bGJtd2ZmeWFvb2pudnJqbWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3MTk4MzYsImV4cCI6MjExMDI5NTgzNn0._hBoUkJRX9y84qa9lPnFNFDx5OzidF5hKQ0c3Rft_BQ';

let memSettingsCache: AppSettings = { ...INITIAL_APP_SETTINGS };

async function restSettingsRequest(endpoint: string, options: any = {}): Promise<any> {
  const res = await fetch(`${SUPABASE_REST_URL}/${endpoint}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase REST Settings Error (${res.status}): ${errText}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

function mergeWithDefaults(partial: Partial<AppSettings> | null | undefined): AppSettings {
  if (!partial) return { ...INITIAL_APP_SETTINGS, ...memSettingsCache };
  return {
    ...INITIAL_APP_SETTINGS,
    ...memSettingsCache,
    ...partial,
    branding: {
      ...INITIAL_APP_SETTINGS.branding,
      ...(memSettingsCache.branding || {}),
      ...(partial.branding || {})
    },
    notifications: {
      ...INITIAL_APP_SETTINGS.notifications,
      ...(memSettingsCache.notifications || {}),
      ...(partial.notifications || {})
    },
    advertisements: {
      ...INITIAL_APP_SETTINGS.advertisements,
      ...(memSettingsCache.advertisements || {}),
      ...(partial.advertisements || {})
    },
    socialImport: {
      ...INITIAL_APP_SETTINGS.socialImport,
      ...(memSettingsCache.socialImport || {}),
      ...(partial.socialImport || {})
    },
    api: {
      ...INITIAL_APP_SETTINGS.api,
      ...(memSettingsCache.api || {}),
      ...(partial.api || {})
    }
  };
}

export async function getGlobalAppSettings(): Promise<{
  settings: AppSettings;
  source: 'supabase_rest' | 'supabase_postgres' | 'in_memory';
}> {
  try {
    const rows = await restSettingsRequest("app_settings?key=eq.global_settings&select=value&limit=1");
    if (Array.isArray(rows) && rows.length > 0 && rows[0]?.value) {
      memSettingsCache = mergeWithDefaults(rows[0].value);
      return { settings: memSettingsCache, source: 'supabase_rest' };
    }
  } catch (restErr: any) {
    console.warn('[Settings Service REST read warning]:', restErr?.message || restErr);
  }

  if (process.env.DATABASE_URL) {
    try {
      const result = await pool.query("SELECT value FROM app_settings WHERE key = 'global_settings' LIMIT 1");
      if (result.rows.length > 0 && result.rows[0]?.value) {
        memSettingsCache = mergeWithDefaults(result.rows[0].value);
        return { settings: memSettingsCache, source: 'supabase_postgres' };
      }
    } catch (poolErr: any) {
      console.warn('[Settings Service Pool read warning]:', poolErr?.message || poolErr);
    }
  }

  memSettingsCache = mergeWithDefaults(memSettingsCache);
  return { settings: memSettingsCache, source: 'in_memory' };
}

export async function saveGlobalAppSettings(updates: Partial<AppSettings>): Promise<{
  settings: AppSettings;
  source: 'supabase_rest' | 'supabase_postgres' | 'in_memory';
}> {
  const { settings: current } = await getGlobalAppSettings();
  const merged = mergeWithDefaults({
    ...current,
    ...updates,
    branding: updates.branding ? { ...current.branding, ...updates.branding } : current.branding,
    notifications: updates.notifications
      ? { ...current.notifications, ...updates.notifications }
      : current.notifications,
    advertisements: updates.advertisements
      ? { ...current.advertisements, ...updates.advertisements }
      : current.advertisements,
    socialImport: updates.socialImport
      ? { ...current.socialImport, ...updates.socialImport }
      : current.socialImport,
    api: updates.api ? { ...current.api, ...updates.api } : current.api
  });
  memSettingsCache = merged;

  const nowIso = new Date().toISOString();
  let persistedRest = false;

  try {
    await restSettingsRequest('app_settings?on_conflict=key', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation'
      },
      body: JSON.stringify({
        key: 'global_settings',
        value: merged,
        updated_at: nowIso
      })
    });
    persistedRest = true;
  } catch (restErr: any) {
    console.warn('[Settings Service REST write warning]:', restErr?.message || restErr);
  }

  let persistedPool = false;
  if (process.env.DATABASE_URL) {
    try {
      await pool.query(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('global_settings', $1, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(merged)]
      );
      persistedPool = true;
    } catch (poolErr: any) {
      console.warn('[Settings Service Pool write warning]:', poolErr?.message || poolErr);
    }
  }

  return {
    settings: merged,
    source: persistedRest ? 'supabase_rest' : persistedPool ? 'supabase_postgres' : 'in_memory'
  };
}

export async function getNotificationRecipientConfig(): Promise<{
  adminRecipientEmail: string;
  adminRecipientValid: boolean;
  adminNewUserEmailAlerts: boolean;
  userEmailNotificationsEnabled: boolean;
}> {
  const { settings } = await getGlobalAppSettings();
  const rawConfigured =
    settings.notifications?.notificationRecipientEmail ||
    process.env.NOTIFICATION_RECIPIENT_EMAIL ||
    process.env.ADMIN_EMAIL ||
    'jrinfotechponneri@gmail.com';

  const check = validateEmailAddress(rawConfigured);
  return {
    adminRecipientEmail: check.email || rawConfigured.trim(),
    adminRecipientValid: check.valid,
    adminNewUserEmailAlerts: settings.notifications?.adminNewUserEmailAlerts !== false,
    userEmailNotificationsEnabled: settings.notifications?.userEmailNotificationsEnabled !== false
  };
}
