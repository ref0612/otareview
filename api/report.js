/**
 * Vercel Serverless Function — /api/report
 * Actúa como proxy seguro hacia la API de KonnectPro Pullman.
 * El Bearer Token y API Key viven en variables de entorno de Vercel,
 * nunca en el código frontend.
 */

export default async function handler(req, res) {
  // Solo GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token  = process.env.PULLMAN_BEARER_TOKEN;
  const apiKey = process.env.PULLMAN_API_KEY;

  if (!token) {
    return res.status(500).json({ error: 'Token no configurado en variables de entorno de Vercel.' });
  }

  // Parámetros que vienen del frontend
  const {
    from_date, to_date,
    user_id     = '5',
    branch_user = '2:5',
  } = req.query;

  if (!from_date || !to_date) {
    return res.status(400).json({ error: 'from_date y to_date son requeridos.' });
  }

  // Validar rango máximo de 10 días
  const parseDate = s => {
    const [d, m, y] = s.split('/');
    return new Date(`${y}-${m}-${d}`);
  };
  const diffDays = (parseDate(to_date) - parseDate(from_date)) / (1000 * 60 * 60 * 24);
  if (diffDays > 10) {
    return res.status(400).json({ error: 'El rango máximo permitido es 10 días.' });
  }

  const REPORT_ID = 888;
  const qs = new URLSearchParams({
    more_link: 'true', is_detailed_view: 'true',
    user_id, date_type: '2', date_range: '4',
    from_date, to_date,
    user: '1', branch_user,
    report_type: String(REPORT_ID),
    user_name: 'Ticket Simply',
    currency_symbol: '$',
    currency_converted_value: '0.0',
    gds_agent: '', locale: 'es',
  });

  const apiUrl = `https://api-pullman.konnectpro.cl/api/v2/reports/branch_collection_report/${REPORT_ID}?${qs}`;

  try {
    const apiRes = await fetch(apiUrl, {
      headers: {
        'accept':           'application/json',
        'accept-language':  'es-ES,es;q=0.9',
        'authorization':    `Bearer ${token}`,
        'cache-control':    'no-store',
        'category_type':    '1',
        ...(apiKey ? { 'x-api-key': apiKey } : {}),
      },
    });

    if (apiRes.status === 401) {
      return res.status(401).json({ error: 'Token expirado. El administrador debe actualizar el token en Vercel.' });
    }
    if (!apiRes.ok) {
      const text = await apiRes.text();
      return res.status(apiRes.status).json({ error: `API error ${apiRes.status}`, detail: text.slice(0, 200) });
    }

    const data = await apiRes.json();

    // Cache 5 minutos en Vercel CDN
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(data);

  } catch (err) {
    return res.status(502).json({ error: 'No se pudo conectar con la API de Pullman.', detail: err.message });
  }
}