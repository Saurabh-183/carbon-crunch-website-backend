import { CbamProduct } from "../models/cbam-product.model.js";
import { CbamProductionRecord } from "../models/cbam-production-record.model.js";
import { CbamInstallation } from "../models/cbam-installation.model.js";
import { SourceEntry } from "../models/source-entry.model.js";
import { EmissionFactor } from "../models/emission-factor.model.js";
import { ProductAllocation } from "../models/product-allocation.model.js";

/**
 * Auto-sync CBAM Production Records from approved GHG submissions.
 *
 * When a Plant Admin approves a SourceSubmission, this function:
 * 1. Checks if the facility has any active CBAM products
 * 2. Collects all SourceEntries for the submission
 * 3. Maps Scope 1 entries → directEmissions
 * 4. Maps Scope 2 entries → indirectEmissions
 * 5. Upserts a CbamProductionRecord per product per quarter
 *
 * CBAM methodology: Installation-level emissions are attributed to each product.
 * The pre-save hook on CbamProductionRecord auto-computes SEE (specific embedded
 * emissions) by dividing total emissions by productionVolume.
 */

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Derive a reporting quarter from a month (1-12) or from a period string.
 */
const getQuarterFromMonth = (month) => {
  if (!month || month < 1 || month > 12) return "Annual";
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
};

/**
 * Determine if a Scope 1 entry is a process emission vs combustion.
 * Uses activityType / section / activityGroup heuristics.
 */
const classifyEmissionType = (entry) => {
  const text = [
    entry.activityType,
    entry.section,
    entry.activityGroup,
    entry.activityCategory,
    entry.source,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Process emissions: calcination, chemical reactions, fugitive, refrigerant, etc.
  if (
    text.includes("process") ||
    text.includes("calcinat") ||
    text.includes("fugitive") ||
    text.includes("refriger") ||
    text.includes("sf6") ||
    text.includes("pfc") ||
    text.includes("hfc") ||
    text.includes("n2o") ||
    text.includes("ch4") ||
    text.includes("co2 from raw")
  ) {
    return "process";
  }
  return "combustion";
};

/**
 * Resolve emission factor for an entry:
 * 1. Use stored EF from the entry (already resolved during submission)
 * 2. Fallback: try DB lookup
 */
const resolveEmissionFactor = async (entry) => {
  if (Number.isFinite(entry.emissionFactor)) return entry.emissionFactor;

  // Try DB lookup
  try {
    const scopeLabel =
      entry.scope === 1 ? "Scope 1" : entry.scope === 2 ? "Scope 2" : "Scope 3";
    const ef = await EmissionFactor.findOne({
      scope: scopeLabel,
      activityType: entry.activityType,
      source: entry.source,
      unit: entry.unit,
    }).lean();
    if (ef?.emissionFactor) return ef.emissionFactor;
  } catch {
    /* non-blocking */
  }
  return null;
};

// ─── Core Mapping ─────────────────────────────────────────────────

/**
 * Map Scope 1 SourceEntries → CBAM directEmissions sub-documents.
 */
const mapScope1ToDirectEmissions = async (entries, allocationRatio = 1) => {
  const directEmissions = [];

  for (const entry of entries) {
    const ef = await resolveEmissionFactor(entry);
    const quantity = (Number(entry.value) || 0) * allocationRatio;
    const co2 = Number.isFinite(ef) ? +(quantity * ef).toFixed(6) : 0;

    directEmissions.push({
      source:
        [entry.section, entry.activityType].filter(Boolean).join(" — ") ||
        entry.source ||
        "Unknown source",
      fuelOrMaterial: entry.source || entry.activityCategory || "",
      quantity,
      unit: entry.unit || "Tonnes",
      emissionFactor: Number.isFinite(ef) ? ef : undefined,
      co2Emissions: co2,
      gasType: "CO₂",
      emissionType: classifyEmissionType(entry),
      measurementMethod: entry.measurementMethod || "",
    });
  }

  return directEmissions;
};

/**
 * Map Scope 2 SourceEntries → CBAM indirectEmissions sub-documents.
 */
const mapScope2ToIndirectEmissions = async (entries, allocationRatio = 1) => {
  const indirectEmissions = [];

  for (const entry of entries) {
    const ef = await resolveEmissionFactor(entry);
    const consumed = (Number(entry.value) || 0) * allocationRatio;
    const co2 = Number.isFinite(ef) ? +(consumed * ef).toFixed(6) : 0;

    // Determine electricity unit
    let unit = entry.unit || "MWh";
    // Normalize: kWh, MWh, GWh are valid directly
    if (!["MWh", "kWh", "GWh"].includes(unit)) unit = "MWh";

    indirectEmissions.push({
      electricitySource:
        entry.source || entry.activityGroup || "Grid electricity",
      electricityConsumed: consumed,
      unit,
      emissionFactor: Number.isFinite(ef) ? ef : undefined,
      co2Emissions: co2,
      dataType: "actual",
    });
  }

  return indirectEmissions;
};

/**
 * Group entries by reporting quarter for quarterly CBAM records.
 * Returns Map<quarter, { scope1Entries[], scope2Entries[] }>
 */
const groupEntriesByQuarter = (entries) => {
  const groups = new Map();

  for (const entry of entries) {
    const quarter = getQuarterFromMonth(entry.reportingMonth);
    if (!groups.has(quarter)) {
      groups.set(quarter, { scope1Entries: [], scope2Entries: [] });
    }
    const group = groups.get(quarter);
    if (entry.scope === 1) group.scope1Entries.push(entry);
    if (entry.scope === 2) group.scope2Entries.push(entry);
  }

  return groups;
};

/**
 * Find the CBAM installation linked to a product at a facility.
 */
const findInstallationForProduct = async (facilityId, productId) => {
  try {
    const installation = await CbamInstallation.findOne({
      facilityId,
      productIds: productId,
      isActive: true,
    }).lean();
    return installation?._id || null;
  } catch {
    return null;
  }
};

// ─── Main Sync Function ──────────────────────────────────────────

/**
 * Synchronise CBAM Production Records from an approved submission.
 *
 * @param {Object}   submission  - The approved SourceSubmission document
 * @param {ObjectId} approverId  - The user who approved (for submittedBy field)
 * @returns {Object} { synced: number, products: string[], errors: string[] }
 */
export const syncCbamProductionRecords = async (submission, approverId) => {
  const result = { synced: 0, products: [], errors: [] };

  try {
    // 1. Check if the facility has active CBAM products
    const cbamProducts = await CbamProduct.find({
      facilityId: submission.facilityId,
      isActive: true,
    }).lean();

    if (!cbamProducts.length) {
      // No CBAM products → nothing to sync (this is normal for non-CBAM facilities)
      return result;
    }

    // 2. Fetch all entries for this facility and year to summarize the entire CBAM state
    const targetYear = submission.reportingYear || new Date().getFullYear();
    const allEntries = await SourceEntry.find({
      facilityId: submission.facilityId,
      reportingYear: targetYear,
    }).lean();

    if (!allEntries.length) {
      result.errors.push("No source entries found for this submission");
      return result;
    }

    // 3. Group entries by quarter
    const quarterGroups = groupEntriesByQuarter(allEntries);

    // If all entries fall into "Annual" (no month data), treat as single record
    if (quarterGroups.size === 0) {
      result.errors.push("No entries with valid scope 1/2 data");
      return result;
    }

    // Attempt to find a ProductAllocation record active during this submission's period
    const startObj = submission.periodStart ? new Date(submission.periodStart) : new Date(`${submission.reportingYear || new Date().getFullYear()}-01-01`);
    const endObj = submission.periodEnd ? new Date(submission.periodEnd) : new Date(`${submission.reportingYear || new Date().getFullYear()}-12-31`);

    const activeAllocationSet = await ProductAllocation.findOne({
      facilityId: submission.facilityId,
      startDate: { $lte: endObj },
      endDate: { $gte: startObj },
    }).lean();

    // 4. For each CBAM product × quarter, upsert a production record
    for (const product of cbamProducts) {
      for (const [quarter, group] of quarterGroups) {
        try {
          // Resolve allocation context
          let allocationRatio = 0;
          let productVolume = 0;
          let totalVolume = 0;
          let allocItem = null;

          if (activeAllocationSet && activeAllocationSet.allocations) {
            // Total volume across all products from allocations
            totalVolume = activeAllocationSet.allocations.reduce((sum, a) => {
              return sum + (Number(a.quantitySold) || 0) + (Number(a.quantityInternal) || 0) + (Number(a.quantityExported) || 0);
            }, 0);

            allocItem = activeAllocationSet.allocations.find(
              (a) => a.product === product.productName
            );

            if (allocItem) {
              productVolume = (Number(allocItem.quantitySold) || 0) + (Number(allocItem.quantityInternal) || 0) + (Number(allocItem.quantityExported) || 0);
              allocationRatio = totalVolume > 0 ? (productVolume / totalVolume) : 0;
            }
          }

          // Fallback: If ProductAllocation isn't mapped, try calculating from Module C (Production Activity) entries in this quarter
          if (productVolume === 0 || totalVolume === 0) {
            // Find all production_activity entries for the current quarter
            const prodEntries = allEntries.filter(
              (e) => e.section === "Production Activity" && getQuarterFromMonth(e.reportingMonth) === quarter
            );

            // Sum up total consumption across all products in the quarter
            const totalProdActivityVolume = prodEntries.reduce((sum, e) => sum + (Number(e.value) || 0), 0);

            // Sum up consumption for THIS product
            const thisProductEntries = prodEntries.filter((e) => e.activityType === product.productName);
            const thisProductVolume = thisProductEntries.reduce((sum, e) => sum + (Number(e.value) || 0), 0);

            if (totalProdActivityVolume > 0 && thisProductVolume > 0) {
              productVolume = thisProductVolume;
              allocationRatio = thisProductVolume / totalProdActivityVolume;
            } else {
              // Absolute fallback if no data found
              allocationRatio = cbamProducts.length > 0 ? (1 / cbamProducts.length) : 1;
              productVolume = 0;
            }
          }

          // Build emission arrays (scaled by allocated ratio)
          const directEmissions = await mapScope1ToDirectEmissions(
            group.scope1Entries,
            allocationRatio
          );
          const indirectEmissions =
            product.indirectEmissionsRequired !== false
              ? await mapScope2ToIndirectEmissions(group.scope2Entries, allocationRatio)
              : [];

          // Build precursor consumption from product definition (names only — values must be filled)
          const precursorConsumption = (product.precursors || []).map(
            (p) => ({
              precursorName: typeof p === "object" ? (p.precursorName || p.name || "") : p,
              massPerUnitProduct: 0,
              totalMassConsumed: 0,
              unit: "Tonnes",
              specificEmbeddedEmissions: 0,
              totalEmbeddedEmissions: 0,
              origin: "own_installation",
            })
          );

          // Find installation linked to this product
          const installationId = await findInstallationForProduct(
            submission.facilityId,
            product._id
          );

          // Upsert key: facilityId + product + year + quarter
          const filter = {
            facilityId: submission.facilityId,
            cbamProductId: product._id,
            reportingYear: targetYear,
            reportingQuarter: quarter,
          };

          const existingRecord = await CbamProductionRecord.findOne(filter);

          if (existingRecord) {
            // Only update if record is still in draft status
            // (don't overwrite submitted/approved records)
            if (existingRecord.status === "draft") {
              existingRecord.directEmissions = directEmissions;
              existingRecord.indirectEmissions = indirectEmissions;
              // Keep existing precursors if already filled, otherwise set template
              if (!existingRecord.precursorConsumption?.length) {
                existingRecord.precursorConsumption = precursorConsumption;
              }
              if (installationId) {
                existingRecord.cbamInstallationId = installationId;
              }
              existingRecord.productionVolume = productVolume;
              existingRecord.organizationId = submission.organizationId;
              existingRecord.periodStart = submission.periodStart;
              existingRecord.periodEnd = submission.periodEnd;
              await existingRecord.save(); // triggers pre-save totals
              result.synced++;
              result.products.push(product.productName);
            }
          } else {
            // Create new record
            const newRecord = new CbamProductionRecord({
              facilityId: submission.facilityId,
              organizationId: submission.organizationId,
              cbamProductId: product._id,
              cbamInstallationId: installationId || undefined,
              reportingYear: targetYear,
              reportingQuarter: quarter,
              periodStart: submission.periodStart,
              periodEnd: submission.periodEnd,
              productionVolume: productVolume,
              productionUnit: product.productionUnit || "Tonnes",
              directEmissions,
              indirectEmissions,
              precursorConsumption,
              monitoringMethodology: "cbam_methodology",
              status: "draft",
              submittedBy: approverId,
            });

            await newRecord.save(); // triggers pre-save totals
            result.synced++;
            result.products.push(product.productName);
          }
        } catch (err) {
          console.error(
            `[CBAM Auto-Sync] Error for product ${product.productName} / ${quarter}:`,
            err.message
          );
          result.errors.push(
            `${product.productName} (${quarter}): ${err.message}`
          );
        }
      }
    }

    if (result.synced > 0) {
      console.log(
        `[CBAM Auto-Sync] Synced ${result.synced} production record(s) for facility ${submission.facilityId} — products: ${[...new Set(result.products)].join(", ")}`
      );
    }
  } catch (err) {
    console.error("[CBAM Auto-Sync] Top-level error:", err.message);
    result.errors.push(err.message);
  }

  return result;
};
