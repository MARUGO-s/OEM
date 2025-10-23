import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

type PushSubscriptionRow = {
  id: string;
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type NotificationPayload = {
  title?: string;
  body?: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  vibration?: number[];
  data?: Record<string, unknown>;
};

type EdgeRequestBody = {
  notification?: NotificationPayload;
  targetUserIds?: string[];
  skipUserId?: string | null;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:notifications@example.com';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing Supabase environment variables');
}

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  throw new Error('Missing VAPID keys');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const defaultHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: defaultHeaders,
  });
}

type DeliveryResult = {
  endpoint: string;
  status: 'sent' | 'skipped' | 'error';
  statusCode?: number;
  message?: string;
};

async function fetchSubscriptions(targetUserIds?: string[], skipUserId?: string | null) {
  let query = supabase.from('push_subscriptions').select('*');

  if (targetUserIds && targetUserIds.length > 0) {
    query = query.in('user_id', targetUserIds);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to load push subscriptions: ${error.message}`);
  }

  const subscriptions = (data || []) as PushSubscriptionRow[];

  if (skipUserId) {
    return subscriptions.filter((subscription) => subscription.user_id !== skipUserId);
  }

  return subscriptions;
}

async function sendPushToSubscription(
  subscription: PushSubscriptionRow,
  notification: NotificationPayload,
): Promise<DeliveryResult> {
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      auth: subscription.auth,
      p256dh: subscription.p256dh,
    },
  };

  const payload = JSON.stringify(notification);

  try {
    await webpush.sendNotification(pushSubscription, payload);

    await supabase
      .from('push_subscriptions')
      .update({
        last_notified_at: new Date().toISOString(),
        last_error: null,
        last_error_at: null,
      })
      .eq('id', subscription.id);

    return { endpoint: subscription.endpoint, status: 'sent' };
  } catch (error) {
    const statusCode: number | undefined = (error as { statusCode?: number }).statusCode;
    const message = (error as Error).message;

    if (statusCode === 404 || statusCode === 410) {
      await supabase.from('push_subscriptions').delete().eq('id', subscription.id);
    } else {
      await supabase
        .from('push_subscriptions')
        .update({
          last_error: message,
          last_error_at: new Date().toISOString(),
        })
        .eq('id', subscription.id);
    }

    return {
      endpoint: subscription.endpoint,
      status: 'error',
      statusCode,
      message,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: defaultHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: EdgeRequestBody;

  try {
    body = await req.json();
  } catch (_error) {
    return jsonResponse({ error: 'Invalid JSON payload' }, 400);
  }

  if (!body.notification) {
    return jsonResponse({ error: 'notification payload is required' }, 400);
  }

  const notification: NotificationPayload = {
    title: body.notification.title ?? 'MARUGO OEM Special Menu',
    body: body.notification.body ?? '新しい通知があります',
    icon: body.notification.icon ?? '/OEM/icon-192.svg',
    badge: body.notification.badge ?? '/OEM/icon-192.svg',
    url: body.notification.url ?? '/OEM/',
    tag: body.notification.tag ?? 'oem-notification',
    vibration: body.notification.vibration ?? [200, 100, 200],
    data: body.notification.data ?? {},
  };

  try {
    const subscriptions = await fetchSubscriptions(body.targetUserIds, body.skipUserId ?? null);

    if (subscriptions.length === 0) {
      return jsonResponse({ delivered: 0, failed: 0, results: [] });
    }

    const results: DeliveryResult[] = [];

    for (const subscription of subscriptions) {
      const result = await sendPushToSubscription(subscription, notification);
      results.push(result);
    }

    const delivered = results.filter((result) => result.status === 'sent').length;
    const failed = results.filter((result) => result.status === 'error').length;

    return jsonResponse({ delivered, failed, results });
  } catch (error) {
    console.error('Push delivery failed:', error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
