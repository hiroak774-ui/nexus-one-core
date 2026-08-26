export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT company_id, company_name, domain, status
      FROM companies
      WHERE status = '有効'
      ORDER BY company_id
    `).all();

    return Response.json({
      ok: true,
      companies: results,
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
