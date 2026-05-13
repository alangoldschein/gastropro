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
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' };

    // Fecha de hoy en UTC
    const hoy = new Date();
    const fechaHoy = hoy.toISOString().split('T')[0];

    // Traer ventas del día ordenadas por ID desc
    const salesRes = await fetch(`https://api.fu.do/v1alpha1/sales?sort=-id&page[size]=500`, { headers });
    const salesRaw = await salesRes.json();
    const todas = salesRaw.data || [];
    const ventas = todas.filter(s => {
      const f = s.attributes?.createdAt || '';
      return f.startsWith(fechaHoy);
    });

    // Recolectar todos los payment IDs del día
    const paymentIds = [];
    ventas.forEach(s => {
      (s.relationships?.payments?.data || []).forEach(p => paymentIds.push(p.id));
    });

    // Traer payments en una sola llamada (hasta 500)
    let paymentsMap = {};
    if (paymentIds.length > 0) {
      const pmRes = await fetch(`https://api.fu.do/v1alpha1/payments?page[size]=500&sort=-id`, { headers });
      const pmRaw = await pmRes.json();
      const pmData = pmRaw.data || [];
      // Filtrar solo los del día y mapear id -> nombre del medio de pago
      const idSet = new Set(paymentIds);
      pmData.forEach(p => {
        if (idSet.has(p.id)) {
          paymentsMap[p.id] = {
            amount: p.attributes?.amount || 0,
            paymentMethodName: p.attributes?.paymentMethodName || p.attributes?.payment_method_name || 'Desconocido',
            paymentMethodId: p.attributes?.paymentMethodId || p.attributes?.payment_method_id || null
          };
        }
      });
    }

    res.status(200).json({ data: ventas, payments: paymentsMap, meta: { total: ventas.length } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
