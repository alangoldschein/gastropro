export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const tokenRes = await fetch('https://auth.fu.do/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ apiKey: 'MTNAMjYxNTgy', apiSecret: 'DjH8fSbHLDcoGWODPH2FmLxqW7OX35xA' })
    });
    const { token } = await tokenRes.json();

    // Traer ventas ordenadas por ID descendente (más recientes primero)
    // y filtrar por fecha de hoy en el servidor
    const hoy = new Date();
    const yyyy = hoy.getUTCFullYear();
    const mm = String(hoy.getUTCMonth()+1).padStart(2,'0');
    const dd = String(hoy.getUTCDate()).padStart(2,'0');

    // Traemos las últimas 500 ventas ordenadas por id desc
    const url = `https://api.fu.do/v1alpha1/sales?sort=-id&page[size]=500`;
    const fudoRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    const raw = await fudoRes.json();
    const todas = Array.isArray(raw) ? raw : (raw.data || []);

    // Filtrar solo las de hoy por fecha UTC
    const fechaHoy = `${yyyy}-${mm}-${dd}`;
    const deHoy = todas.filter(s => {
      const fecha = s.attributes?.createdAt || s.attributes?.closedAt || '';
      return fecha.startsWith(fechaHoy);
    });

    res.status(200).json({ data: deHoy, meta: { total: deHoy.length } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
