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

    const now = new Date();
    const todayUTC = now.toISOString().split('T')[0];
    const dateFrom = req.query.from || todayUTC;
    const dateTo   = req.query.to   || todayUTC;

    let allSales = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.fu.do/v1alpha1/sales?sort=-id&page[size]=500&page[number]=${page}`;
      const r = await fetch(url, { headers });
      const data = await r.json();
      const items = data.data || [];

      const filtered = items.filter(s => {
        const d = (s.attributes?.createdAt || '').split('T')[0];
        return d >= dateFrom && d <= dateTo;
      });

      allSales = allSales.concat(filtered);

      const hasOlder = items.some(s => {
        const d = (s.attributes?.createdAt || '').split('T')[0];
        return d < dateFrom;
      });

      if (hasOlder || items.length < 500) {
        hasMore = false;
      } else {
        page++;
        if (page > 20) hasMore = false;
      }
    }

    let totalBruto = 0;
    let totalSalon = 0;
    let totalDelivery = 0;
    let countSalon = 0;
    let countDelivery = 0;

    allSales.forEach(s => {
      const attr = s.attributes || {};
      if (attr.saleState === 'CANCELED') return;
      const total = attr.total || 0;
      totalBruto += total;
      const tipo = (attr.saleType || '').toUpperCase();
      if (tipo === 'DELIVERY') {
        totalDelivery += total;
        countDelivery++;
      } else {
        totalSalon += total;
        countSalon++;
      }
    });

    const totalVentas = countSalon + countDelivery;
    const ticketPromedio = totalVentas > 0 ? Math.round(totalBruto / totalVentas) : 0;

    res.status(200).json({
      data: allSales,
      summary: {
        totalBruto,
        totalSalon,
        totalDelivery,
        countTotal: totalVentas,
        countSalon,
        countDelivery,
        ticketPromedio,
        dateFrom,
        dateTo
      }
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
