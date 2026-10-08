/**
 * Generates a standalone HTML string for a CBAM Installation Communication report.
 * Styled with inline CSS for a premium, print-ready look.
 *
 * @param {Object} data - The aggregated CBAM data payload
 * @returns {string} - Complete HTML document string
 */
export const generateCbamHtml = (data) => {
    const {
        organization,
        reportingYear,
        period,
        installations,
        products,
        allRecords,
    } = data;

    const orgName = organization?.name || organization?.legalName || "Organization";
    const periodLabel = period?.startDate && period?.endDate
        ? `${new Date(period.startDate).toLocaleDateString("en-GB")} – ${new Date(period.endDate).toLocaleDateString("en-GB")}`
        : `FY ${reportingYear}`;

    // Build product rows for summary table
    const productRows = products.map((p) => {
        const prodRecords = (allRecords || []).filter(
            (r) => String(r.cbamProductId?._id || r.cbamProductId) === String(p._id)
        );
        const directTotal = prodRecords.reduce((s, r) => s + (r.totalDirectEmissions || 0), 0);
        const indirectTotal = prodRecords.reduce((s, r) => s + (r.totalIndirectEmissions || 0), 0);
        const precursorTotal = prodRecords.reduce((s, r) => s + (r.totalPrecursorEmissions || 0), 0);
        const volume = prodRecords.reduce((s, r) => s + (r.productionVolume || 0), 0);
        const see = volume > 0 ? (directTotal + precursorTotal) / volume : 0;
        const seeWithIndirect = volume > 0 ? (directTotal + indirectTotal + precursorTotal) / volume : 0;

        return { ...p, directTotal, indirectTotal, precursorTotal, volume, see, seeWithIndirect };
    });

    // Format number
    const fmt = (n, d = 2) => (typeof n === "number" ? n.toLocaleString("en-US", { maximumFractionDigits: d }) : "0");

    // Build direct emission table rows
    const allDirect = (allRecords || []).flatMap((r) => r.directEmissions || []);
    const allIndirect = (allRecords || []).flatMap((r) => r.indirectEmissions || []);
    const allPrecursors = (allRecords || []).flatMap((r) => r.precursorConsumption || []);

    // Installation info
    const inst = installations?.[0]?.installation || {};
    const fac = installations?.[0]?.facility || {};

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CBAM Installation Report — ${orgName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: #f8fafc; color: #1e293b; line-height: 1.6; }
    
    .page { max-width: 210mm; margin: 0 auto; background: #fff; }
    .page-break { page-break-after: always; }
    
    /* Cover */
    .cover { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f766e 100%); color: #fff; padding: 80px 60px; min-height: 297mm; display: flex; flex-direction: column; justify-content: center; }
    .cover-badge { display: inline-block; background: rgba(255,255,255,0.15); backdrop-filter: blur(8px); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 8px 20px; font-size: 12px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 40px; }
    .cover h1 { font-size: 42px; font-weight: 800; line-height: 1.1; margin-bottom: 16px; }
    .cover h2 { font-size: 22px; font-weight: 400; opacity: 0.8; margin-bottom: 40px; }
    .cover-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: auto; padding-top: 60px; border-top: 1px solid rgba(255,255,255,0.2); }
    .meta-item label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.6; margin-bottom: 4px; }
    .meta-item p { font-size: 15px; font-weight: 600; }

    /* Content pages */
    .content { padding: 50px 60px; }
    .section { margin-bottom: 40px; }
    .section-title { font-size: 18px; font-weight: 700; color: #0f766e; border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-bottom: 20px; }
    .subsection-title { font-size: 14px; font-weight: 600; color: #334155; margin-bottom: 12px; }

    /* Info grid */
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 40px; margin-bottom: 24px; }
    .info-row { display: flex; gap: 8px; font-size: 13px; }
    .info-label { font-weight: 600; color: #64748b; min-width: 140px; }
    .info-value { color: #1e293b; }

    /* Tables */
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
    thead { background: #f1f5f9; }
    th { text-align: left; padding: 10px 12px; font-weight: 600; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #e2e8f0; }
    td { padding: 9px 12px; border-bottom: 1px solid #f1f5f9; }
    tr:hover td { background: #fafbfc; }
    .num { text-align: right; font-variant-numeric: tabular-nums; font-family: 'SF Mono', 'Fira Code', monospace; }
    .highlight-row { background: #f0fdf4; font-weight: 600; }
    .total-row { background: #0f766e; color: #fff; font-weight: 700; }
    .total-row td { border-bottom: none; }

    /* Stats cards */
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 30px; }
    .stat-card { background: linear-gradient(135deg, #f0fdf4, #ecfdf5); border: 1px solid #d1fae5; border-radius: 12px; padding: 20px; }
    .stat-card .label { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; margin-bottom: 6px; }
    .stat-card .value { font-size: 24px; font-weight: 800; color: #064e3b; }
    .stat-card .unit { font-size: 11px; font-weight: 500; color: #6b7280; }

    /* Footer */
    .footer { text-align: center; padding: 20px 60px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; }

    @media print {
      body { background: #fff; }
      .page { box-shadow: none; }
    }
  </style>
</head>
<body>
  <!-- Cover Page -->
  <div class="page cover">
    <span class="cover-badge">EU CBAM Regulation 2023/956</span>
    <h1>CBAM Installation<br/>Communication Report</h1>
    <h2>${orgName}</h2>
    <div class="cover-meta">
      <div class="meta-item">
        <label>Reporting Period</label>
        <p>${periodLabel}</p>
      </div>
      <div class="meta-item">
        <label>Installation</label>
        <p>${inst.installationName || fac.facilityName || "Primary Installation"}</p>
      </div>
      <div class="meta-item">
        <label>Country</label>
        <p>${inst.countryCode === "IN" ? "India" : (inst.countryCode || "India")}</p>
      </div>
      <div class="meta-item">
        <label>UN/LOCODE</label>
        <p>${inst.unLocode || "—"}</p>
      </div>
    </div>
  </div>

  <!-- Page 2: Installation Details + Product Summary -->
  <div class="page content page-break">
    <div class="section">
      <h3 class="section-title">1. Installation Details</h3>
      <div class="info-grid">
        <div class="info-row"><span class="info-label">Installation Name</span><span class="info-value">${inst.installationName || fac.facilityName || "—"}</span></div>
        <div class="info-row"><span class="info-label">Operator</span><span class="info-value">${orgName}</span></div>
        <div class="info-row"><span class="info-label">Address</span><span class="info-value">${inst.address || fac.facilityLocation || "—"}</span></div>
        <div class="info-row"><span class="info-label">UN/LOCODE</span><span class="info-value">${inst.unLocode || "—"}</span></div>
        <div class="info-row"><span class="info-label">Country</span><span class="info-value">${inst.countryCode === "IN" ? "India" : (inst.countryCode || "India")}</span></div>
        <div class="info-row"><span class="info-label">Coordinates</span><span class="info-value">${inst.latitude || "—"}, ${inst.longitude || "—"}</span></div>
      </div>
    </div>

    <div class="section">
      <h3 class="section-title">2. Products Summary</h3>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="label">Products</div>
          <div class="value">${products.length}</div>
        </div>
        <div class="stat-card">
          <div class="label">Total Direct</div>
          <div class="value">${fmt(productRows.reduce((s, p) => s + p.directTotal, 0))}</div>
          <div class="unit">tCO₂</div>
        </div>
        <div class="stat-card">
          <div class="label">Total Indirect</div>
          <div class="value">${fmt(productRows.reduce((s, p) => s + p.indirectTotal, 0))}</div>
          <div class="unit">tCO₂</div>
        </div>
        <div class="stat-card">
          <div class="label">Total Precursors</div>
          <div class="value">${fmt(productRows.reduce((s, p) => s + p.precursorTotal, 0))}</div>
          <div class="unit">tCO₂</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>CN Code</th>
            <th>Category</th>
            <th class="num">Volume</th>
            <th class="num">Direct (tCO₂)</th>
            <th class="num">Indirect (tCO₂)</th>
            <th class="num">SEE (tCO₂/t)</th>
          </tr>
        </thead>
        <tbody>
          ${productRows.map((p) => `
          <tr>
            <td>${p.productName || "—"}</td>
            <td>${p.cnCode || "—"}</td>
            <td>${p.aggregatedCategory || p.mainCategory || "—"}</td>
            <td class="num">${fmt(p.volume)}</td>
            <td class="num">${fmt(p.directTotal)}</td>
            <td class="num">${fmt(p.indirectTotal)}</td>
            <td class="num">${fmt(p.seeWithIndirect, 4)}</td>
          </tr>`).join("")}
          <tr class="total-row">
            <td colspan="3">Total</td>
            <td class="num">${fmt(productRows.reduce((s, p) => s + p.volume, 0))}</td>
            <td class="num">${fmt(productRows.reduce((s, p) => s + p.directTotal, 0))}</td>
            <td class="num">${fmt(productRows.reduce((s, p) => s + p.indirectTotal, 0))}</td>
            <td class="num">—</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- Page 3: Direct Emissions -->
  <div class="page content page-break">
    <div class="section">
      <h3 class="section-title">3. Direct Emissions Breakdown</h3>
      ${allDirect.length === 0 ? '<p style="color:#94a3b8;font-size:13px;">No direct emissions recorded.</p>' : `
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th>Fuel / Material</th>
            <th>Type</th>
            <th class="num">Quantity</th>
            <th>Unit</th>
            <th class="num">EF</th>
            <th class="num">CO₂ (t)</th>
          </tr>
        </thead>
        <tbody>
          ${allDirect.map((d) => `
          <tr>
            <td>${d.source || "—"}</td>
            <td>${d.fuelOrMaterial || "—"}</td>
            <td>${d.emissionType || "—"}</td>
            <td class="num">${fmt(d.quantity)}</td>
            <td>${d.unit || "—"}</td>
            <td class="num">${d.emissionFactor ? fmt(d.emissionFactor, 4) : "—"}</td>
            <td class="num">${fmt(d.co2Emissions)}</td>
          </tr>`).join("")}
          <tr class="total-row">
            <td colspan="6">Total Direct Emissions</td>
            <td class="num">${fmt(allDirect.reduce((s, d) => s + (d.co2Emissions || 0), 0))}</td>
          </tr>
        </tbody>
      </table>`}
    </div>

    <div class="section">
      <h3 class="section-title">4. Indirect Emissions (Electricity)</h3>
      ${allIndirect.length === 0 ? '<p style="color:#94a3b8;font-size:13px;">No indirect emissions recorded.</p>' : `
      <table>
        <thead>
          <tr>
            <th>Source</th>
            <th class="num">Consumed</th>
            <th>Unit</th>
            <th class="num">EF</th>
            <th class="num">CO₂ (t)</th>
            <th>Data Type</th>
          </tr>
        </thead>
        <tbody>
          ${allIndirect.map((d) => `
          <tr>
            <td>${d.electricitySource || "—"}</td>
            <td class="num">${fmt(d.electricityConsumed)}</td>
            <td>${d.unit || "MWh"}</td>
            <td class="num">${d.emissionFactor ? fmt(d.emissionFactor, 4) : "—"}</td>
            <td class="num">${fmt(d.co2Emissions)}</td>
            <td>${d.dataType || "—"}</td>
          </tr>`).join("")}
          <tr class="total-row">
            <td colspan="4">Total Indirect Emissions</td>
            <td class="num">${fmt(allIndirect.reduce((s, d) => s + (d.co2Emissions || 0), 0))}</td>
            <td></td>
          </tr>
        </tbody>
      </table>`}
    </div>
  </div>

  <!-- Page 4: Precursors -->
  <div class="page content">
    <div class="section">
      <h3 class="section-title">5. Precursor Consumption</h3>
      ${allPrecursors.length === 0 ? '<p style="color:#94a3b8;font-size:13px;">No precursor consumption recorded.</p>' : `
      <table>
        <thead>
          <tr>
            <th>Precursor</th>
            <th class="num">Mass Consumed (t)</th>
            <th class="num">SEE (tCO₂/t)</th>
            <th class="num">Total Embedded (tCO₂)</th>
            <th>Origin</th>
          </tr>
        </thead>
        <tbody>
          ${allPrecursors.map((p) => `
          <tr>
            <td>${p.precursorName || "—"}</td>
            <td class="num">${fmt(p.totalMassConsumed)}</td>
            <td class="num">${fmt(p.specificEmbeddedEmissions, 4)}</td>
            <td class="num">${fmt(p.totalEmbeddedEmissions)}</td>
            <td>${p.origin || "—"}</td>
          </tr>`).join("")}
          <tr class="total-row">
            <td colspan="3">Total Precursor Emissions</td>
            <td class="num">${fmt(allPrecursors.reduce((s, p) => s + (p.totalEmbeddedEmissions || 0), 0))}</td>
            <td></td>
          </tr>
        </tbody>
      </table>`}
    </div>

    <div class="footer">
      Generated by CarbonOS — CBAM Module · ${new Date().toLocaleDateString("en-GB")} · EU Regulation 2023/956
    </div>
  </div>
</body>
</html>`;

    return html;
};
