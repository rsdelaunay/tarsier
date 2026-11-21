// Tarsier on the phone: the raw Compare numbers worked out from a company's SEC filings (XBRL "companyfacts").
// Same reading rules as the PC engine (xbrl.py / metrics.py): latest filing wins, quarters from 3-month
// periods or year-to-date minus the period three months earlier. Grades and projections stay on the PC.
"use strict";

const TSEC = (() => {
  const FORMS = new Set(["10-Q", "10-K", "10-Q/A", "10-K/A", "10-KT", "10-QT"]);
  const NS = ["us-gaap", "dei", "ifrs-full"];
  const C = {
    revenue: ["RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues",
              "RevenueFromContractWithCustomerIncludingAssessedTax", "SalesRevenueNet"],
    cost_of_revenue: ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfServices", "CostOfGoodsSold"],
    gross_profit: ["GrossProfit"],
    operating_income: ["OperatingIncomeLoss"],
    net_income: ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"],
    cfo: ["NetCashProvidedByUsedInOperatingActivities", "NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"],
    capex_ppe: ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
    capex_software: ["PaymentsToDevelopSoftware", "PaymentsForSoftware"],
    da_cf: ["DepreciationDepletionAndAmortization", "DepreciationAmortizationAndAccretionNet", "DepreciationAndAmortization"],
    da_is: ["DepreciationAndAmortization", "DepreciationDepletionAndAmortization", "AmortizationOfIntangibleAssets"],
    eps: ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"],
    shares_basic: ["WeightedAverageNumberOfSharesOutstandingBasic"],
    shares_diluted: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
    cash: ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    st_investments: ["ShortTermInvestments", "MarketableSecuritiesCurrent", "DebtSecuritiesCurrent",
                     "AvailableForSaleSecuritiesDebtSecuritiesCurrent", "AvailableForSaleSecuritiesCurrent",
                     "DebtSecuritiesAvailableForSaleExcludingAccruedInterestCurrent"],
    debt_total: ["LongTermDebt", "DebtLongtermAndShorttermCombinedAmount"],
    debt_noncurrent: ["LongTermDebtNoncurrent", "ConvertibleNotesPayable", "ConvertibleLongTermNotesPayable", "LongTermNotesPayable"],
    debt_current: ["LongTermDebtCurrent", "ConvertibleNotesPayableCurrent", "DebtCurrent"],
    credit_line: ["LongTermLineOfCredit", "LineOfCredit"],
    st_borrowings: ["ShortTermBorrowings", "OtherShortTermBorrowings", "CommercialPaper"],
    finance_lease: ["FinanceLeaseLiability"],
    finance_lease_cur: ["FinanceLeaseLiabilityCurrent"],
    finance_lease_noncur: ["FinanceLeaseLiabilityNoncurrent"],
    shares_out: ["EntityCommonStockSharesOutstanding"],
  };
  const DAY = 86400000;
  const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

  function entries(facts, concept, unit) {
    for (const ns of NS) {
      const c = ((facts.facts || {})[ns] || {})[concept];
      if (c && c.units && c.units[unit]) return c.units[unit];
    }
    return [];
  }
  function latest(list, key) {                     // one value per key: the most recently filed wins
    const best = new Map();
    for (const e of list) {
      if (!FORMS.has(e.form)) continue;
      const k = key(e);
      if (k == null) continue;
      const b = best.get(k);
      if (!b || (e.filed || "") > (b.filed || "")) best.set(k, e);
    }
    return best;
  }
  function quartersFrom(d, derive = true) {
    const byEnd = new Map();
    for (const [k, rec] of d) { const [s, e] = k.split("|"); (byEnd.get(e) || byEnd.set(e, []).get(e)).push([s, rec]); }
    const out = new Map();
    for (const [end, lst] of byEnd) {
      const direct = lst.filter(([s]) => { const n = days(s, end); return n >= 80 && n <= 100; });
      if (direct.length) {
        const [, r] = direct.reduce((a, b) => ((b[1].filed || "") > (a[1].filed || "") ? b : a));
        out.set(end, r.val);
        continue;
      }
      if (!derive) continue;
      for (const [s, r] of [...lst].sort((a, b) => a[0].localeCompare(b[0]))) {
        let hit = null;
        for (const [k2, r2] of d) {
          const [s2, e2] = k2.split("|");
          const n = days(e2, end);
          if (s2 == s && n >= 80 && n <= 100) { hit = r2; break; }
        }
        if (hit) { out.set(end, r.val - hit.val); break; }
      }
    }
    return out;
  }
  function quarterly(facts, concepts, unit = "USD", derive = true) {
    const out = new Map();
    for (const c of concepts) {
      const ents = entries(facts, c, unit).filter(e => e.start);
      const d = latest(ents, e => e.start + "|" + e.end);
      for (const [end, v] of quartersFrom(d, derive)) if (!out.has(end)) out.set(end, v);
      if (!derive) {                                 // share counts are averages: a year-end quarter takes the year's figure
        for (const [k, r] of d) {
          const e = k.split("|")[1];
          if (!out.has(e)) out.set(e, r.val);
        }
      }
    }
    return out;
  }
  function longestByEnd(facts, concepts) {          // end -> [days, value] of the longest period ending there
    const out = new Map();
    for (const c of concepts) {
      const ents = entries(facts, c, "USD").filter(e => e.start);
      for (const [k, r] of latest(ents, e => e.start + "|" + e.end)) {
        const [s, e] = k.split("|"), n = days(s, e);
        if (!out.has(e) || n > out.get(e)[0]) out.set(e, [n, r.val]);
      }
    }
    return out;
  }
  // last twelve months of a cash-flow line, as the PC does it: this year-to-date + last full year − last year's
  // year-to-date. A line the company never reports gives null; a period with no entry counts as zero.
  function cfTTM(facts, concepts, ref, end) {
    const m = longestByEnd(facts, concepts);
    if (!m.size || !ref.has(end)) return null;
    const v = e => (m.has(e) ? m.get(e)[1] : 0);
    if (ref.get(end)[0] >= 350) return v(end);
    const fy = [...ref].filter(([e, [d]]) => d >= 350 && e < end).map(([e]) => e).sort().pop();
    const py = near(ref, end, 364, 12);
    if (!fy || !py) return null;
    return v(end) + v(fy) - v(py);
  }
  function instants(facts, concepts, unit = "USD") {
    const out = new Map();
    for (const c of concepts) {
      const ents = entries(facts, c, unit).filter(e => !e.start);
      for (const [end, r] of latest(ents, e => e.end)) if (!out.has(end)) out.set(end, r.val);
    }
    return out;
  }
  function near(map, end, back, tol = 20) {        // the value whose date is ~back days before end
    let best = null, gap = 1e9;
    for (const k of map.keys()) {
      const g = Math.abs(days(k, end) - back);
      if (g <= tol && g < gap) { best = k; gap = g; }
    }
    return best;
  }
  function sharesOutstanding(facts) {              // latest cover-page count, all share classes summed
    const ents = entries(facts, "EntityCommonStockSharesOutstanding", "shares");
    if (!ents.length) return null;
    const lastFiled = ents.reduce((a, e) => ((e.filed || "") > a ? e.filed : a), "");
    const same = ents.filter(e => e.filed == lastFiled);
    const end = same.reduce((a, e) => (e.end > a ? e.end : a), "");
    const seen = new Set();
    let sum = 0;
    for (const e of same) if (e.end == end && !seen.has(e.val)) { seen.add(e.val); sum += e.val; }
    return sum || null;
  }

  // ---- the Compare column -------------------------------------------------------------------
  function compute(facts, price) {
    const q = k => quarterly(facts, C[k]);
    const rev = q("revenue");
    if (!rev.size) throw new Error("no quarterly revenue in the SEC data");
    const end = [...rev.keys()].sort().pop();
    const ago = near(rev, end, 364, 12);
    const ttmEnds = [end];
    for (let i = 1; i < 4; i++) { const p = near(rev, ttmEnds[i - 1], 91, 12); if (!p) break; ttmEnds.push(p); }
    const at = (m, e) => (e && m.has(e) ? m.get(e) : null);
    const ttm = m => ttmEnds.length == 4 && ttmEnds.every(e => m.has(e)) ? ttmEnds.reduce((a, e) => a + m.get(e), 0) : null;

    const gp = q("gross_profit"), cor = q("cost_of_revenue"), oi = q("operating_income"), ni = q("net_income");
    const cfo = q("cfo"), cpx = q("capex_ppe"), csw = q("capex_software"), daCf = q("da_cf"), daIs = q("da_is");
    const da = new Map([...daIs, ...daCf]);          // cash-flow D&A when reported, income-statement D&A otherwise
    const eps = quarterly(facts, C.eps, "USD/shares");
    const sb = quarterly(facts, C.shares_basic, "shares", false), sd = quarterly(facts, C.shares_diluted, "shares", false);
    const gross = e => { const g = at(gp, e) ?? (at(cor, e) != null && at(rev, e) != null ? at(rev, e) - at(cor, e) : null);
                         return g == null || !at(rev, e) ? null : g / at(rev, e) * 100; };
    const pct = (m, e) => at(m, e) == null || !at(rev, e) ? null : at(m, e) / at(rev, e) * 100;

    const ref = longestByEnd(facts, C.cfo);
    const cfoT = cfTTM(facts, C.cfo, ref, end), cpxT = cfTTM(facts, C.capex_ppe, ref, end), cswT = cfTTM(facts, C.capex_software, ref, end);
    const fcfT = cfoT == null || (cpxT == null && cswT == null) ? null : cfoT - (cpxT || 0) - (cswT || 0);
    const revT = ttm(rev), oiT = ttm(oi), daT = ttm(da);

    const I = k => instants(facts, C[k]);
    const iv = (k, e) => at(I(k), e);
    let debt = iv("debt_total", end);
    if (debt == null) {
      const p = ["debt_noncurrent", "debt_current", "credit_line"].map(k => iv(k, end)).filter(v => v != null);
      debt = p.length ? p.reduce((a, b) => a + b, 0) : null;
    }
    let fl = iv("finance_lease", end);
    if (fl == null) {
      const p = ["finance_lease_cur", "finance_lease_noncur"].map(k => iv(k, end)).filter(v => v != null);
      fl = p.length ? p.reduce((a, b) => a + b, 0) : null;
    }
    const extra = [iv("st_borrowings", end), fl].filter(v => v != null);
    if (debt != null || extra.length) debt = (debt || 0) + extra.reduce((a, b) => a + b, 0);
    const cash = iv("cash", end);
    const netCash = cash == null ? null : cash + (iv("st_investments", end) || 0) - (debt || 0);

    const epsQ = at(eps, end), epsA = at(eps, ago);
    const epsT = ttm(eps);
    const big = v => (v != null && v >= 1e6 ? v : null);   // a count under a million is a units slip in the filing
    const shares = Math.max(big(at(sd, end)) || 0, big(at(sb, end)) || 0) || sharesOutstanding(facts);   // as the PC: diluted now
    const sbNow = big(at(sb, end)), sbAgo = big(at(sb, ago));
    const dil = sbNow && sbAgo ? (sbNow / sbAgo - 1) * 100 : null;
    const mcap = price && shares ? price * shares : null;
    const ev = mcap == null ? null : mcap - (netCash || 0);
    const ebitda = oiT == null ? null : oiT + (daT || 0);
    const M = v => (v == null ? null : v / 1e6);
    const r1 = v => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
    const r2 = v => (v == null || !isFinite(v) ? null : Math.round(v * 100) / 100);
    return {
      end, year_ago: ago,
      grade: null, business: "—",
      revenue: r1(M(at(rev, end))),
      rev_yoy: at(rev, ago) ? r1((at(rev, end) / at(rev, ago) - 1) * 100) : null,
      gross: r1(gross(end)), operating: r1(pct(oi, end)), net: r1(pct(ni, end)),
      fcf_margin: revT && fcfT != null ? r1(fcfT / revT * 100) : null,
      eps: r2(epsQ), eps_yoy: epsQ > 0 && epsA > 0 ? r1((epsQ / epsA - 1) * 100) : null,
      net_cash: r1(M(netCash)),
      dilution: dil != null && Math.abs(dil) < 60 ? r1(dil) : null,
      price: price ?? null, market_cap: r1(M(mcap)),
      pe: price && epsT > 0 ? r1(price / epsT) : null,
      fpe: null, peg: null, fwd_year: null,
      ev_sales: ev != null && revT ? r1(ev / revT) : null,
      ev_ebitda: ev != null && ebitda > 0 ? r1(ev / ebitda) : null,
      fcf_yield: mcap && fcfT != null ? r1(fcfT / mcap * 100) : null,
      fair_value: null, upside: null,
      base: { eps_ttm: r2(epsT), shares_m: M(shares), net_cash: M(netCash), rev_ttm: M(revT),
              ebitda_ttm: M(ebitda), fcf_ttm: M(fcfT) },
    };
  }

  // the price-driven rows again at a new price (used for PC-graded companies too)
  function reprice(col, price) {
    const b = col.base || {};
    if (!price || !b.shares_m) return { ...col, price: price ?? col.price };
    const r1 = v => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
    const mcap = price * b.shares_m, ev = mcap - (b.net_cash || 0);
    const out = { ...col, price, market_cap: r1(mcap),
      pe: b.eps_ttm > 0 ? r1(price / b.eps_ttm) : null,
      ev_sales: b.rev_ttm ? r1(ev / b.rev_ttm) : null,
      ev_ebitda: b.ebitda_ttm > 0 ? r1(ev / b.ebitda_ttm) : null,
      fcf_yield: b.fcf_ttm != null ? r1(b.fcf_ttm / mcap * 100) : null };
    if (b.eps_fwd > 0) { out.fpe = r1(price / b.eps_fwd); out.peg = b.eps_growth > 0 ? Math.round(out.fpe / b.eps_growth * 100) / 100 : null; }
    if (col.fair_value) out.upside = r1((col.fair_value / price - 1) * 100);
    return out;
  }

  return { compute, reprice, quarterly, C };
})();
if (typeof module !== "undefined") module.exports = TSEC;
