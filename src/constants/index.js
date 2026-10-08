/**
 * CarbonOS - Application Constants
 * Centralized configuration for status codes, enums, and system-wide constants
 */

const STATUS_CODE = {
  SUCCESS: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

/**
 * Database Model References
 * All Mongoose model names centralized
 */
const DB_MODEL_REF = {
  // IAM Models
  USER: "User",
  ORGANIZATION: "Organization",
  ROLE: "Role",
  PERMISSION: "Permission",
  AUDIT_LOG: "AuditLog",
  SESSION: "Session",
  RECOVERY_KEY: "RecoveryKey",

  // Core Business Models
  FACILITY: "Facility",
  REGION: "Region",
  ENERGY_READING: "EnergyReading",
  REPORT: "Report",
  GENERATE_REPORT: "GenerateReport",
  SUBMISSION: "Submission",
  PRODUCT_ALLOCATION: "ProductAllocation",
  SOURCE_SUBMISSION: "SourceSubmission",
  SOURCE_ENTRY: "SourceEntry",
  SOURCE_DOCUMENT: "SourceDocument",
  SOURCE_MONTHLY_SUMMARY: "SourceMonthlySummary",
  ASSET: "Asset",
  EMISSION_FACTOR: "EmissionFactor",

  // CBAM Models
  CBAM_PRODUCT: "CbamProduct",
  CBAM_INSTALLATION: "CbamInstallation",
  CBAM_PRODUCTION_RECORD: "CbamProductionRecord",
  CBAM_CN_CODE: "CbamCnCode",

  // Compliance Engine Models
  GHG_CALCULATION: "GHGCalculation",
  RCO_COMPLIANCE: "RCOCompliance",

  // System Models
  IAM_MODULE: "IAMModule",
  QUERY: "Query",
};

/**
 * CarbonOS Role Hierarchy
 * Based on PRD requirements with hierarchical levels
 *
 * GOD_MODE (Level 200) - Root/Founder access. Separate URL space (/api/god/*).
 *   Cannot be accessed through normal user logins.
 * PLATFORM_ADMIN (Level 120) - Operates CarbonOS platform, manages orgs & global config.
 * AUDITOR (Level 110) - Independent audit role. Read + approve/reject reports.
 * MAINTAINER (Level 105) - Emission factor & platform config steward.
 */
const ROLES = {
  GOD_MODE: {
    name: "God Mode",
    code: "GOD_MODE",
    level: 200,
    scope: "ABSOLUTE",
    description:
      "Root / founder access. Full system control via separate routing.",
  },
  PLATFORM_ADMIN: {
    name: "Platform Admin",
    code: "PLATFORM_ADMIN",
    level: 120,
    scope: "SYSTEM",
    description:
      "Operates CarbonOS platform — manages organizations, global configs, disputes.",
  },
  AUDITOR: {
    name: "Auditor",
    code: "AUDITOR",
    level: 110,
    scope: "VERIFICATION",
    description:
      "Independent / internal audit role — validates, approves, rejects reports.",
  },
  MAINTAINER: {
    name: "Maintainer",
    code: "MAINTAINER",
    level: 105,
    scope: "CONFIG",
    description:
      "Emission factor & platform configuration steward — manages carbon logic.",
  },
  HEAD: {
    name: "Head",
    code: "HEAD",
    level: 90,
    scope: "ORGANIZATION",
    description:
      "Service-sector top role above Regional Head; can manage organization-level hierarchy.",
  },
  REGION_ADMIN: {
    name: "Region Admin",
    code: "REGION_ADMIN",
    level: 85,
    scope: "ORGANIZATION",
    description:
      "Intermediate service-sector manager under Head; manages regional hierarchy.",
  },
  ORG_ADMIN: {
    name: "Organization Admin",
    code: "ORG_ADMIN",
    level: 80,
    scope: "ORGANIZATION",
    description: "Manages corporate entity and all facilities",
  },
  PLANT_ADMIN: {
    name: "Plant Admin",
    code: "PLANT_ADMIN",
    level: 60,
    scope: "FACILITY",
    description: "Manages specific facility operations",
  },
  ENERGY_MANAGER: {
    name: "Energy Manager",
    code: "ENERGY_MANAGER",
    level: 40,
    scope: "FACILITY",
    description: "Inputs and monitors energy consumption data",
  },
  COMPLIANCE_OFFICER: {
    name: "Compliance Officer",
    code: "COMPLIANCE_OFFICER",
    level: 40,
    scope: "FACILITY",
    description: "Approves data submissions and generates reports",
  },
  FINANCE_CFO: {
    name: "Finance/CFO",
    code: "FINANCE_CFO",
    level: 20,
    scope: "READ_ONLY",
    description: "Views financial risk dashboards and carbon tax projections",
  },
};

/**
 * Helper sets for quick membership checks
 */
const GOD_MODE_CODES = [ROLES.GOD_MODE.code];
const PLATFORM_LEVEL_CODES = [ROLES.GOD_MODE.code, ROLES.PLATFORM_ADMIN.code];
const AUDITOR_CODES = [ROLES.AUDITOR.code];
const MAINTAINER_CODES = [ROLES.MAINTAINER.code];

/**
 * Permission Access Levels
 * Granular access control system
 */
const ACCESS_LEVELS = {
  NONE: 0,
  READ: 1, // GET only
  WRITE: 2, // GET, POST, PUT
  ALL: 3, // GET, POST, PUT, DELETE, PATCH
};

/**
 * IAM Modules/Features
 * Features that can be assigned permissions
 */
const IAM_MODULES = {
  // Core Modules
  DASHBOARD: {
    slug: "dashboard",
    title: "Dashboard",
    category: "core",
    description: "Main analytics dashboard",
  },
  DATA_SPINE: {
    slug: "data_spine",
    title: "Energy Data Spine",
    category: "core",
    description: "Central energy data management",
  },

  // Compliance Engines
  GHG_ENGINE: {
    slug: "GHG_engine",
    title: "GHG Compliance Engine",
    category: "compliance",
    description: "Greenhouse Gas emissions calculations",
  },
  RCO_ENGINE: {
    slug: "rco_engine",
    title: "RCO Compliance Engine",
    category: "compliance",
    description: "Renewable Certificate Obligation compliance",
  },
  CCTS_ENGINE: {
    slug: "ccts_engine",
    title: "CCTS Compliance Engine",
    category: "compliance",
    description: "Carbon Credit Trading System",
  },
  PAT_ENGINE: {
    slug: "pat_engine",
    title: "PAT Compliance Engine",
    category: "compliance",
    description: "Perform, Achieve, Trade compliance",
  },

  // Management Modules
  FACILITY_MGMT: {
    slug: "facility_management",
    title: "Facility Management",
    category: "management",
    description: "Manage industrial facilities and plants",
  },
  USER_MGMT: {
    slug: "user_management",
    title: "User Management",
    category: "management",
    description: "User and role administration",
  },
  REPORT_MGMT: {
    slug: "report_management",
    title: "Report Management",
    category: "management",
    description: "Generate and manage compliance reports",
  },
  AUDIT_TRAIL: {
    slug: "audit_trail",
    title: "Audit Trail",
    category: "compliance",
    description: "Immutable audit log viewer",
  },

  DATA_ENTRY: {
    slug: "data_entry",
    title: "Data Entry",
    category: "data",
    description: "Manual energy data entry",
  },
};

/**
 * Audit Action Types
 * All trackable actions in the system
 */
const AUDIT_ACTIONS = {
  // User Actions
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  USER_DELETED: "USER_DELETED",
  USER_LOGIN: "USER_LOGIN",
  USER_LOGOUT: "USER_LOGOUT",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RECOVERY_FAILED: "PASSWORD_RECOVERY_FAILED",
  PASSWORD_RECOVERY_SUCCESS: "PASSWORD_RECOVERY_SUCCESS",
  RECOVERY_KEYS_GENERATED: "RECOVERY_KEYS_GENERATED",

  // Organization Actions
  ORG_CREATED: "ORG_CREATED",
  ORG_UPDATED: "ORG_UPDATED",

  // Facility Actions
  FACILITY_CREATED: "FACILITY_CREATED",
  FACILITY_UPDATED: "FACILITY_UPDATED",

  // Data Actions
  ENERGY_DATA_ENTERED: "ENERGY_DATA_ENTERED",
  ENERGY_DATA_UPDATED: "ENERGY_DATA_UPDATED",
  ENERGY_DATA_APPROVED: "ENERGY_DATA_APPROVED",
  ENERGY_DATA_REJECTED: "ENERGY_DATA_REJECTED",

  // Report Actions
  REPORT_GENERATED: "REPORT_GENERATED",
  REPORT_SUBMITTED: "REPORT_SUBMITTED",
  REPORT_APPROVED: "REPORT_APPROVED",

  // Permission Actions
  PERMISSION_GRANTED: "PERMISSION_GRANTED",
  PERMISSION_REVOKED: "PERMISSION_REVOKED",
  ROLE_ASSIGNED: "ROLE_ASSIGNED",
  ROLE_REMOVED: "ROLE_REMOVED",
};

/**
 * Organization Types
 */
const ORGANIZATION_TYPES = {
  INDUSTRIAL: { code: 1, name: "Industrial Manufacturing" },
  POWER_GENERATION: { code: 2, name: "Power Generation" },
  COMMERCIAL: { code: 3, name: "Commercial Enterprise" },
  INSTITUTIONAL: { code: 4, name: "Institutional" },
  GOVERNMENT: { code: 5, name: "Government Entity" },
};

/**
 * Data Approval Status
 */
const APPROVAL_STATUS = {
  DRAFT: "draft",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  REVISED: "revised",
};

/**
 * Session Status
 */
const SESSION_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
  REVOKED: "revoked",
};

/**
 * Success Messages
 */
const SUCCESS_MESSAGES = {
  USER_REGISTERED: "User registered successfully",
  USER_UPDATED: "User updated successfully",
  LOGIN_SUCCESS: "Login successful",
  LOGOUT_SUCCESS: "User logged out successfully",
  PASSWORD_CHANGED: "Password changed successfully",
  PERMISSION_UPDATED: "Permissions updated successfully",
  FACILITY_CREATED: "Facility created successfully",
  DATA_SAVED: "Data saved successfully",
  REPORT_GENERATED: "Report generated successfully",
};

/**
 * Error Messages
 */
const ERROR_MESSAGES = {
  UNAUTHORIZED: "Unauthorized access",
  FORBIDDEN: "Insufficient permissions",
  NOT_FOUND: "Resource not found",
  INVALID_CREDENTIALS: "Invalid credentials",
  USER_EXISTS: "User already exists",
  VALIDATION_ERROR: "Validation failed",
  INTERNAL_ERROR: "Internal server error",
  TOKEN_EXPIRED: "Token has expired",
  TOKEN_INVALID: "Invalid token",
  SESSION_EXPIRED: "Session has expired",
};

/**
 * Validation Constants
 */
const VALIDATION = {
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 50,
  TOKEN_EXPIRY: "24h",
  REFRESH_TOKEN_EXPIRY: "7d",
  SESSION_MAX_AGE: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
};

export {
  STATUS_CODE,
  DB_MODEL_REF,
  ROLES,
  GOD_MODE_CODES,
  PLATFORM_LEVEL_CODES,
  AUDITOR_CODES,
  MAINTAINER_CODES,
  ACCESS_LEVELS,
  IAM_MODULES,
  AUDIT_ACTIONS,
  ORGANIZATION_TYPES,
  APPROVAL_STATUS,
  SESSION_STATUS,
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  VALIDATION,
};
