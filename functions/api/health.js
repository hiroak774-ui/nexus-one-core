export async function onRequestGet({ env }) {
  try {
    const result = await env.DB.prepare('SELECT 1 AS ok').first();
    return Response.json({
      ok: true,
      db: result?.ok === 1 ? 'connected' : 'unknown',
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
