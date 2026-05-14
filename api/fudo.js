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
    const argNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    const pad = n => String(n).padStart(2, '0');
    const todayArg = `${argNow.getFullYear()}-${pad(argNow.getMonth()+1)}-${pad(argNow.getDate())}`;
    const dateFrom = req.query.from || todayArg;
    const dateTo   = req.query.to   || todayArg;

    const fromUTC = `${dateFrom}T03:00:00Z`;
    const toUTC   = `${dateTo}T02:59:59Z`;

    let allSales = [], allIncluded = [], page = 1, hasMore = true;
    while (hasMore) {
      const filter = `filter[createdAt]=and(gte.${fromUTC},lte.${toUTC})`;
      const url = `https://api.fu.do/v1alpha1/sales?${filter}&include=orders&sort=-id&page[size]=500&page[number]=${page}`;
      const r = await fetch(url, { headers });
      const data = await r.json();
      const items = data.data || [];
      allSales = allSales.concat(items);
      allIncluded = allIncluded.concat(data.included || []);
      if (items.length < 500) { hasMore = false; } else { page++; if (page > 20) hasMore = false; }
    }

    const paymentIds = [];
    allSales.forEach(s => { (s.relationships?.payments?.data || []).forEach(p => paymentIds.push(p.id)); });

    const paymentsMap = {};
    if (paymentIds.length > 0) {
      const idSet = new Set(paymentIds);
      let pmPage = 1, pmHasMore = true;
      while (pmHasMore) {
        const pmUrl = `https://api.fu.do/v1alpha1/payments?include=paymentMethod&fields[payment]=amount,paymentMethod&fields[paymentMethod]=name,kind&page[size]=500&page[number]=${pmPage}&sort=-id`;
        const pmRes = await fetch(pmUrl, { headers });
        const pmData = await pmRes.json();
        const pmItems = pmData.data || [];
        const pmMethodMap = {};
        (pmData.included || []).forEach(inc => {
          if (inc.type === 'PaymentMethod') pmMethodMap[inc.id] = inc.attributes?.name || 'Desconocido';
        });
        pmItems.forEach(p => {
          if (idSet.has(p.id)) {
            const pmId = p.relationships?.paymentMethod?.data?.id;
            paymentsMap[p.id] = {
              amount: p.attributes?.amount || 0,
              paymentMethodName: pmId ? (pmMethodMap[pmId] || 'Desconocido') : 'Desconocido',
              paymentMethodId: pmId || null
            };
          }
        });
        const found = Object.keys(paymentsMap).length;
        if (pmItems.length < 500 || found >= paymentIds.length) pmHasMore = false;
        else { pmPage++; if (pmPage > 10) pmHasMore = false; }
      }
    }

    const ordersMap = {};
    allIncluded.forEach(inc => {
      if (inc.type === 'Order') ordersMap[inc.id] = inc.attributes?.origin || 'unknown';
    });

    let totalBruto = 0, totalSalon = 0, totalDelivery = 0, countSalon = 0, countDelivery = 0;
    const mediosPago = {};

    allSales.forEach(s => {
      const attr = s.attributes || {};
      if (attr.saleState === 'CANCELED') return;
      const total = attr.total || 0;
      totalBruto += total;
      const tipo = (attr.saleType || '').toUpperCase();
      if (tipo === 'DELIVERY') { totalDelivery += total; countDelivery++; }
      else { totalSalon += total; countSalon++; }
      (s.relationships?.payments?.data || []).forEach(p => {
        const pm = paymentsMap[p.id];
        if (pm) {
          const nombre = pm.paymentMethodName;
          if (!mediosPago[nombre]) mediosPago[nombre] = { total: 0, count: 0 };
          mediosPago[nombre].total += pm.amount;
          mediosPago[nombre].count++;
        }
      });
    });

    const totalVentas = countSalon + countDelivery;
    const mediosPagoOrdenados = Object.entries(mediosPago)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([nombre, data]) => ({ nombre, total: data.total, count: data.count }));

    res.status(200).json({
      data: allSales,
      payments: paymentsMap,
      orders: ordersMap,
      summary: {
        totalBruto, totalSalon, totalDelivery,
        countTotal: totalVentas, countSalon, countDelivery,
        ticketPromedio: totalVentas > 0 ? Math.round(totalBruto / totalVentas) : 0,
        mediosPago: mediosPagoOrdenados,
        dateFrom, dateTo
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
