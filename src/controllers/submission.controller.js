import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { SourceSubmission } from "../models/source-submission.model.js";
import { SourceEntry } from "../models/source-entry.model.js";
import { SourceDocument } from "../models/source-document.model.js";
import { SourceMonthlySummary } from "../models/source-monthly-summary.model.js";
import { Facility } from "../models/facility.model.js";
import Organization from "../models/organization.model.js";
import { ApprovedData } from "../models/approved-data.model.js";
import { v2 as cloudinary } from "cloudinary";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Readable } from "stream";
import { EmissionFactor } from "../models/emission-factor.model.js";
import { syncCbamProductionRecords } from "../utils/cbam-auto-sync.js";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const loadJsonFile = (relativePath) => {
  const filePath = path.resolve(__dirname, relativePath);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
};

const scope1EF = loadJsonFile("../../scope1EF.json");
const scope2EF = loadJsonFile("../../scope2EF.json");
const scope3EF = loadJsonFile("../../scope3EF.json");

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_API_KEY &&
  process.env.CLOUDINARY_CLOUD_API_SECRET
);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_CLOUD_API_KEY,
    api_secret: process.env.CLOUDINARY_CLOUD_API_SECRET,
  });
}

const getUserFacilityId = (user) =>
  user?.facilityId?._id ||
  user?.facilityId ||
  user?.facilities?.[0]?.facilityId?._id ||
  user?.facilities?.[0]?.facilityId;

const resolveFacilityContext = async (req, fallbackFacilityId) => {
  const facilityId = req.body.facilityId || fallbackFacilityId;
  if (!facilityId) {
    return { facility: null };
  }

  if (req.user?.role === "ENERGY_MANAGER") {
    const hasFacilityAccess = Array.isArray(req.user.facilities)
      ? req.user.facilities.some(
          (facility) =>
            facility.facilityId?.toString() === facilityId.toString() ||
            facility.facilityId?._id?.toString() === facilityId.toString()
        )
      : false;
    if (!hasFacilityAccess) {
      throw new ApiError(403, "You do not have access to this facility");
    }
  }

  const facility = await Facility.findById(facilityId);
  if (!facility) {
    return { facility: null };
  }

  return { facility };
};

const parseJsonField = (value, fallback = {}) => {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }
  return value;
};

const normalizeFile = (file) => (Array.isArray(file) ? file[0] : file);
const MAX_SUPPORTING_DOC_SIZE = 5 * 1024 * 1024;

const sanitizeDownloadName = (name) =>
  (name || "supporting-document").replace(/[^a-zA-Z0-9._-]/g, "_");

const buildDownloadUrl = (uploadResult) => uploadResult.secure_url;

const getAllowedDocType = (name, mimetype) => {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  const allowedDocs = ["pdf", "doc", "docx", "xls", "xlsx", "csv"];
  const allowedImages = ["png", "jpg", "jpeg"];
  if (allowedDocs.includes(ext)) return "document";
  if (allowedImages.includes(ext)) return "image";
  if (mimetype?.startsWith("image/")) return "image";
  if (mimetype === "application/pdf") return "document";
  return null;
};

const DEFAULT_DOCUMENT_VERSION = 1;

const toAlphaNumericSegment = (value) =>
  String(value || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();

const getInitialSegment = (value, length = 2) => {
  const cleaned = toAlphaNumericSegment(value);
  if (!cleaned) return "XX";
  return cleaned.slice(0, length);
};

const buildSourceSegment = (value) => {
  const cleaned = toAlphaNumericSegment(value);
  if (!cleaned) return "SOURCE";
  return cleaned.slice(0, 20);
};

const formatDateForFilename = (value) => {
  const date = value ? new Date(value) : new Date();
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return validDate.toISOString().slice(0, 10).replace(/-/g, "");
};

const getDocumentBaseName = (value = "") => {
  if (!value) return "";
  return path.parse(value).name;
};

const normalizeSourceLabelForIndex = (value) => String(value || "").trim();

const getEntryDateValue = (value) => {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const resolveEnergyManagerName = (options) =>
  options.energyManagerName ||
  options.user?.fullName ||
  options.user?.username ||
  "";

const getSerialCounters = (options) => {
  if (!options || typeof options !== "object") return new Map();
  if (!options.serialCounters) {
    options.serialCounters = new Map();
  }
  return options.serialCounters;
};

const getNextSerialVersion = async (context) => {
  const { facilityId, sourceLabel, entryDateString, options } = context;
  if (!facilityId || !sourceLabel || !entryDateString) {
    return DEFAULT_DOCUMENT_VERSION;
  }
  const counters = getSerialCounters(options);
  const key = `${facilityId.toString()}:${sourceLabel}:${entryDateString}`;
  if (counters.has(key)) {
    const nextValue = counters.get(key);
    counters.set(key, nextValue + 1);
    return nextValue;
  }
  const existingCount = await SourceDocument.countDocuments({
    facilityId,
    sourceLabel,
    entryDateString,
  });
  const nextValue = existingCount + 1;
  counters.set(key, nextValue + 1);
  return nextValue;
};

const buildSupportingDocumentBaseName = ({
  facilityName,
  energyManagerName,
  sourceType,
  dateValue,
  version,
}) => {
  const facilitySegment = getInitialSegment(facilityName, 2);
  const nameSegment = getInitialSegment(energyManagerName, 2);
  const sourceSegment = buildSourceSegment(sourceType || energyManagerName || "DOC");
  const dateSegment = formatDateForFilename(dateValue);
  const normalizedVersion =
    Number.isFinite(Number(version)) && Number(version) >= 1
      ? Number(version)
      : DEFAULT_DOCUMENT_VERSION;
  const versionSegment = `v${normalizedVersion}`;
  return `${facilitySegment}_${nameSegment}_${sourceSegment}_${dateSegment}_${versionSegment}`;
};

const resolveSupportingDocumentNameCandidate = (source, file) => {
  const candidate =
    source?.supportingDocument?.originalName ||
    source?.supportingDocument?.name ||
    source?.source ||
    file?.originalname ||
    file?.name ||
    "";
  return getDocumentBaseName(candidate);
};

const uploadToCloudinary = (file, options) =>
  new Promise((resolve, reject) => {
    if (!hasCloudinaryConfig) {
      // Mock upload for demo purposes if Cloudinary is not configured
      return resolve({
        secure_url: "https://demo.url/mock-document.pdf",
        public_id: "mock_" + Date.now(),
        format: "pdf",
        resource_type: "document"
      });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        return resolve(result);
      }
    );
    uploadStream.end(file.data);
  });

const getScopeKeyFromLabel = (scope) => {
  if (scope === "Scope 1") return "scope1";
  if (scope === "Scope 2") return "scope2";
  if (scope === "Scope 3") return "scope3";
  return null;
};

const getScopeNumberFromLabel = (scope) => {
  if (!scope) return null;
  if (scope === "Scope 1" || scope === "scope1" || scope === "scope 1") {
    return 1;
  }
  if (scope === "Scope 2" || scope === "scope2" || scope === "scope 2") {
    return 2;
  }
  if (scope === "Scope 3" || scope === "scope3" || scope === "scope 3") {
    return 3;
  }
  return null;
};

const getScopeLabelFromNumber = (scopeNumber) => {
  if (scopeNumber === 1) return "Scope 1";
  if (scopeNumber === 2) return "Scope 2";
  if (scopeNumber === 3) return "Scope 3";
  return null;
};

const getScopeKeyFromNumber = (scopeNumber) => {
  if (scopeNumber === 1) return "scope1";
  if (scopeNumber === 2) return "scope2";
  if (scopeNumber === 3) return "scope3";
  return null;
};

const parseReportingPeriod = (reportingPeriod) => {
  if (!reportingPeriod) {
    return { reportingPeriod: "", periodStart: null, periodEnd: null };
  }

  if (typeof reportingPeriod === "string" && reportingPeriod.includes("_to_")) {
    const [start, end] = reportingPeriod.split("_to_");
    const startDate = start ? new Date(start) : null;
    const endDate = end ? new Date(end) : null;
    return {
      reportingPeriod,
      periodStart:
        startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
      periodEnd: endDate && !Number.isNaN(endDate.getTime()) ? endDate : null,
    };
  }

  if (
    typeof reportingPeriod === "object" &&
    reportingPeriod.startDate &&
    reportingPeriod.endDate
  ) {
    const startDate = new Date(reportingPeriod.startDate);
    const endDate = new Date(reportingPeriod.endDate);
    const normalized = `${startDate.toISOString().split("T")[0]}_to_${
      endDate.toISOString().split("T")[0]
    }`;
    return {
      reportingPeriod: normalized,
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  return {
    reportingPeriod: String(reportingPeriod),
    periodStart: null,
    periodEnd: null,
  };
};

const normalizeReportingYear = (value) => {
  const year = Number(value);
  if (Number.isFinite(year)) return year;
  return null;
};

const buildStaticAuditorSubmissionExample = () => ({
  _id: "67f000000000000000000001",
  facilityId: {
    _id: "67f0000000000000000000a1",
    facilityName: "Sample Plant",
  },
  organizationId: "67f0000000000000000000b1",
  scope: "Scope 1",
  reportingYear: 2026,
  reportingPeriod: "2026-01-01_to_2026-01-31",
  periodStart: "2026-01-01T00:00:00.000Z",
  periodEnd: "2026-01-31T00:00:00.000Z",
  scope3Module: null,
  importBatchId: null,
  status: "submitted",
  submittedBy: {
    _id: "67f0000000000000000000c1",
    username: "energy.manager",
    email: "energy.manager@example.com",
  },
  reviewedBy: null,
  reviewedAt: null,
  rejectionReason: "",
  createdAt: "2026-01-31T10:15:30.000Z",
  updatedAt: "2026-01-31T10:15:30.000Z",
  scope1Data: {
    reportingYear: 2026,
    reportingPeriod: "2026-01-01_to_2026-01-31",
    sections: [
      {
        name: "Stationary Combustion",
        activities: [
          {
            activityType: "Combustion",
            activityGroup: "Fuel",
            activityCategory: "Natural Gas",
            sources: [
              {
                source: "Natural Gas",
                consumption: 1250,
                unit: "Nm3",
                date: "2026-01-20",
                measurementMethod: "meter",
                assetId: "BOILER-1",
              },
            ],
          },
        ],
      },
    ],
  },
  scope2Data: {
    reportingYear: 2026,
    reportingPeriod: "2026-01-01_to_2026-01-31",
    sections: [],
  },
  scope3Data: {
    reportingYear: 2026,
    reportingPeriod: "2026-01-01_to_2026-01-31",
    scope3Module: null,
    sections: [],
  },
});

const extractSubmissionMeta = (payloads) => {
  const firstPayload = payloads.find((item) => item && item.payload) || {};
  const reportingYear = normalizeReportingYear(
    firstPayload.payload?.reportingYear
  );
  const reportingPeriod = firstPayload.payload?.reportingPeriod || "";
  const parsedPeriod = parseReportingPeriod(reportingPeriod);
  const scope3Module =
    payloads.find((item) => item.scope === "Scope 3")?.payload?.scope3Module ||
    null;
  const importBatchId =
    payloads.map((item) => item.payload?.importBatchId).find(Boolean) || null;

  return {
    reportingYear,
    reportingPeriod: parsedPeriod.reportingPeriod,
    periodStart: parsedPeriod.periodStart,
    periodEnd: parsedPeriod.periodEnd,
    scope3Module,
    importBatchId,
  };
};

const normalizeBulkValue = (value) =>
  value === undefined || value === null ? "" : String(value).trim();

const isServiceSectorIndustry = (industry) =>
  String(industry || "")
    .trim()
    .toLowerCase() === "service sector";

const shouldAutoApproveSubmission = async (user, organizationId) => {
  const isOfficeFlowUser = ["ENERGY_MANAGER", "OFFICE_ADMIN"].includes(
    user?.role
  );
  if (!isOfficeFlowUser) return false;

  const resolvedOrgId =
    organizationId || user?.organizationId?._id || user?.organizationId;
  if (!resolvedOrgId) return true;

  const org = await Organization.findById(resolvedOrgId)
    .select("industry")
    .lean();

  return isServiceSectorIndustry(org?.industry);
};

const buildBulkImportFingerprint = (payloads = []) => {
  const canonical = payloads
    .map(({ scope, payload }) => ({
      scope: scope || "",
      sections: (payload?.sections || []).map((section) => ({
        section: normalizeBulkValue(section?.name || section?.section),
        activities: (section?.activities || []).map((activity) => ({
          type: normalizeBulkValue(activity?.activityType),
          group: normalizeBulkValue(activity?.activityGroup),
          category: normalizeBulkValue(activity?.activityCategory),
          sources: (activity?.sources || []).map((source) => ({
            source: normalizeBulkValue(source?.source),
            consumption: normalizeBulkValue(source?.consumption),
            unit: normalizeBulkValue(source?.unit),
            date: normalizeBulkValue(source?.date),
            measurementMethod: normalizeBulkValue(source?.measurementMethod),
            assetId: normalizeBulkValue(source?.assetId),
          })),
        })),
      })),
    }))
    .sort((a, b) => a.scope.localeCompare(b.scope));

  const raw = JSON.stringify(canonical);
  return crypto.createHash("sha256").update(raw).digest("hex");
};

const buildEntriesFromScope = ({
  scope,
  scopeData,
  submissionId,
  facilityId,
  organizationId,
}) => {
  const entries = [];
  const documents = [];
  const documentMap = new Map();
  const scopeNumber = getScopeNumberFromLabel(scope);

  if (!scopeNumber || !scopeData || !Array.isArray(scopeData.sections)) {
    return { entries, documents };
  }

  scopeData.sections.forEach((section, sectionIndex) => {
    const activities = Array.isArray(section.activities)
      ? section.activities
      : [];
    activities.forEach((activity, activityIndex) => {
      const sources = Array.isArray(activity.sources) ? activity.sources : [];
      sources.forEach((source, sourceIndex) => {
        let supportingDocumentId;
        const doc = source?.supportingDocument;
        if (doc) {
          const docKey =
            doc.uploadKey ||
            doc.publicId ||
            doc.url ||
            `${sectionIndex}-${activityIndex}-${sourceIndex}`;
          if (documentMap.has(docKey)) {
            supportingDocumentId = documentMap.get(docKey)._id;
          } else {
            const docRecord = {
              _id: new mongoose.Types.ObjectId(),
              submissionId,
              facilityId,
              organizationId,
              scope: scopeNumber,
              url: typeof doc === "string" ? doc : doc.url,
              publicId: typeof doc === "object" ? doc.publicId : undefined,
              originalName:
                typeof doc === "object"
                  ? doc.originalName || doc.name
                  : undefined,
              format: typeof doc === "object" ? doc.format : undefined,
              resourceType:
                typeof doc === "object" ? doc.resourceType : undefined,
              uploadedAt:
                typeof doc === "object" && doc.uploadedAt
                  ? new Date(doc.uploadedAt)
                  : undefined,
              version:
                typeof doc === "object" &&
                Number.isFinite(Number(doc.version))
                  ? Number(doc.version)
                  : DEFAULT_DOCUMENT_VERSION,
              sourceLabel:
                typeof doc === "object"
                  ? doc.sourceLabel || doc.source || ""
                  : "",
              entryDate:
                typeof doc === "object" && doc.entryDate
                  ? new Date(doc.entryDate)
                  : undefined,
              entryDateString:
                typeof doc === "object" && doc.entryDateString
                  ? doc.entryDateString
                  : typeof doc === "object" && doc.entryDate
                    ? formatDateForFilename(doc.entryDate)
                    : undefined,
            };
            documents.push(docRecord);
            documentMap.set(docKey, docRecord);
            supportingDocumentId = docRecord._id;
          }
        }

        const entryDate = source?.date ? new Date(source.date) : null;
        const reportingYear =
          normalizeReportingYear(scopeData.reportingYear) ||
          (entryDate && !Number.isNaN(entryDate.getTime())
            ? entryDate.getFullYear()
            : null);
        const reportingMonth =
          entryDate && !Number.isNaN(entryDate.getTime())
            ? entryDate.getMonth() + 1
            : null;
        const value = Number(source?.consumption);
        const gcv = Number(source?.gcv);
        const assetEfficiency = Number(source?.assetEfficiency);
        const emissionFactor = Number(source?.emissionFactor);
        const carbonContent = Number(source?.carbonContent);
        const operatingHours = Number(source?.operatingHours);
        const capacityUtilization = Number(source?.capacityUtilization);
        const refillAmount = Number(source?.refillAmount);
        const totalGenerationKwh = Number(source?.totalGenerationKwh);
        const selfConsumptionKwh = Number(source?.selfConsumptionKwh);
        const exportToGridKwh = Number(source?.exportToGridKwh);
        const importFromGridKwh = Number(source?.importFromGridKwh);
        const renewablePurchasedKwh = Number(source?.renewablePurchasedKwh);
        const displayEmissionFactor = Number(source?.displayEmissionFactor);

        entries.push({
          submissionId,
          facilityId,
          organizationId,
          scope: scopeNumber,
          section: section?.name || section?.section || "",
          activityType: activity?.activityType || "",
          activityGroup: activity?.activityGroup || "",
          activityCategory: activity?.activityCategory || "",
          assetId: source?.assetId || "",
          gcv: Number.isFinite(gcv) ? gcv : null,
          gcvUnit: source?.gcvUnit || "",
          assetEfficiency: Number.isFinite(assetEfficiency)
            ? assetEfficiency
            : null,
          emissionFactor: Number.isFinite(emissionFactor)
            ? emissionFactor
            : null,
          carbonContent: Number.isFinite(carbonContent) ? carbonContent : null,
          operatingHours: Number.isFinite(operatingHours)
            ? operatingHours
            : null,
          capacityUtilization: Number.isFinite(capacityUtilization)
            ? capacityUtilization
            : null,
          refillAmount: Number.isFinite(refillAmount) ? refillAmount : null,
          totalGenerationKwh: Number.isFinite(totalGenerationKwh) ? totalGenerationKwh : null,
          selfConsumptionKwh: Number.isFinite(selfConsumptionKwh) ? selfConsumptionKwh : null,
          exportToGridKwh: Number.isFinite(exportToGridKwh) ? exportToGridKwh : null,
          importFromGridKwh: Number.isFinite(importFromGridKwh) ? importFromGridKwh : null,
          netMeteringType: source?.netMeteringType || "",
          renewablePurchasedKwh: Number.isFinite(renewablePurchasedKwh) ? renewablePurchasedKwh : null,
          displayEmissionFactor: Number.isFinite(displayEmissionFactor) ? displayEmissionFactor : null,
          dataStatus: source?.dataStatus || "",
          source: source?.source || "",
          value: Number.isFinite(value) ? value : null,
          unit: source?.unit || "",
          measurementMethod: source?.measurementMethod || "",
          date:
            entryDate && !Number.isNaN(entryDate.getTime()) ? entryDate : null,
          reportingYear,
          reportingMonth,
          scope3Module:
            scope === "Scope 3"
              ? scopeData.scope3Module ||
                section?.scope3Module ||
                activity?.scope3Module ||
                null
              : null,
          importedFrom: scopeData.importedFrom || null,
          importedAt: scopeData.importedAt
            ? new Date(scopeData.importedAt)
            : null,
          importBatchId: scopeData.importBatchId || null,
          supportingDocumentId,
          sectionIndex,
          activityIndex,
          sourceIndex,
        });
      });
    });
  });

  return { entries, documents };
};

const calculateEntryEmission = (entry) => {
  const scopeLabel = getScopeLabelFromNumber(entry.scope);
  if (!scopeLabel) return null;

  // Use user-provided EF if present (for entries that already have it stored)
  let factor = entry.emissionFactor;

  // Otherwise look up from JSON
  if (!Number.isFinite(factor)) {
    factor = getEmissionFactor(
      scopeLabel,
      entry.activityType,
      entry.activityGroup,
      entry.activityCategory,
      entry.source,
      entry.unit
    );
  }

  const consumption = Number(entry.value);
  if (!Number.isFinite(consumption) || !Number.isFinite(factor)) {
    return null;
  }
  return consumption * factor;
};

const calculateEntryEmissionAsync = async (entry) => {
  const scopeLabel = getScopeLabelFromNumber(entry.scope);
  if (!scopeLabel) return null;

  // Use user-provided EF if present
  let factor = entry.emissionFactor;

  // Otherwise look up from DB (then JSON fallback)
  if (!Number.isFinite(factor)) {
    factor = await getEmissionFactorAsync(
      scopeLabel,
      entry.activityType,
      entry.activityGroup,
      entry.activityCategory,
      entry.source,
      entry.unit,
      entry.section
    );
  }

  const consumption = Number(entry.value);

  // Warn when no emission factor found for consumed (not generated) entries
  if (!Number.isFinite(factor)) {
    const isGenerated =
      normalizeEfText(entry.activityType).includes("generated") ||
      normalizeEfText(entry.activityGroup).includes("captive") ||
      normalizeEfText(entry.activityGroup).includes("wind") ||
      normalizeEfText(entry.activityGroup).includes("solar");
    if (!isGenerated) {
      console.warn(
        `[GHG] No emission factor found for consumed entry – ` +
          `scope=${scopeLabel}, source="${entry.source || ""}", ` +
          `type="${entry.activityType || ""}", group="${entry.activityGroup || ""}", ` +
          `unit="${entry.unit || ""}", value=${entry.value ?? ""}`
      );
    }
    return null;
  }

  if (!Number.isFinite(consumption)) {
    return null;
  }
  return consumption * factor;
};

/**
 * After SourceEntry.insertMany(), calculate and persist emission factors
 * on entries that don't already have one.  This ensures the emissionFactor
 * field is non-null so the UI can display it and downstream calculations
 * (approval, reports) work without a second DB lookup.
 */
const persistEmissionFactors = async (insertedEntryIds) => {
  if (!insertedEntryIds?.length) return;

  const entries = await SourceEntry.find({
    _id: { $in: insertedEntryIds },
    emissionFactor: null,
    value: { $gt: 0 },
  }).lean();

  const ops = [];
  for (const entry of entries) {
    const scopeLabel = getScopeLabelFromNumber(entry.scope);
    if (!scopeLabel) continue;

    const factor = await getEmissionFactorAsync(
      scopeLabel,
      entry.activityType,
      entry.activityGroup,
      entry.activityCategory,
      entry.source,
      entry.unit,
      entry.section
    );

    if (Number.isFinite(factor)) {
      ops.push({
        updateOne: {
          filter: { _id: entry._id },
          update: { $set: { emissionFactor: factor } },
        },
      });
    }
  }

  if (ops.length) {
    await SourceEntry.bulkWrite(ops);
    console.log(
      `[GHG] Persisted emission factors for ${ops.length}/${entries.length} entries`
    );
  }
};

const updateMonthlySummaries = async (entries) => {
  const summaryMap = new Map();

  for (const entry of entries) {
    if (!entry.reportingYear || !entry.reportingMonth) {
      continue;
    }
    const key = `${entry.organizationId}_${entry.facilityId}_${entry.reportingYear}_${entry.reportingMonth}`;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        organizationId: entry.organizationId,
        facilityId: entry.facilityId,
        year: entry.reportingYear,
        month: entry.reportingMonth,
        scope1: 0,
        scope2: 0,
        scope3: 0,
        total: 0,
      });
    }

    const emission = await calculateEntryEmissionAsync(entry);
    if (!Number.isFinite(emission)) {
      continue;
    }

    const summary = summaryMap.get(key);
    if (entry.scope === 1) summary.scope1 += emission;
    if (entry.scope === 2) summary.scope2 += emission;
    if (entry.scope === 3) summary.scope3 += emission;
    summary.total += emission;
  }

  await Promise.all(
    Array.from(summaryMap.values()).map((summary) =>
      SourceMonthlySummary.updateOne(
        {
          organizationId: summary.organizationId,
          facilityId: summary.facilityId,
          year: summary.year,
          month: summary.month,
        },
        {
          $inc: {
            scope1: summary.scope1,
            scope2: summary.scope2,
            scope3: summary.scope3,
            total: summary.total,
          },
        },
        { upsert: true }
      )
    )
  );
};

const buildScopeDataFromEntries = ({ entries, documentsById, submission }) => {
  const scopeData = {
    scope1Data: {},
    scope2Data: {},
    scope3Data: {},
  };

  if (!Array.isArray(entries) || entries.length === 0) {
    return scopeData;
  }

  const entriesByScope = entries.reduce((acc, entry) => {
    const scopeKey = getScopeKeyFromNumber(entry.scope);
    if (!scopeKey) return acc;
    if (!acc[scopeKey]) acc[scopeKey] = [];
    acc[scopeKey].push(entry);
    return acc;
  }, {});

  Object.entries(entriesByScope).forEach(([scopeKey, scopeEntries]) => {
    const sorted = scopeEntries.sort((a, b) => {
      if (a.sectionIndex !== b.sectionIndex)
        return a.sectionIndex - b.sectionIndex;
      if (a.activityIndex !== b.activityIndex)
        return a.activityIndex - b.activityIndex;
      return a.sourceIndex - b.sourceIndex;
    });

    const scopeMeta = sorted[0];
    const sectionsMap = new Map();
    const scopeObject = {
      reportingYear: scopeMeta?.reportingYear
        ? String(scopeMeta.reportingYear)
        : submission?.reportingYear
          ? String(submission.reportingYear)
          : "",
      reportingPeriod: submission?.reportingPeriod || "",
      importedFrom: scopeMeta?.importedFrom || null,
      importedAt: scopeMeta?.importedAt
        ? scopeMeta.importedAt.toISOString()
        : null,
      importBatchId: scopeMeta?.importBatchId || null,
      scope3Module: scopeMeta?.scope3Module || submission?.scope3Module || null,
      sections: [],
    };

    sorted.forEach((entry) => {
      const sectionKey = entry.sectionIndex ?? 0;
      if (!sectionsMap.has(sectionKey)) {
        sectionsMap.set(sectionKey, {
          name: entry.section || "",
          scope3Module: scopeObject.scope3Module,
          activities: [],
          _activityMap: new Map(),
        });
      }

      const section = sectionsMap.get(sectionKey);
      const activityKey = entry.activityIndex ?? 0;
      if (!section._activityMap.has(activityKey)) {
        section._activityMap.set(activityKey, {
          activityType: entry.activityType || "",
          activityGroup: entry.activityGroup || "",
          activityCategory: entry.activityCategory || "",
          scope3Module: entry.scope3Module || scopeObject.scope3Module || null,
          sources: [],
        });
      }

      const activity = section._activityMap.get(activityKey);
      const doc = entry.supportingDocumentId
        ? documentsById.get(String(entry.supportingDocumentId))
        : null;

      activity.sources.push({
        source: entry.source || "",
        consumption:
          entry.value !== null && entry.value !== undefined ? entry.value : "",
        unit: entry.unit || "",
        measurementMethod: entry.measurementMethod || "",
        date: entry.date ? entry.date.toISOString() : "",
        assetId: entry.assetId || "",
        gcv: entry.gcv ?? null,
        gcvUnit: entry.gcvUnit || "",
        assetEfficiency: entry.assetEfficiency ?? null,
        emissionFactor: entry.emissionFactor ?? null,
        carbonContent: entry.carbonContent ?? null,
        operatingHours: entry.operatingHours ?? null,
        capacityUtilization: entry.capacityUtilization ?? null,
        refillAmount: entry.refillAmount ?? null,
        totalGenerationKwh: entry.totalGenerationKwh ?? null,
        selfConsumptionKwh: entry.selfConsumptionKwh ?? null,
        exportToGridKwh: entry.exportToGridKwh ?? null,
        importFromGridKwh: entry.importFromGridKwh ?? null,
        netMeteringType: entry.netMeteringType || "",
        renewablePurchasedKwh: entry.renewablePurchasedKwh ?? null,
        displayEmissionFactor: entry.displayEmissionFactor ?? null,
        dataStatus: entry.dataStatus || "",
        supportingDocument: doc
          ? {
              url: doc.url,
              publicId: doc.publicId,
              originalName: doc.originalName,
              format: doc.format,
              resourceType: doc.resourceType,
              uploadedAt: doc.uploadedAt,
                  sourceLabel: doc.sourceLabel,
                  entryDate: doc.entryDate,
                  entryDateString: doc.entryDateString,
                version: doc.version || DEFAULT_DOCUMENT_VERSION,
            }
          : null,
      });
    });

    sectionsMap.forEach((section) => {
      section.activities = Array.from(section._activityMap.values());
      delete section._activityMap;
      scopeObject.sections.push(section);
    });

    scopeData[`${scopeKey}Data`] = scopeObject;
  });

  return scopeData;
};

const fetchEntriesAndDocuments = async (submissionId) => {
  const entries = await SourceEntry.find({ submissionId }).lean();
  const documentIds = entries
    .map((entry) => entry.supportingDocumentId)
    .filter(Boolean);
  const documents = documentIds.length
    ? await SourceDocument.find({ _id: { $in: documentIds } }).lean()
    : [];
  const documentsById = new Map(documents.map((doc) => [String(doc._id), doc]));
  return { entries, documentsById };
};

const hydrateSubmissionScopes = async (submission) => {
  const { entries, documentsById } = await fetchEntriesAndDocuments(
    submission._id
  );
  const scopeData = buildScopeDataFromEntries({
    entries,
    documentsById,
    submission,
  });
  return {
    scope1Data: ensureSignedDownloadUrls(scopeData.scope1Data),
    scope2Data: ensureSignedDownloadUrls(scopeData.scope2Data),
    scope3Data: ensureSignedDownloadUrls(scopeData.scope3Data),
    entries,
  };
};

const ensureApprovedDataForSubmission = async (submission, approverId) => {
  const existingApprovedData = await ApprovedData.findOne({
    submissionId: submission._id,
  });

  if (existingApprovedData) return;

  const { entries, documentsById } = await fetchEntriesAndDocuments(
    submission._id
  );
  const approvedDataDetails = await buildApprovedDataFromEntries({ entries });
  const scopePayload = buildScopeDataFromEntries({
    entries,
    documentsById,
    submission,
  });

  await ApprovedData.create({
    submissionId: submission._id,
    facilityId: submission.facilityId,
    organizationId: submission.organizationId,
    submittedBy: submission.submittedBy,
    approvedBy: approverId,
    approvedAt: submission.reviewedAt || new Date(),
    scope: submission.scope,
    data: {},
    scope1Data: scopePayload.scope1Data || {},
    scope2Data: scopePayload.scope2Data || {},
    scope3Data: scopePayload.scope3Data || {},
    detailedBreakdown: approvedDataDetails.detailedBreakdown || [],
    totalEmissions: approvedDataDetails.totalEmissions || 0,
    topSource: approvedDataDetails.topSource || "",
  });

  syncCbamProductionRecords(submission, approverId).catch((err) =>
    console.error("[CBAM Auto-Sync] Background error:", err.message)
  );
};

const getScopeDataFromSubmission = (submission, scopeKey) => {
  if (scopeKey === "scope1") return submission.scope1Data;
  if (scopeKey === "scope2") return submission.scope2Data;
  if (scopeKey === "scope3") return submission.scope3Data;
  return null;
};

const mergeScopeData = (existing, incoming) => {
  const incomingSections = incoming?.sections;
  const existingSections = existing?.sections;
  if (!Array.isArray(incomingSections) || incomingSections.length === 0) {
    return existing || incoming || {};
  }
  if (!Array.isArray(existingSections) || existingSections.length === 0) {
    return incoming;
  }
  return {
    ...existing,
    reportingYear: incoming.reportingYear || existing.reportingYear,
    reportingPeriod: incoming.reportingPeriod || existing.reportingPeriod,
    importedFrom: incoming.importedFrom || existing.importedFrom || null,
    importedAt: incoming.importedAt || existing.importedAt || null,
    scope3Module: incoming.scope3Module ?? existing.scope3Module ?? null,
    importBatchId: incoming.importBatchId || existing.importBatchId || null,
    sections: [...existingSections, ...incomingSections],
  };
};

const getDocFromScopeData = (
  scopeData,
  sectionIndex,
  activityIndex,
  sourceIndex
) => {
  if (!scopeData?.sections?.length) return null;
  const section = scopeData.sections?.[sectionIndex];
  const activity = section?.activities?.[activityIndex];
  const source = activity?.sources?.[sourceIndex];
  return source?.supportingDocument || null;
};

const getFilenameFromUrl = (url) => {
  if (!url) return "supporting-document";
  const parts = url.split("/");
  const last = parts[parts.length - 1] || "";
  const name = last.split("?")[0];
  return name || "supporting-document";
};

const getResourceTypeFromUrl = (url) => {
  if (!url) return undefined;
  const lower = url.toLowerCase();
  if (
    lower.endsWith(".pdf") ||
    lower.endsWith(".doc") ||
    lower.endsWith(".docx")
  ) {
    return "raw";
  }
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg")
  ) {
    return "image";
  }
  if (url.includes("/raw/")) return "raw";
  if (url.includes("/video/")) return "video";
  if (url.includes("/image/")) return "image";
  return undefined;
};

const getResourceTypeFromFilename = (name) => {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  if (!ext) return undefined;
  const rawExts = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "txt"];
  const videoExts = ["mp4", "mov", "avi", "mkv", "webm"];
  const imageExts = ["png", "jpg", "jpeg", "gif", "webp"];
  if (rawExts.includes(ext)) return "raw";
  if (videoExts.includes(ext)) return "video";
  if (imageExts.includes(ext)) return "image";
  return undefined;
};

const getFormatFromFilename = (name) => {
  const ext = (name || "").split(".").pop()?.toLowerCase();
  return ext || undefined;
};

const buildSignedDownloadUrl = (doc) => {
  if (doc?.downloadUrl) return doc.downloadUrl;
  if (!doc?.publicId) return doc?.url;
  if (!hasCloudinaryConfig) {
    return doc?.url;
  }
  const filenameType = getResourceTypeFromFilename(doc.originalName);
  const resourceType =
    filenameType ||
    getResourceTypeFromUrl(doc.url) ||
    doc.resourceType ||
    "image";
  if (resourceType === "raw") {
    return doc.url;
  }
  const format = doc.format || getFormatFromFilename(doc.originalName);
  try {
    return cloudinary.url(doc.publicId, {
      secure: true,
      resource_type: resourceType,
      type: "upload",
      sign_url: true,
      ...(doc.originalName ? { attachment: doc.originalName } : {}),
      ...(format ? { format } : {}),
    });
  } catch {
    return doc?.url;
  }
};

const ensureSignedDownloadUrls = (scopeData) => {
  if (!scopeData || !Array.isArray(scopeData.sections)) {
    return scopeData;
  }

  return {
    ...scopeData,
    sections: scopeData.sections.map((section) => ({
      ...section,
      activities: (section.activities || []).map((activity) => ({
        ...activity,
        sources: (activity.sources || []).map((source) => {
          const doc = source?.supportingDocument;
          if (doc && typeof doc === "object") {
            const signedUrl = buildSignedDownloadUrl(doc);
            if (signedUrl) {
              return {
                ...source,
                supportingDocument: {
                  ...doc,
                  downloadUrl: signedUrl,
                },
              };
            }
          }
          return source;
        }),
      })),
    })),
  };
};

const getEmissionFactor = (scope, type, group, category, source, unit) => {
  // Primary: look up from JSON files (synchronous, in-memory)
  const efData =
    scope === "Scope 1"
      ? scope1EF
      : scope === "Scope 2"
        ? scope2EF
        : scope === "Scope 3"
          ? scope3EF
          : {};
  if (!efData || !type || !group || !source || !unit) return null;

  const resolveEntry = (entry) => {
    if (typeof entry === "number") return entry;
    if (entry && typeof entry === "object") {
      const value =
        entry.value ?? entry.factor ?? entry.emissionFactor ?? entry.default;
      return typeof value === "number" ? value : null;
    }
    return null;
  };

  // Path 1: with categories key (Scope 1 / Scope 3 structure)
  if (category) {
    const entry =
      efData?.[type]?.[group]?.categories?.[category]?.[source]?.[unit];
    const result = resolveEntry(entry);
    if (result !== null) return result;
  }

  // Path 2: without categories key (Scope 2 structure: type → group → source → unit)
  const directEntry = efData?.[type]?.[group]?.[source]?.[unit];
  const directResult = resolveEntry(directEntry);
  if (directResult !== null) return directResult;

  return null;
};

const normalizeEfText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeSourceKey = (value) =>
  normalizeEfText(value).replace(/[^a-z0-9]/g, "");

const UNIT_ALIASES = {
  kg: "kg",
  kgs: "kg",
  kilogram: "kg",
  kilograms: "kg",
  tonne: "tonnes",
  tonnes: "tonnes",
  ton: "tonnes",
  tons: "tonnes",
  t: "tonnes",
  litre: "litres",
  litres: "litres",
  liter: "litres",
  liters: "litres",
  l: "litres",
  "cubic metre": "cubic metres",
  "cubic metres": "cubic metres",
  "cubic meter": "cubic metres",
  "cubic meters": "cubic metres",
  m3: "cubic metres",
  "million litre": "million litres",
  "million litres": "million litres",
  kwh: "kWh",
  mwh: "MWh",
  gwh: "GWh",
  km: "km",
  kilometre: "km",
  kilometres: "km",
  mile: "miles",
  miles: "miles",
  units: "kWh",
  unit: "kWh",
  night: "night",
  nights: "night",
  "room night": "night",
  "room nights": "night",
};

const canonicalUnit = (unit) => {
  const normalized = normalizeEfText(unit).replace(/^per\s+/, "");
  return UNIT_ALIASES[normalized] || normalized;
};

const convertFactorUnit = (value, fromUnit, toUnit) => {
  if (!Number.isFinite(value)) return null;

  const from = canonicalUnit(fromUnit);
  const to = canonicalUnit(toUnit);

  if (!from || !to) return null;
  if (from === to) return value;

  const conversion = {
    "kg->tonnes": 1000,
    "tonnes->kg": 1 / 1000,
    "kWh->MWh": 1000,
    "MWh->kWh": 1 / 1000,
    "kWh->GWh": 1000000,
    "GWh->kWh": 1 / 1000000,
    "MWh->GWh": 1000,
    "GWh->MWh": 1 / 1000,
    "litres->cubic metres": 1000,
    "cubic metres->litres": 1 / 1000,
    "million litres->litres": 1 / 1000000,
    "litres->million litres": 1000000,
    "million litres->cubic metres": 1000,
    "cubic metres->million litres": 1 / 1000,
    "km->miles": 1.60934,
    "miles->km": 1 / 1.60934,
  };

  const multiplier = conversion[`${from}->${to}`];
  if (!Number.isFinite(multiplier)) return null;
  return value * multiplier;
};

const getSourceCandidates = (source, context = {}) => {
  const base = String(source || "").trim();
  const candidates = [];
  if (base) candidates.push(base);

  const contextualValues = [
    context.type,
    context.group,
    context.category,
    context.section,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  candidates.push(...contextualValues);

  if (!candidates.length) return [];

  // Comprehensive alias map for Indian industry fuel terms.
  // DB already has alias records; this map adds a secondary safety net
  // for variations that may not be seeded yet.
  const aliasMap = {
    coal: ["Coal", "Bituminous Coal", "Indian Coal"],
    importedcoal: ["Imported Coal", "Bituminous Coal"],
    indiancoal: ["Indian Coal", "Bituminous Coal"],
    bituminouscoal: ["Bituminous Coal"],
    subbituminouscoal: ["Sub-bituminous Coal"],
    lignite: ["Lignite"],
    cokeovencoke: ["Coke Oven Coke"],
    petroleumcoke: ["Petroleum Coke", "Pet Coke"],
    petcoke: ["Petroleum Coke"],
    diesel: ["Diesel"],
    hsd: ["Diesel", "HSD", "High Speed Diesel"],
    highspeeddiesel: ["Diesel", "HSD"],
    dieseloil: ["Diesel"],
    petrol: ["Petrol"],
    gasoline: ["Petrol", "Gasoline"],
    ms: ["Petrol", "Motor Spirit"],
    motorspirit: ["Petrol"],
    furnaceoil: ["Furnace Oil"],
    fo: ["Furnace Oil", "FO"],
    heavyfueloil: ["Furnace Oil", "Heavy Fuel Oil"],
    hfo: ["Furnace Oil"],
    lshs: ["Furnace Oil", "LSHS"],
    kerosene: ["Kerosene"],
    sko: ["Kerosene", "SKO", "Superior Kerosene Oil"],
    superiorkeroseneoil: ["Kerosene"],
    naphtha: ["Naphtha"],
    atf: ["ATF", "Aviation Turbine Fuel"],
    aviationturbinefuel: ["ATF"],
    naturalgas: ["Natural Gas"],
    cng: ["CNG", "Natural Gas"],
    png: ["Natural Gas", "PNG", "Piped Natural Gas"],
    pipednaturalgas: ["Natural Gas"],
    refinerygas: ["Refinery Gas"],
    lpg: ["LPG", "Liquefied Petroleum Gas"],
    liquefiedpetroleumgas: ["LPG"],
    firewood: ["Firewood"],
    wood: ["Firewood", "Wood"],
    woodchips: ["Firewood", "Wood Chips"],
    bagasse: ["Bagasse"],
    cropresidues: ["Crop Residues"],
    ricehusk: ["Crop Residues", "Rice Husk"],
    nrsw: ["NRSW", "Crop Residues"],
    biologicalsludge: ["Biological Sludge", "Crop Residues"],
    deinkingsludge: ["De-inking Sludge", "Crop Residues"],
    agriculturalwaste: ["Crop Residues", "Agricultural Waste"],
    straw: ["Straw", "Crop Residues"],
    marinefueloil: ["Marine Fuel Oil"],
    aviationgasoline: ["Aviation Gasoline"],
    gridelectricity: ["Grid Electricity"],
    openaccess: ["Open Access", "Grid Electricity"],
    opensource: ["Open Source", "Grid Electricity"],
    purchasedelectricity: ["Grid Electricity", "Purchased Electricity"],
  };

  const withoutImportedPrefix = base
    .replace(/^(imported|import)\s+/i, "")
    .trim();
  if (withoutImportedPrefix && withoutImportedPrefix !== base) {
    candidates.push(withoutImportedPrefix);
  }

  const normalized = normalizeSourceKey(base);
  const normalizedWithoutPrefix = normalizeSourceKey(withoutImportedPrefix);
  const aliases = [
    ...(aliasMap[normalized] || []),
    ...(aliasMap[normalizedWithoutPrefix] || []),
  ];

  contextualValues.forEach((value) => {
    aliases.push(...(aliasMap[normalizeSourceKey(value)] || []));
  });

  candidates.push(...aliases);

  return [...new Set(candidates)];
};

const PRIORITIZED_CANONICAL_SOURCE_MAP = {
  diesel: ["Gas/Diesel oil"],
  hsd: ["Gas/Diesel oil"],
  highspeeddiesel: ["Gas/Diesel oil"],
  dieseloil: ["Gas/Diesel oil"],
  kerosene: ["Other kerosene"],
  superiorkeroseneoil: ["Other kerosene"],
  lpg: ["Liquified Petroleum Gases"],
  liquefiedpetroleumgas: ["Liquified Petroleum Gases"],
  petroleumcoke: ["Petroleum coke"],
  petcoke: ["Petroleum coke"],
  coalind: ["Other bituminous coal"],
  coalimp: ["Coking coal"],
  importedcoal: ["Coking coal"],
  bituminouscoal: ["Other bituminous coal"],
};

const withPrioritizedCanonicalSources = (sourceCandidates = [], source = "") => {
  const canonicalKey = normalizeSourceKey(source);
  const prioritized = PRIORITIZED_CANONICAL_SOURCE_MAP[canonicalKey] || [];
  return [...new Set([...prioritized, ...sourceCandidates])];
};

const isGridElectricityRow = (type, group, category, source) => {
  const normalizedType = normalizeEfText(type);
  const normalizedGroup = normalizeEfText(group);
  const normalizedCategory = normalizeEfText(category);
  const normalizedSource = normalizeEfText(source);

  // Explicitly NOT grid: generated entries (Captive Power, Wind, Solar)
  const isGenerated =
    normalizedType.includes("generated") ||
    normalizedGroup.includes("captive") ||
    normalizedGroup.includes("wind") ||
    normalizedGroup.includes("solar");
  if (isGenerated) return false;

  const indicatesGrid =
    normalizedGroup.includes("grid") ||
    normalizedSource.includes("grid electricity") ||
    normalizedSource.includes("open access") ||
    normalizedSource.includes("open source") ||
    normalizedGroup.includes("open access") ||
    normalizedGroup.includes("open source");
  const indicatesElectricity =
    normalizedType.includes("electricity") ||
    normalizedCategory.includes("electricity") ||
    normalizedSource.includes("electricity");
  const isPurchased = normalizedType.includes("purchased");
  const isConsumed = normalizedType.includes("consumed");

  // Consumed/Auxiliary electricity is from the grid
  return indicatesGrid || (isPurchased && indicatesElectricity) || isConsumed;
};

const getDefaultScope2SourceCandidates = (type) => {
  const normalizedType = normalizeEfText(type);
  if (
    normalizedType.includes("electricity") ||
    normalizedType.includes("consumed") ||
    normalizedType.includes("purchased")
  ) {
    return ["Grid Electricity", "Electricity: UK"];
  }
  if (normalizedType.includes("heat") || normalizedType.includes("steam")) {
    return [
      "Purchased Heat (Coal-based Boiler)",
      "Purchased Steam (Natural Gas Boiler)",
      "Onsite heat and steam",
      "District heat and steam",
    ];
  }
  return [
    "Grid Electricity",
    "Electricity: UK",
    "Purchased Heat (Coal-based Boiler)",
    "Purchased Steam (Natural Gas Boiler)",
    "Onsite heat and steam",
    "District heat and steam",
  ];
};

/**
 * Async version that checks the EmissionFactor DB collection first,
 * then falls back to the JSON-based lookup.
 */
const getEmissionFactorAsync = async (
  scope,
  type,
  group,
  category,
  source,
  unit,
  section
) => {
  if (!scope || !unit) return null;
  const requestedUnit = canonicalUnit(unit);
  if (!requestedUnit) return null;

  try {
    const normalizedSource = String(source || "").trim();
    const sourceCandidates = getSourceCandidates(normalizedSource, {
      type,
      group,
      category,
      section,
    });
    const hasConcreteSource =
      sourceCandidates.length > 0 &&
      !["-", "na", "n/a", "none"].includes(
        normalizeEfText(sourceCandidates[0])
      );

    if (
      !hasConcreteSource &&
      scope === "Scope 2" &&
      isGridElectricityRow(type, group, category, normalizedSource)
    ) {
      sourceCandidates.push(...getDefaultScope2SourceCandidates(type));
    }

    const uniqueSourceCandidates = withPrioritizedCanonicalSources(
      [...new Set(sourceCandidates.filter(Boolean))],
      normalizedSource
    );
    if (!uniqueSourceCandidates.length) return null;

    if (type) {
      const query = { scope, type, unit: requestedUnit, isActive: true };
      if (group) query.group = group;
      if (category) query.category = category;
      for (const sourceCandidate of uniqueSourceCandidates) {
        const dbFactor = await EmissionFactor.findOne({
          ...query,
          source: sourceCandidate,
        }).lean();

        if (dbFactor && Number.isFinite(dbFactor.value)) {
          return Number(dbFactor.value);
        }
      }
    }

    for (const sourceCandidate of uniqueSourceCandidates) {
      const exactSourceUnit = await EmissionFactor.findOne({
        scope,
        source: new RegExp(
          `^${sourceCandidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i"
        ),
        unit: requestedUnit,
        isActive: true,
      }).lean();

      if (exactSourceUnit && Number.isFinite(exactSourceUnit.value)) {
        return Number(exactSourceUnit.value);
      }
    }

    for (const sourceCandidate of uniqueSourceCandidates) {
      const sameSourceAnyUnit = await EmissionFactor.find({
        scope,
        source: new RegExp(
          `^${sourceCandidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i"
        ),
        isActive: true,
      })
        .select("value unit")
        .lean();

      for (const factorDoc of sameSourceAnyUnit) {
        const converted = convertFactorUnit(
          Number(factorDoc.value),
          factorDoc.unit,
          requestedUnit
        );
        if (Number.isFinite(converted)) {
          return converted;
        }
      }
    }

    const sourceKeyCandidates = uniqueSourceCandidates.map(normalizeSourceKey);
    const broadScopeCandidates = await EmissionFactor.find({
      scope,
      isActive: true,
    })
      .select("source value unit")
      .lean();

    for (const factorDoc of broadScopeCandidates) {
      const factorSourceKey = normalizeSourceKey(factorDoc.source);
      if (!sourceKeyCandidates.includes(factorSourceKey)) continue;
      const converted = convertFactorUnit(
        Number(factorDoc.value),
        factorDoc.unit,
        requestedUnit
      );
      if (Number.isFinite(converted)) {
        return converted;
      }
    }
  } catch {
    // DB lookup failed, fall back to JSON
  }

  // Fallback to JSON
  const fallbackSource =
    String(source || "").trim() ||
    (scope === "Scope 2" ? getDefaultScope2SourceCandidates(type)[0] : "");
  return getEmissionFactor(scope, type, group, category, fallbackSource, unit);
};

const buildApprovedDataFromEntries = async ({ entries }) => {
  const detailedBreakdown = [];
  const breakdownByScope = { scope1: 0, scope2: 0, scope3: 0 };

  for (const entry of entries) {
    const scopeLabel = getScopeLabelFromNumber(entry.scope) || "";

    // Use stored EF first, then try DB, then JSON fallback
    let factor = entry.emissionFactor;
    if (!Number.isFinite(factor)) {
      factor = await getEmissionFactorAsync(
        scopeLabel,
        entry.activityType,
        entry.activityGroup,
        entry.activityCategory,
        entry.source,
        entry.unit,
        entry.section
      );
    }

    const consumption = parseFloat(entry.value);
    const calculatedEmission =
      Number.isFinite(consumption) && Number.isFinite(factor)
        ? consumption * factor
        : null;

    // Warn when no emission factor found for consumed (not generated) entries
    if (!Number.isFinite(factor)) {
      const isGenerated =
        normalizeEfText(entry.activityType).includes("generated") ||
        normalizeEfText(entry.activityGroup).includes("captive") ||
        normalizeEfText(entry.activityGroup).includes("wind") ||
        normalizeEfText(entry.activityGroup).includes("solar");
      if (!isGenerated) {
        console.warn(
          `[GHG] No emission factor for approved entry – ` +
            `scope=${scopeLabel}, source="${entry.source || ""}", ` +
            `type="${entry.activityType || ""}", group="${entry.activityGroup || ""}", ` +
            `unit="${entry.unit || ""}", value=${entry.value ?? ""}`
        );
      }
    }

    if (Number.isFinite(calculatedEmission)) {
      if (entry.scope === 1) breakdownByScope.scope1 += calculatedEmission;
      if (entry.scope === 2) breakdownByScope.scope2 += calculatedEmission;
      if (entry.scope === 3) breakdownByScope.scope3 += calculatedEmission;
    }

    detailedBreakdown.push({
      category: scopeLabel,
      activityType: entry.activityType || "",
      activityGroup: entry.activityGroup || "",
      activityCategory: entry.activityCategory || "",
      source: entry.source || "-",
      consumption: entry.value ?? "-",
      consumptionUnit: entry.unit || "",
      emissionFactor: Number.isFinite(factor) ? factor : null,
      emissionFactorUnit: Number.isFinite(factor)
        ? `kgCO2e/${entry.unit || ""}`
        : "",
      calculatedEmission,
      reference: "",
    });
  }

  const totalEmissions = detailedBreakdown.reduce(
    (sum, row) =>
      Number.isFinite(row.calculatedEmission)
        ? sum + row.calculatedEmission
        : sum,
    0
  );

  const topSource = detailedBreakdown
    .filter((row) => Number.isFinite(row.calculatedEmission))
    .sort((a, b) => b.calculatedEmission - a.calculatedEmission)[0]?.source;

  return {
    detailedBreakdown,
    totalEmissions,
    topSource: topSource || "",
    breakdownByScope,
  };
};

const uploadSupportingDocuments = async (
  scopeData,
  scopeKey,
  files,
  options = {}
) => {
  if (!scopeData || !Array.isArray(scopeData.sections)) {
    return scopeData || {};
  }

  const facilityName =
    options.facilityName || options.facility?.facilityName || options.facility?.name || "";

  const updatedSections = await Promise.all(
    scopeData.sections.map(async (section) => {
      const activities = Array.isArray(section.activities)
        ? section.activities
        : [];
      const updatedActivities = await Promise.all(
        activities.map(async (activity) => {
          const sources = Array.isArray(activity.sources)
            ? activity.sources
            : [];
          const updatedSources = await Promise.all(
            sources.map(async (source) => {
              const uploadKey = source?.supportingDocument?.uploadKey;
              if (uploadKey && files?.[uploadKey]) {
                const file = normalizeFile(files[uploadKey]);
                const allowedType = getAllowedDocType(file.name, file.mimetype);
                if (!allowedType) {
                  throw new ApiError(
                    400,
                    "Only PDF, DOC, XLS, CSV, or image files are allowed"
                  );
                }
                if (file.size > MAX_SUPPORTING_DOC_SIZE) {
                  throw new ApiError(
                    400,
                    "Supporting document must be less than 5MB"
                  );
                }

                const facilityId =
                  options.facility?._id || options.facilityId || null;
                const energyManagerName = resolveEnergyManagerName(options);
                const normalizedSource = normalizeSourceLabelForIndex(
                  source?.source
                );
                const fallbackSource =
                  normalizedSource ||
                  resolveSupportingDocumentNameCandidate(source, file) ||
                  "DOC";
                const entryDateObj = getEntryDateValue(source?.date);
                const entryDateString = formatDateForFilename(entryDateObj);
                const nextVersion = await getNextSerialVersion({
                  facilityId,
                  sourceLabel: normalizedSource || fallbackSource,
                  entryDateString,
                  options,
                });
                const baseName = buildSupportingDocumentBaseName({
                  facilityName,
                  energyManagerName,
                  sourceType: fallbackSource,
                  dateValue: entryDateObj,
                  version: nextVersion,
                });
                const extension = path.extname(
                  file.originalname || file.name || ""
                );
                const sanitizedFilename = `${baseName}${extension}`.replace(
                  /__+/g,
                  "_"
                );
                file.name = sanitizedFilename;
                file.originalname = sanitizedFilename;

                const uploadResult = await uploadToCloudinary(file, {
                  folder: `submissions/${scopeKey}`,
                  resource_type: allowedType === "document" ? "raw" : "image",
                  use_filename: true,
                  unique_filename: true,
                });

                return {
                  ...source,
                  supportingDocument: {
                    url: buildDownloadUrl(uploadResult),
                    publicId: uploadResult.public_id,
                    format: uploadResult.format,
                    resourceType: uploadResult.resource_type,
                    originalName: sanitizedFilename,
                    uploadKey,
                    uploadedAt: new Date().toISOString(),
                    version: nextVersion,
                    sourceLabel: normalizedSource || fallbackSource,
                    entryDate: entryDateObj.toISOString(),
                    entryDateString,
                  },
                };
              }

              if (
                source?.supportingDocument &&
                typeof source.supportingDocument === "string"
              ) {
                return {
                  ...source,
                  supportingDocument: { url: source.supportingDocument },
                };
              }

              return source;
            })
          );

          return {
            ...activity,
            sources: updatedSources,
          };
        })
      );

      return {
        ...section,
        activities: updatedActivities,
      };
    })
  );

  return {
    ...scopeData,
    sections: updatedSections,
  };
};

const validateReportingPeriod = (scopeData, facility) => {
  if (
    !facility?.reportingPeriod?.startDate ||
    !facility?.reportingPeriod?.endDate
  ) {
    return;
  }

  if (!scopeData || !Array.isArray(scopeData.sections)) {
    return;
  }

  const start = new Date(facility.reportingPeriod.startDate);
  const end = new Date(facility.reportingPeriod.endDate);

  scopeData.sections.forEach((section) => {
    (section.activities || []).forEach((activity) => {
      (activity.sources || []).forEach((source) => {
        if (!source?.date) return;
        const date = new Date(source.date);
        if (Number.isNaN(date.getTime())) return;
        if (date < start || date > end) {
          throw new ApiError(
            400,
            `Entry date ${source.date} is outside facility reporting period.`
          );
        }
      });
    });
  });
};

export const createSubmission = asyncHandler(async (req, res) => {
  const { facility } = await resolveFacilityContext(
    req,
    getUserFacilityId(req.user)
  );

  const scope = req.body.scope;
  const data = parseJsonField(req.body.data, {});
  const scope1Data = parseJsonField(req.body.scope1Data, {});
  const scope2Data = parseJsonField(req.body.scope2Data, {});
  const scope3Data = parseJsonField(req.body.scope3Data, {});
  const scope3Module =
    scope === "Scope 3"
      ? scope3Data?.scope3Module || data?.scope3Module || null
      : scope3Data?.scope3Module || null;
  const importBatchId = scope1Data?.importBatchId
    ? scope1Data?.importBatchId || data?.importBatchId || null
    : scope2Data?.importBatchId
      ? scope2Data?.importBatchId || data?.importBatchId || null
      : scope3Data?.importBatchId
        ? scope3Data?.importBatchId || data?.importBatchId || null
        : data?.importBatchId || null;

  validateReportingPeriod(scope1Data, facility);
  validateReportingPeriod(scope2Data, facility);
  validateReportingPeriod(scope3Data, facility);

  const energyManagerName =
    req.user?.fullName || req.user?.username || "";
  const uploadOptions = {
    facility,
    user: req.user,
    energyManagerName,
    serialCounters: new Map(),
  };

  const uploadedScope1Data = await uploadSupportingDocuments(
    scope1Data,
    "scope1",
    req.files,
    uploadOptions
  );
  const uploadedScope2Data = await uploadSupportingDocuments(
    scope2Data,
    "scope2",
    req.files,
    uploadOptions
  );
  const uploadedScope3Data = await uploadSupportingDocuments(
    scope3Data,
    "scope3",
    req.files,
    uploadOptions
  );

  const scopedScope3Data =
    scope === "Scope 3"
      ? { ...(uploadedScope3Data || {}), scope3Module }
      : uploadedScope3Data || {};

  const payloads = [
    { scope: "Scope 1", payload: uploadedScope1Data },
    { scope: "Scope 2", payload: uploadedScope2Data },
    { scope: "Scope 3", payload: scopedScope3Data },
  ].filter((item) => item.payload && item.payload.sections?.length);

  if (payloads.length === 0 && scope && data && Array.isArray(data.sections)) {
    payloads.push({ scope, payload: data });
  }

  const submissionMeta = extractSubmissionMeta(payloads);
  const effectiveScope = scope || payloads[0]?.scope || null;
  const isBulkImport = payloads.some(
    (item) =>
      item?.payload?.importedFrom === "bulk" ||
      Boolean(item?.payload?.importedAt)
  );
  const derivedImportBatchId =
    !importBatchId && isBulkImport
      ? `bulk_${buildBulkImportFingerprint(payloads)}`
      : null;
  const effectiveImportBatchId = importBatchId || derivedImportBatchId || null;
  const autoApproveForOfficeAdmin = await shouldAutoApproveSubmission(
    req.user,
    facility.organizationId
  );

  // ── Parse explicit draft IDs the frontend wants replaced ──
  const replaceDraftIds = parseJsonField(req.body.replaceDraftIds, []);

  if (effectiveImportBatchId && effectiveScope) {
    const existingSubmitted = await SourceSubmission.findOne({
      facilityId: facility?._id || null,
      submittedBy: req.user._id,
      scope: effectiveScope,
      importBatchId: effectiveImportBatchId,
      status: autoApproveForOfficeAdmin
        ? { $in: ["submitted", "approved"] }
        : "submitted",
    }).sort({ createdAt: -1 });

    if (existingSubmitted) {
      const hydratedScopes = await hydrateSubmissionScopes(existingSubmitted);
      return res.status(200).json(
        new ApiResponse(
          200,
          {
            ...existingSubmitted.toObject(),
            scope1Data: hydratedScopes.scope1Data,
            scope2Data: hydratedScopes.scope2Data,
            scope3Data: hydratedScopes.scope3Data,
          },
          "Submission already exists for this import batch"
        )
      );
    }

    // ── Clean up existing drafts with the same fingerprint ──
    // This prevents orphan drafts when the frontend's separate
    // DELETE call fails (e.g. due to permission or network issues).
    const staleDrafts = await SourceSubmission.find({
      facilityId: facility?._id || null,
      submittedBy: req.user._id,
      scope: effectiveScope,
      importBatchId: effectiveImportBatchId,
      status: { $in: ["draft", "rejected"] },
    });
    for (const draft of staleDrafts) {
      await SourceEntry.deleteMany({ submissionId: draft._id });
      await SourceDocument.deleteMany({ submissionId: draft._id });
      await draft.deleteOne();
    }
  }

  // ── Also clean up any explicitly listed draft submissions ──
  if (Array.isArray(replaceDraftIds) && replaceDraftIds.length) {
    const explicitDrafts = await SourceSubmission.find({
      _id: { $in: replaceDraftIds },
      submittedBy: req.user._id,
      status: { $in: ["draft", "rejected"] },
    });
    for (const draft of explicitDrafts) {
      await SourceEntry.deleteMany({ submissionId: draft._id });
      await SourceDocument.deleteMany({ submissionId: draft._id });
      await draft.deleteOne();
    }
  }

  let submission;
  try {
    submission = await SourceSubmission.create({
      facilityId: facility?._id || null,
      organizationId: facility?.organizationId || null,
      scope: effectiveScope,
      reportingYear: submissionMeta.reportingYear,
      reportingPeriod: submissionMeta.reportingPeriod,
      periodStart: submissionMeta.periodStart,
      periodEnd: submissionMeta.periodEnd,
      scope3Module,
      importBatchId: effectiveImportBatchId,
      status: autoApproveForOfficeAdmin ? "approved" : "submitted",
      reviewedBy: autoApproveForOfficeAdmin ? req.user._id : undefined,
      reviewedAt: autoApproveForOfficeAdmin ? new Date() : undefined,
      submittedBy: req.user._id,
    });
  } catch (error) {
    if (error?.code === 11000 && effectiveImportBatchId && effectiveScope) {
      const existingSubmitted = await SourceSubmission.findOne({
        facilityId: facility?._id || null,
        submittedBy: req.user._id,
        scope: effectiveScope,
        importBatchId: effectiveImportBatchId,
        status: autoApproveForOfficeAdmin
          ? { $in: ["submitted", "approved"] }
          : "submitted",
      }).sort({ createdAt: -1 });

      if (existingSubmitted) {
        const hydratedScopes = await hydrateSubmissionScopes(existingSubmitted);
        return res.status(200).json(
          new ApiResponse(
            200,
            {
              ...existingSubmitted.toObject(),
              scope1Data: hydratedScopes.scope1Data,
              scope2Data: hydratedScopes.scope2Data,
              scope3Data: hydratedScopes.scope3Data,
            },
            "Submission already exists for this import batch"
          )
        );
      }
    }
    throw error;
  }

  const entries = [];
  const documents = [];
  payloads.forEach(({ scope: payloadScope, payload }) => {
    const built = buildEntriesFromScope({
      scope: payloadScope,
      scopeData: payload,
      submissionId: submission._id,
      facilityId: facility?._id || null,
      organizationId: facility?.organizationId || null,
    });
    entries.push(...built.entries);
    documents.push(...built.documents);
  });

  if (documents.length) {
    await SourceDocument.insertMany(documents);
  }
  if (entries.length) {
    const inserted = await SourceEntry.insertMany(entries);
    await persistEmissionFactors(inserted.map((e) => e._id));
    await updateMonthlySummaries(
      await SourceEntry.find({
        _id: { $in: inserted.map((e) => e._id) },
      }).lean()
    );
  }

  if (autoApproveForOfficeAdmin) {
    await ensureApprovedDataForSubmission(submission, req.user._id);
  }

  const responsePayload = {
    ...submission.toObject(),
    scope1Data: ensureSignedDownloadUrls(uploadedScope1Data || {}),
    scope2Data: ensureSignedDownloadUrls(uploadedScope2Data || {}),
    scope3Data: ensureSignedDownloadUrls(scopedScope3Data || {}),
  };

  res
    .status(201)
    .json(new ApiResponse(201, responsePayload, "Submission created"));
});

export const createDraftSubmission = asyncHandler(async (req, res) => {
  const { submissionId } = req.body;
  const { facility } = await resolveFacilityContext(
    req,
    getUserFacilityId(req.user)
  );

  const scope = req.body.scope;
  const data = parseJsonField(req.body.data, {});
  const scope1Data = parseJsonField(req.body.scope1Data, {});
  const scope2Data = parseJsonField(req.body.scope2Data, {});
  const scope3Data = parseJsonField(req.body.scope3Data, {});
  const scope3Module =
    scope === "Scope 3"
      ? scope3Data?.scope3Module || data?.scope3Module || null
      : scope3Data?.scope3Module || null;
  const importBatchId = scope1Data?.importBatchId
    ? scope1Data?.importBatchId || data?.importBatchId || null
    : scope2Data?.importBatchId
      ? scope2Data?.importBatchId || data?.importBatchId || null
      : scope3Data?.importBatchId
        ? scope3Data?.importBatchId || data?.importBatchId || null
        : data?.importBatchId || null;

  validateReportingPeriod(scope1Data, facility);
  validateReportingPeriod(scope2Data, facility);
  validateReportingPeriod(scope3Data, facility);

  const energyManagerName =
    req.user?.fullName || req.user?.username || "";
  const uploadOptions = {
    facility,
    user: req.user,
    energyManagerName,
    serialCounters: new Map(),
  };

  const uploadedScope1Data = await uploadSupportingDocuments(
    scope1Data,
    "scope1",
    req.files,
    uploadOptions
  );
  const uploadedScope2Data = await uploadSupportingDocuments(
    scope2Data,
    "scope2",
    req.files,
    uploadOptions
  );
  const uploadedScope3Data = await uploadSupportingDocuments(
    scope3Data,
    "scope3",
    req.files,
    uploadOptions
  );

  const scopedScope3Data =
    scope === "Scope 3"
      ? { ...(uploadedScope3Data || {}), scope3Module }
      : uploadedScope3Data || {};

  const payloads = [
    { scope: "Scope 1", payload: uploadedScope1Data },
    { scope: "Scope 2", payload: uploadedScope2Data },
    { scope: "Scope 3", payload: scopedScope3Data },
  ].filter((item) => item.payload && item.payload.sections?.length);

  if (payloads.length === 0 && scope && data && Array.isArray(data.sections)) {
    payloads.push({ scope, payload: data });
  }

  const submissionMeta = extractSubmissionMeta(payloads);
  const effectiveScope = scope || payloads[0]?.scope || null;
  const isBulkImport = payloads.some(
    (item) =>
      item?.payload?.importedFrom === "bulk" ||
      Boolean(item?.payload?.importedAt)
  );
  const derivedImportBatchId =
    !importBatchId && isBulkImport
      ? `bulk_${buildBulkImportFingerprint(payloads)}`
      : null;
  const effectiveImportBatchId = importBatchId || derivedImportBatchId || null;
  let draft;

  if (submissionId) {
    const existing = await SourceSubmission.findById(submissionId);
    if (!existing) {
      throw new ApiError(404, "Submission not found");
    }

    if (existing.submittedBy?.toString() !== req.user._id.toString()) {
      throw new ApiError(403, "You can only edit your own submission");
    }

    if (existing.status !== "draft" && existing.status !== "rejected") {
      throw new ApiError(
        400,
        "Only draft or rejected submissions can be edited"
      );
    }

    existing.scope = effectiveScope || existing.scope;
    existing.reportingYear =
      submissionMeta.reportingYear ?? existing.reportingYear;
    existing.reportingPeriod =
      submissionMeta.reportingPeriod || existing.reportingPeriod;
    existing.periodStart = submissionMeta.periodStart || existing.periodStart;
    existing.periodEnd = submissionMeta.periodEnd || existing.periodEnd;
    existing.scope3Module = scope3Module || existing.scope3Module;
    existing.importBatchId = effectiveImportBatchId || existing.importBatchId;
    existing.status = "draft";
    draft = await existing.save();
  } else {
    if (effectiveImportBatchId && effectiveScope) {
      draft = await SourceSubmission.findOne({
        facilityId: facility?._id || null,
        submittedBy: req.user._id,
        scope: effectiveScope,
        importBatchId: effectiveImportBatchId,
        status: "draft",
      }).sort({ createdAt: -1 });
    }

    if (draft) {
      draft.reportingYear = submissionMeta.reportingYear ?? draft.reportingYear;
      draft.reportingPeriod =
        submissionMeta.reportingPeriod || draft.reportingPeriod;
      draft.periodStart = submissionMeta.periodStart || draft.periodStart;
      draft.periodEnd = submissionMeta.periodEnd || draft.periodEnd;
      draft.scope3Module = scope3Module || draft.scope3Module;
      draft.importBatchId = effectiveImportBatchId || draft.importBatchId;
      draft.status = "draft";
      draft = await draft.save();
    } else {
      try {
        draft = await SourceSubmission.create({
          facilityId: facility?._id || null,
          organizationId: facility?.organizationId || null,
          scope: effectiveScope,
          reportingYear: submissionMeta.reportingYear,
          reportingPeriod: submissionMeta.reportingPeriod,
          periodStart: submissionMeta.periodStart,
          periodEnd: submissionMeta.periodEnd,
          scope3Module,
          importBatchId: effectiveImportBatchId,
          status: "draft",
          submittedBy: req.user._id,
        });
      } catch (error) {
        if (error?.code === 11000 && effectiveImportBatchId && effectiveScope) {
          const existingDraft = await SourceSubmission.findOne({
            facilityId: facility?._id || null,
            submittedBy: req.user._id,
            scope: effectiveScope,
            importBatchId: effectiveImportBatchId,
            status: "draft",
          }).sort({ createdAt: -1 });

          if (existingDraft) {
            draft = existingDraft;
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }
  }

  await SourceEntry.deleteMany({ submissionId: draft._id });
  await SourceDocument.deleteMany({ submissionId: draft._id });

  const entries = [];
  const documents = [];
  payloads.forEach(({ scope: payloadScope, payload }) => {
    const built = buildEntriesFromScope({
      scope: payloadScope,
      scopeData: payload,
      submissionId: draft._id,
      facilityId: facility?._id || null,
      organizationId: facility?.organizationId || null,
    });
    entries.push(...built.entries);
    documents.push(...built.documents);
  });

  if (documents.length) {
    await SourceDocument.insertMany(documents);
  }
  if (entries.length) {
    const inserted = await SourceEntry.insertMany(entries);
    await persistEmissionFactors(inserted.map((e) => e._id));
  }

  const hydratedScopes = await hydrateSubmissionScopes(draft);

  res.status(201).json(
    new ApiResponse(
      201,
      {
        ...draft.toObject(),
        scope1Data: hydratedScopes.scope1Data,
        scope2Data: hydratedScopes.scope2Data,
        scope3Data: hydratedScopes.scope3Data,
      },
      "Draft saved"
    )
  );
});

export const getSubmissions = asyncHandler(async (req, res) => {
  const { facilityId, status } = req.query;
  const filter = {};

  if (status) {
    filter.status = status;
  }

  const userFacilityId = getUserFacilityId(req.user);

  if (req.user.role === "ENERGY_MANAGER") {
    filter.submittedBy = req.user._id;
  } else if (req.user.role === "PLANT_ADMIN" && userFacilityId) {
    filter.facilityId = userFacilityId;
  } else if (["HEAD", "REGION_ADMIN", "ORG_ADMIN"].includes(req.user.role)) {
    filter.organizationId = req.user.organizationId;
  }

  if (facilityId && req.user.role !== "ENERGY_MANAGER") {
    filter.facilityId = facilityId;
  }

  const submissions = await SourceSubmission.find(filter)
    .populate("facilityId", "facilityName")
    .populate("submittedBy", "username email")
    .sort({ createdAt: -1 });

  const hydrated = await Promise.all(
    submissions.map(async (submission) => {
      const scopes = await hydrateSubmissionScopes(submission);
      return {
        ...submission.toObject(),
        scope1Data: scopes.scope1Data,
        scope2Data: scopes.scope2Data,
        scope3Data: scopes.scope3Data,
      };
    })
  );

  res.status(200).json(new ApiResponse(200, hydrated, "Submissions retrieved"));
});

export const getAuditorSubmissionExample = asyncHandler(async (req, res) => {
  const { facilityId } = req.query;
  const filter = { status: "submitted" };

  const userFacilityId = getUserFacilityId(req.user);

  if (req.user.role === "ENERGY_MANAGER") {
    filter.submittedBy = req.user._id;
  } else if (req.user.role === "PLANT_ADMIN" && userFacilityId) {
    filter.facilityId = userFacilityId;
  } else if (["HEAD", "REGION_ADMIN", "ORG_ADMIN"].includes(req.user.role)) {
    filter.organizationId = req.user.organizationId;
  }

  if (facilityId && req.user.role !== "ENERGY_MANAGER") {
    filter.facilityId = facilityId;
  }

  const submission = await SourceSubmission.findOne(filter)
    .populate("facilityId", "facilityName")
    .populate("submittedBy", "username email")
    .sort({ createdAt: -1 });

  let samplePayload = buildStaticAuditorSubmissionExample();

  if (submission) {
    const scopes = await hydrateSubmissionScopes(submission);
    samplePayload = {
      ...submission.toObject(),
      scope1Data: scopes.scope1Data,
      scope2Data: scopes.scope2Data,
      scope3Data: scopes.scope3Data,
    };
  }

  res
    .status(200)
    .json(
      new ApiResponse(
        200,
        [samplePayload],
        "Auditor sample payload generated in Plant Admin approval format"
      )
    );
});

export const getSubmissionById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, "Submission not found");
  }
  const submission = await SourceSubmission.findById(id)
    .populate("facilityId", "facilityName")
    .populate("submittedBy", "username email");

  if (!submission) {
    throw new ApiError(404, "Submission not found");
  }

  const userFacilityId = getUserFacilityId(req.user);
  const userOrganizationId =
    req.user.organizationId?._id || req.user.organizationId;
  const submissionFacilityId =
    submission.facilityId?._id || submission.facilityId;
  const submissionOrganizationId =
    submission.organizationId?._id || submission.organizationId;
  if (
    req.user.role === "ENERGY_MANAGER" &&
    submission.submittedBy?.toString() !== req.user._id.toString()
  ) {
    throw new ApiError(403, "Access denied to this submission");
  }
  if (
    req.user.role === "PLANT_ADMIN" &&
    userFacilityId &&
    submissionFacilityId &&
    submissionFacilityId.toString() !== userFacilityId.toString()
  ) {
    throw new ApiError(403, "Access denied to this submission");
  }
  if (
    req.user.role === "PLANT_ADMIN" &&
    !userFacilityId &&
    userOrganizationId &&
    submissionOrganizationId &&
    submissionOrganizationId.toString() !== userOrganizationId.toString()
  ) {
    throw new ApiError(403, "Access denied to this submission");
  }
  if (
    ["HEAD", "REGION_ADMIN", "ORG_ADMIN"].includes(req.user.role) &&
    req.user.organizationId &&
    submissionOrganizationId &&
    submissionOrganizationId.toString() !== req.user.organizationId.toString()
  ) {
    throw new ApiError(403, "Access denied to this submission");
  }

  const hydratedScopes = await hydrateSubmissionScopes(submission);
  const payload = submission.toObject();
  const hydrated = {
    ...payload,
    scope1Data: hydratedScopes.scope1Data,
    scope2Data: hydratedScopes.scope2Data,
    scope3Data: hydratedScopes.scope3Data,
  };

  res.status(200).json(new ApiResponse(200, hydrated, "Submission retrieved"));
});

export const downloadSupportingDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    scope,
    sectionIndex = 0,
    activityIndex = 0,
    sourceIndex = 0,
  } = req.query;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, "Submission not found");
  }

  const submission = await SourceSubmission.findById(id);
  if (!submission) {
    throw new ApiError(404, "Submission not found");
  }

  const userFacilityId = getUserFacilityId(req.user);
  const userOrganizationId =
    req.user.organizationId?._id || req.user.organizationId;
  const submissionFacilityId =
    submission.facilityId?._id || submission.facilityId;
  const submissionOrganizationId =
    submission.organizationId?._id || submission.organizationId;
  if (
    req.user.role === "ENERGY_MANAGER" &&
    submission.submittedBy?.toString() !== req.user._id.toString()
  ) {
    throw new ApiError(403, "Access denied to this submission");
  }
  if (
    req.user.role === "PLANT_ADMIN" &&
    userFacilityId &&
    submissionFacilityId &&
    submissionFacilityId.toString() !== userFacilityId.toString()
  ) {
    throw new ApiError(403, "Access denied to this submission");
  }
  if (
    req.user.role === "PLANT_ADMIN" &&
    !userFacilityId &&
    userOrganizationId &&
    submissionOrganizationId &&
    submissionOrganizationId.toString() !== userOrganizationId.toString()
  ) {
    throw new ApiError(403, "Access denied to this submission");
  }
  if (
    ["HEAD", "REGION_ADMIN", "ORG_ADMIN"].includes(req.user.role) &&
    req.user.organizationId &&
    submissionOrganizationId &&
    submissionOrganizationId.toString() !== req.user.organizationId.toString()
  ) {
    throw new ApiError(403, "Access denied to this submission");
  }

  const scopeNumber =
    getScopeNumberFromLabel(scope) || getScopeNumberFromLabel(submission.scope);
  const entryFilter = {
    submissionId: submission._id,
    sectionIndex: Number(sectionIndex),
    activityIndex: Number(activityIndex),
    sourceIndex: Number(sourceIndex),
  };
  if (scopeNumber) {
    entryFilter.scope = scopeNumber;
  }

  const entry = await SourceEntry.findOne(entryFilter).lean();
  if (!entry?.supportingDocumentId) {
    throw new ApiError(404, "Supporting document not found");
  }

  const doc = await SourceDocument.findById(entry.supportingDocumentId).lean();
  if (!doc) {
    throw new ApiError(404, "Supporting document not found");
  }

  const fileUrl = buildSignedDownloadUrl(doc) || doc.url;
  if (!fileUrl) {
    throw new ApiError(404, "Supporting document not found");
  }

  const response = await fetch(fileUrl);
  if (!response.ok || !response.body) {
    throw new ApiError(400, "Unable to download supporting document");
  }

  const filename = sanitizeDownloadName(
    doc.originalName || getFilenameFromUrl(fileUrl)
  );

  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const contentType = response.headers.get("content-type");
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    res.setHeader("Content-Length", contentLength);
  }

  Readable.fromWeb(response.body).pipe(res);
});

export const deleteSubmission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const submission = await SourceSubmission.findById(id);

  if (!submission) {
    throw new ApiError(404, "Submission not found");
  }

  if (submission.submittedBy?.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You can only delete your own submissions");
  }

  if (submission.status !== "draft" && submission.status !== "rejected") {
    throw new ApiError(
      400,
      "Only draft or rejected submissions can be deleted"
    );
  }

  await SourceEntry.deleteMany({ submissionId: submission._id });
  await SourceDocument.deleteMany({ submissionId: submission._id });
  await submission.deleteOne();
  res.status(200).json(new ApiResponse(200, null, "Submission deleted"));
});

export const submitSubmission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const submission = await SourceSubmission.findById(id);

  if (!submission) {
    throw new ApiError(404, "Submission not found");
  }

  if (submission.submittedBy?.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You can only submit your own submissions");
  }

  if (submission.status !== "draft" && submission.status !== "rejected") {
    throw new ApiError(
      400,
      "Only draft or rejected submissions can be submitted"
    );
  }

  const autoApproveForOfficeAdmin = await shouldAutoApproveSubmission(
    req.user,
    submission.organizationId
  );

  submission.status = autoApproveForOfficeAdmin ? "approved" : "submitted";
  submission.rejectionReason = "";
  submission.reviewedBy = autoApproveForOfficeAdmin ? req.user._id : undefined;
  submission.reviewedAt = autoApproveForOfficeAdmin ? new Date() : undefined;

  await submission.save();

  const { entries } = await fetchEntriesAndDocuments(submission._id);
  if (entries.length) {
    await updateMonthlySummaries(entries);
  }

  if (autoApproveForOfficeAdmin) {
    await ensureApprovedDataForSubmission(submission, req.user._id);
  }

  const hydratedScopes = await hydrateSubmissionScopes(submission);
  res.status(200).json(
    new ApiResponse(
      200,
      {
        ...submission.toObject(),
        scope1Data: hydratedScopes.scope1Data,
        scope2Data: hydratedScopes.scope2Data,
        scope3Data: hydratedScopes.scope3Data,
      },
      autoApproveForOfficeAdmin ? "Submission approved" : "Submission submitted"
    )
  );
});

export const approveSubmission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const submission = await SourceSubmission.findById(id);

  if (!submission) {
    throw new ApiError(404, "Submission not found");
  }

  const userFacilityId = getUserFacilityId(req.user);
  const userOrganizationId =
    req.user.organizationId || req.user.organizationId?._id;
  if (
    req.user.role === "PLANT_ADMIN" &&
    userFacilityId &&
    submission.facilityId?.toString() !== userFacilityId.toString()
  ) {
    throw new ApiError(403, "Access denied to this submission");
  }
  if (
    req.user.role === "PLANT_ADMIN" &&
    !userFacilityId &&
    userOrganizationId &&
    submission.organizationId?.toString() !== userOrganizationId.toString()
  ) {
    throw new ApiError(403, "Access denied to this submission");
  }

  submission.status = "approved";
  submission.reviewedBy = req.user._id;
  submission.reviewedAt = new Date();
  await submission.save();
  await ensureApprovedDataForSubmission(submission, req.user._id);

  const hydratedScopes = await hydrateSubmissionScopes(submission);
  res.status(200).json(
    new ApiResponse(
      200,
      {
        ...submission.toObject(),
        scope1Data: hydratedScopes.scope1Data,
        scope2Data: hydratedScopes.scope2Data,
        scope3Data: hydratedScopes.scope3Data,
      },
      "Submission approved"
    )
  );
});

export const getApprovedData = asyncHandler(async (req, res) => {
  const { facilityId } = req.query;
  const filter = {};

  const userFacilityId = getUserFacilityId(req.user);

  if (req.user.role === "ENERGY_MANAGER") {
    filter.submittedBy = req.user._id;
  } else if (req.user.role === "PLANT_ADMIN" && userFacilityId) {
    filter.facilityId = userFacilityId;
  } else if (["HEAD", "REGION_ADMIN", "ORG_ADMIN"].includes(req.user.role)) {
    filter.organizationId = req.user.organizationId;
  }

  if (facilityId && req.user.role !== "ENERGY_MANAGER") {
    filter.facilityId = facilityId;
  }

  const approvedData = await ApprovedData.find(filter)
    .populate("facilityId", "facilityName")
    .populate("submittedBy", "username email")
    .sort({ approvedAt: -1 });

  res
    .status(200)
    .json(new ApiResponse(200, approvedData, "Approved data retrieved"));
});

export const getApprovedDataById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, "Approved data not found");
  }

  const approvedData = await ApprovedData.findById(id)
    .populate("facilityId", "facilityName")
    .populate("submittedBy", "username email")
    .populate("approvedBy", "username email");

  if (!approvedData) {
    throw new ApiError(404, "Approved data not found");
  }

  const userFacilityId = getUserFacilityId(req.user);
  const userOrganizationId =
    req.user.organizationId?._id || req.user.organizationId;
  const approvedFacilityId =
    approvedData.facilityId?._id || approvedData.facilityId;
  const approvedOrganizationId =
    approvedData.organizationId?._id || approvedData.organizationId;

  if (
    req.user.role === "ENERGY_MANAGER" &&
    approvedData.submittedBy?.toString() !== req.user._id.toString()
  ) {
    throw new ApiError(403, "Access denied to this approved data");
  }
  if (
    req.user.role === "PLANT_ADMIN" &&
    userFacilityId &&
    approvedFacilityId &&
    approvedFacilityId.toString() !== userFacilityId.toString()
  ) {
    throw new ApiError(403, "Access denied to this approved data");
  }
  if (
    req.user.role === "PLANT_ADMIN" &&
    !userFacilityId &&
    userOrganizationId &&
    approvedOrganizationId &&
    approvedOrganizationId.toString() !== userOrganizationId.toString()
  ) {
    throw new ApiError(403, "Access denied to this approved data");
  }
  if (
    ["HEAD", "REGION_ADMIN", "ORG_ADMIN"].includes(req.user.role) &&
    req.user.organizationId &&
    approvedOrganizationId &&
    approvedOrganizationId.toString() !== req.user.organizationId.toString()
  ) {
    throw new ApiError(403, "Access denied to this approved data");
  }

  res
    .status(200)
    .json(new ApiResponse(200, approvedData, "Approved data retrieved"));
});

export const deleteApprovedData = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(404, "Approved data not found");
  }

  const approvedData = await ApprovedData.findById(id);
  if (!approvedData) {
    throw new ApiError(404, "Approved data not found");
  }

  const userFacilityId = getUserFacilityId(req.user);
  const userOrganizationId =
    req.user.organizationId?._id || req.user.organizationId;
  const approvedFacilityId =
    approvedData.facilityId?._id || approvedData.facilityId;
  const approvedOrganizationId =
    approvedData.organizationId?._id || approvedData.organizationId;

  if (
    req.user.role === "PLANT_ADMIN" &&
    userFacilityId &&
    approvedFacilityId &&
    approvedFacilityId.toString() !== userFacilityId.toString()
  ) {
    throw new ApiError(403, "Access denied to this approved data");
  }
  if (
    req.user.role === "PLANT_ADMIN" &&
    !userFacilityId &&
    userOrganizationId &&
    approvedOrganizationId &&
    approvedOrganizationId.toString() !== userOrganizationId.toString()
  ) {
    throw new ApiError(403, "Access denied to this approved data");
  }
  if (
    ["HEAD", "REGION_ADMIN", "ORG_ADMIN"].includes(req.user.role) &&
    req.user.organizationId &&
    approvedOrganizationId &&
    approvedOrganizationId.toString() !== req.user.organizationId.toString()
  ) {
    throw new ApiError(403, "Access denied to this approved data");
  }

  await approvedData.deleteOne();
  res.status(200).json(new ApiResponse(200, null, "Approved data deleted"));
});

export const rejectSubmission = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const submission = await SourceSubmission.findById(id);

  if (!submission) {
    throw new ApiError(404, "Submission not found");
  }

  const userFacilityId = getUserFacilityId(req.user);
  const userOrganizationId =
    req.user.organizationId || req.user.organizationId?._id;
  if (
    req.user.role === "PLANT_ADMIN" &&
    userFacilityId &&
    submission.facilityId?.toString() !== userFacilityId.toString()
  ) {
    throw new ApiError(403, "Access denied to this submission");
  }
  if (
    req.user.role === "PLANT_ADMIN" &&
    !userFacilityId &&
    userOrganizationId &&
    submission.organizationId?.toString() !== userOrganizationId.toString()
  ) {
    throw new ApiError(403, "Access denied to this submission");
  }

  submission.status = "rejected";
  submission.rejectionReason = reason || "";
  submission.reviewedBy = req.user._id;
  submission.reviewedAt = new Date();
  await submission.save();

  res.status(200).json(new ApiResponse(200, submission, "Submission rejected"));
});
