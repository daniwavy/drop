export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const auth = req.headers.get('authorization') || '';
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (!projectId) return new Response(JSON.stringify({ ok: false, message: 'server-missing-config' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    const url = `https://us-central1-${projectId}.cloudfunctions.net/enterDropCors`;

    const fetchRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });

    const text = await fetchRes.text();
    // forward status and body
    return new Response(text, { status: fetchRes.status, headers: { 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, message: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
