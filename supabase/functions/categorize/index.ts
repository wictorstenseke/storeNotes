import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  buildPrompt,
  categorize,
  checkRequest,
  parseModelContent,
  RESPONSE_SCHEMA,
} from './core.ts';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

async function askOpenRouter(texts: string[]): Promise<unknown> {
  const { system, user } = buildPrompt(texts);
  const call = (withSchema: boolean) =>
    fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENROUTER_MODEL') ?? DEFAULT_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(withSchema
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: { name: 'categories', strict: true, schema: RESPONSE_SCHEMA },
              },
            }
          : {}),
      }),
    });

  // Not every model route accepts a response schema. The reply is validated
  // in core.ts either way, so fall back to asking without one.
  let response = await call(true);
  if (response.status === 400 || response.status === 404) response = await call(false);
  if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
  const data = await response.json();
  return parseModelContent(data?.choices?.[0]?.message?.content);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (!userData?.user) return json({ error: 'Not signed in' }, 401);

  const body = await req.json().catch(() => null);
  const check = checkRequest(body, userData.user.email, Deno.env.get('ALLOWED_EMAILS') ?? '');
  if (!check.ok) return json({ error: check.message }, check.status);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const categories = await categorize(check.texts, {
      async getCached(keys) {
        const { data, error } = await admin
          .from('category_cache')
          .select('text_key, category')
          .in('text_key', keys);
        if (error) throw error;
        return Object.fromEntries((data ?? []).map((row) => [row.text_key, row.category]));
      },
      async putCached(rows) {
        await admin.from('category_cache').upsert(rows, { onConflict: 'text_key' });
      },
      askModel: askOpenRouter,
    });
    return json({ categories });
  } catch (error) {
    console.error(error);
    return json({ error: 'Categorisation failed' }, 502);
  }
});
