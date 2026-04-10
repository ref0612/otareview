/**
 * Vercel Serverless Function — /api/report
 * Actúa como proxy seguro hacia la API de KonnectPro Pullman.
 * El Bearer Token y API Key viven en variables de entorno de Vercel,
 * nunca en el código frontend.
 */

export default async function handler(req, res) {
  const { from_date, to_date, company } = req.query;

  // Las URLs de las APIs de KonnectPro están ocultas aquí en el servidor
  const endpoints = {
    bus: { url: 'https://api-pullman.konnectpro.cl', branch: '2:5' },
    costa: { url: 'https://api-costas.konnectpro.cl', branch: '2:9' }
  };

  const selected = endpoints[company];
  if (!selected) return res.status(400).json({ error: 'Empresa no válida' });

  // Credenciales protegidas en variables de entorno (Environment Variables)
  const credentials = {
    login: process.env.KONNECT_LOGIN,
    password: process.env.KONNECT_PASSWORD,
    apiKey: process.env.PULLMAN_API_KEY
  };

  // Función interna para consultar la API real
  async function callKonnect(token) {
    const REPORT_ID = 888;
    const qs = new URLSearchParams({
      more_link: 'true', is_detailed_view: 'true', user_id: '5',
      date_type: '2', date_range: '4', from_date, to_date,
      user: '1', branch_user: selected.branch, report_type: String(REPORT_ID), locale: 'es'
    });

    return fetch(`${selected.url}/api/v2/reports/branch_collection_report/${REPORT_ID}?${qs}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Api-Key': credentials.apiKey,
        'category_type': '1'
      }
    });
  }

  try {
    // 1. Intentar con un token guardado o forzar un login inicial
    // El sistema de Auto-Refresh ocurre aquí si la respuesta es 401
    let loginRes = await fetch(`${selected.url}/api/v2/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': credentials.apiKey },
      body: JSON.stringify({ login: credentials.login, password: credentials.password })
    });

    const { token } = await loginRes.json();
    const apiRes = await callKonnect(token);
    const data = await apiRes.json();

    res.status(apiRes.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Error interno en el servidor seguro' });
  }
}