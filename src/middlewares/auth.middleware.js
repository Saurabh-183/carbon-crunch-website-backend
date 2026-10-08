/**
 * Authentication Middleware (Refactored)
 * Verifies JWT tokens and attaches user to request
 * Includes God Mode isolation guards
 */

import jwt from "jsonwebtoken";
import User from "../modules/iam/models/User.model.js";
import Session from "../modules/iam/models/Session.model.js";
import {
  UnauthorizedException,
  ForbiddenException,
  TokenExpiredException,
  InvalidTokenException,
} from "../core/Exception.js";
import asyncHandler from "express-async-handler";
import {
  ROLES,
  ACCESS_LEVELS,
  GOD_MODE_CODES,
  PLATFORM_LEVEL_CODES,
} from "../constants/index.js";
import { getPermissionRoles } from "../constants/role-permissions.js";

/**
 * Verify JWT and attach user to request
 */
export const verifyJWT = asyncHandler(async (req, res, next) => {
  try {
    // Extract token from header or cookies
    let token;
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new UnauthorizedException("No token provided");
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

    // Find user
    const user = await User.findById(decoded._id).select(
      "-password -refreshToken"
    );

    if (!user || user.isDeleted) {
      throw new UnauthorizedException("User not found or deleted");
    }

    if (user.status !== "active") {
      throw new UnauthorizedException("User account is inactive");
    }

    // Check if password was changed after token was issued
    if (user.changedPasswordAfter && user.changedPasswordAfter(decoded.iat)) {
      throw new TokenExpiredException("Password changed. Please login again.");
    }

    // Attach user to request
    req.user = user;

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      throw new InvalidTokenException("Invalid token");
    } else if (error.name === "TokenExpiredError") {
      throw new TokenExpiredException("Token has expired");
    }
    throw error;
  }
});

/**
 * Restrict access to specific roles
 * Usage: restrictTo(ROLES.PLATFORM_ADMIN.code, ROLES.ORG_ADMIN.code)
 */
export const restrictTo = (...allowedRoles) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new UnauthorizedException("User not authenticated");
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenException(
        `You do not have permission to perform this action. Required roles: ${allowedRoles.join(
          ", "
        )}`
      );
    }

    next();
  });
};

/**
 * Permission-based access control
 * Usage: permit("USER", "CREATE")
 */
export const permit = (resource, action) => {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new UnauthorizedException("User not authenticated");
    }

    const allowedRoles = getPermissionRoles(resource, action);

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenException(
        `You do not have permission to perform this action. Required roles: ${allowedRoles.join(
          ", "
        )}`
      );
    }

    next();
  });
};

/**
 * Check facility access
 * Ensures user has access to the specified facility
 */
export const checkFacilityAccess = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw new UnauthorizedException("User not authenticated");
  }

  // Extract facility ID from params, body, or query
  const facilityId =
    req.params.facilityId || req.body.facilityId || req.query.facilityId;

  if (!facilityId) {
    // If no facility ID specified, allow (will be handled by controller)
    return next();
  }

  // God Mode, Platform Admin, and Org Admin have access to all facilities
  if (
    [
      ROLES.GOD_MODE.code,
      ROLES.PLATFORM_ADMIN.code,
      ROLES.HEAD.code,
      ROLES.ORG_ADMIN.code,
    ].includes(req.user.role)
  ) {
    return next();
  }

  // Check if user has access to this facility
  const hasAccess =
    req.user.hasFacilityAccess && req.user.hasFacilityAccess(facilityId);

  if (!hasAccess) {
    throw new ForbiddenException("You do not have access to this facility");
  }

  next();
});

// ======================================================================
//  GOD MODE GUARDS
//  These ensure God Mode is completely isolated to /api/god/* routes.
// ======================================================================

/**
 * Require God Mode role.
 * Use on /api/god/* routes to ensure only GOD_MODE users can access them.
 */
export const requireGodMode = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw new UnauthorizedException("User not authenticated");
  }

  if (req.user.role !== ROLES.GOD_MODE.code) {
    throw new ForbiddenException(
      "God Mode access required. This endpoint is restricted to root users."
    );
  }

  // Optional: validate God Mode secret header for extra security
  const godSecret = req.headers["x-god-mode-secret"];
  if (
    process.env.GOD_MODE_SECRET &&
    godSecret !== process.env.GOD_MODE_SECRET
  ) {
    throw new ForbiddenException(
      "Invalid God Mode credentials. Supply X-God-Mode-Secret header."
    );
  }

  next();
});

/**
 * Block God Mode users from accessing normal routes.
 * Apply this to regular /api/* routes so that GOD_MODE users
 * are forced to use /api/god/* exclusively.
 *
 * If req.user is not yet set (verifyJWT hasn't run), skip gracefully —
 * the route's own verifyJWT will set it, and this guard catches it
 * when placed after verifyJWT in the middleware chain.
 */
export const blockGodModeOnNormalRoutes = asyncHandler(
  async (req, res, next) => {
    if (req.user && req.user.role === ROLES.GOD_MODE.code) {
      throw new ForbiddenException(
        "God Mode users must use /api/god/* endpoints. Normal API routes are not accessible."
      );
    }
    next();
  }
);

/**
 * Restrict to Platform-level roles (Platform Admin)
 * Use for operations that are PLATFORM_ADMIN-only but are NOT god-mode-only.
 */
export const requirePlatformAdmin = asyncHandler(async (req, res, next) => {
  if (!req.user) {
    throw new UnauthorizedException("User not authenticated");
  }

  if (!PLATFORM_LEVEL_CODES.includes(req.user.role)) {
    throw new ForbiddenException("Platform Admin access required.");
  }

  next();
});

export const authenticateUser = verifyJWT; // Alias for compatibility
