export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Primero obtenemos token fresco
    const tokenRes = await fetch('https://auth.fu.do/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        apiKey: 'MTNAMjYxNTgy',
        apiSecret: 'DjH8fSbHLDcoGWODPH2FmLxqW7OX35xA'
      })
    });
    const { token } = await tokenRes.json();

    // Llamamos a Fudo con el token
    const path = req.query.path || '/sales';
    const params = new URLSearchParams(req.query);
    params.delete('path');
    const url = `https://api.fu.do/v1alpha1${path}${params.toString() ? '?' + params.toString() : ''}`;

    const fudoRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    const data = await fudoRes.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
