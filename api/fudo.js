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
    const todayArg = `${argNow.getUTCFullYear()}-${pad(argNow.getUTCMonth()+1)}-${pad(argNow.getUTCDate())}`;
    const dateFrom = req.query.from || todayArg;
    const dateTo   = req.query.to   || todayArg;

    const toArgDate = iso => {
      if (!iso) return '';
      const d = new Date(iso);
      const arg = new Date(d.getTime() - 3 * 60 * 60 * 1000);
      return `${arg.getUTCFullYear()}-${pad(arg.getUTCMonth()+1)}-${pad(arg.getUTCDate())}`;
    };

    // VENTAS — sin fields[sale] para traer todos los atributos
    let allSales = [], allIncluded = [], page = 1, hasMore = true;
    while (hasMore) {
      const url = `https://api.fu.do/v1alpha1/sales?sort=-id&page[size]=500&page[number]=${page}&include=orders&fields[order]=origin`;
      const r = await fetch(url, { headers });
      const data = await r.json();
      const items = data.data || [];
      const filtered = items.filter(s => {
        const d = toArgDate(s.attributes?.createdAt);
        return d >= dateFrom && d <= dateTo;
      });
      allSales = allSales.concat(filtered);
      allIncluded = allIncluded.concat(data.included || []);
      const oldest = items[items.length - 1];
      const oldestDate = oldest ? toArgDate(oldest.attributes?.createdAt) : '';
      if (oldestDate < dateFrom || items.length < 500) hasMore = false;
      else { page++; if (page > 20) hasMore = false; }
    }

    // PAYMENTS
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

    // ORDERS MAP
    const ordersMap = {};
    allIncluded.forEach(inc => {
      if (inc.type === 'Order') ordersMap[inc.id] = inc.attributes?.origin || 'unknown';
    });

    // EXPENSES
    let allExpenses = [];
    let expPage = 1, expHasMore = true;
    while (expHasMore) {
      const expUrl = `https://api.fu.do/v1alpha1/expenses?sort=-id&page[size]=500&page[number]=${expPage}&include=expenseCategory,provider,paymentMethod&fields[expense]=amount,date,description,status,expenseCategory,provider,paymentMethod&fields[expenseCategory]=name&fields[provider]=name&fields[paymentMethod]=name`;
      const expRes = await fetch(expUrl, { headers });
      const expData = await expRes.json();
      const expItems = expData.data || [];
      const expIncluded = expData.included || [];
      const catMap = {}, provMap = {}, pmMap = {};
      expIncluded.forEach(inc => {
        if (inc.type === 'ExpenseCategory') catMap[inc.id] = inc.attributes?.name || 'Sin categoría';
        if (inc.type === 'Provider') provMap[inc.id] = inc.attributes?.name || '—';
        if (inc.type === 'PaymentMethod') pmMap[inc.id] = inc.attributes?.name || '—';
      });
      const filtered = expItems.filter(e => {
        const d = (e.attributes?.date || '').slice(0, 10);
        return d >= dateFrom && d <= dateTo;
      }).map(e => ({
        id: e.id,
        amount: e.attributes?.amount || 0,
        date: e.attributes?.date || '',
        description: e.attributes?.description || '—',
        status: e.attributes?.status || '',
        category: catMap[e.relationships?.expenseCategory?.data?.id] || 'Sin categoría',
        provider: provMap[e.relationships?.provider?.data?.id] || '—',
        paymentMethod: pmMap[e.relationships?.paymentMethod?.data?.id] || '—'
      }));
      allExpenses = allExpenses.concat(filtered);
      const oldestExp = expItems[expItems.length - 1];
      const oldestExpDate = oldestExp ? (oldestExp.attributes?.date || '').slice(0, 10) : '';
      if (oldestExpDate < dateFrom || expItems.length < 500) expHasMore = false;
      else { expPage++; if (expPage > 20) expHasMore = false; }
    }

    // TOTALES VENTAS
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

    // TOTALES EGRESOS
    const totalEgresos = allExpenses.reduce((a, e) => a + e.amount, 0);
    const egresosPorCategoria = {};
    allExpenses.forEach(e => {
      if (!egresosPorCategoria[e.category]) egresosPorCategoria[e.category] = { total: 0, count: 0 };
      egresosPorCategoria[e.category].total += e.amount;
      egresosPorCategoria[e.category].count++;
    });
    const egresosCategorias = Object.entries(egresosPorCategoria)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([nombre, data]) => ({ nombre, total: data.total, count: data.count }));

    const totalVentas = countSalon + countDelivery;
    const mediosPagoOrdenados = Object.entries(mediosPago)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([nombre, data]) => ({ nombre, total: data.total, count: data.count }));

    res.status(200).json({
      data: allSales,
      payments: paymentsMap,
      orders: ordersMap,
      expenses: allExpenses,
      summary: {
        totalBruto, totalSalon, totalDelivery,
        countTotal: totalVentas, countSalon, countDelivery,
        ticketPromedio: totalVentas > 0 ? Math.round(totalBruto / totalVentas) : 0,
        mediosPago: mediosPagoOrdenados,
        totalEgresos,
        egresosCategorias,
        dateFrom, dateTo
      }
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
