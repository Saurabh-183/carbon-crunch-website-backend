/**
 * User Routes
 * API endpoints for user management
 */

import express from "express";
import {
  verifyJWT,
  permit,
  blockGodModeOnNormalRoutes,
} from "../middlewares/auth.middleware.js";
import User from "../modules/iam/models/User.model.js";
import DefaultPassword from "../modules/iam/models/DefaultPassword.model.js";
import Organization from "../models/organization.model.js";
import { Region } from "../models/region.model.js";
import EmailService from "../services/email.service.js";
import authFacade from "../modules/iam/facades/auth.facade.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const router = express.Router();

const getPlantFacilityId = (user) =>
  user?.facilities?.[0]?.facilityId || user?.facilities?.[0]?.facilityId?._id;

const userHasFacility = (user, facilityId) =>
  Array.isArray(user?.facilities) &&
  user.facilities.some((facility) => {
    const assignedId = facility?.facilityId?._id || facility?.facilityId;
    return assignedId?.toString() === facilityId?.toString();
  });

const isOrganizationScopeRole = (role) =>
  ["HEAD", "REGION_ADMIN", "ORG_ADMIN"].includes(role);

const normalizeIndustryKey = (value = "") =>
  String(value).trim().toLowerCase().replace(/&/g, "and").replace(/\s+/g, " ");

const isServiceSectorIndustry = (industry = "") => {
  const normalized = normalizeIndustryKey(industry);
  return (
    normalized.includes("service sector") ||
    normalized === "service" ||
    normalized === "services" ||
    normalized.includes("service industry")
  );
};

// All routes require authentication
router.use(verifyJWT);
router.use(blockGodModeOnNormalRoutes);

/**
 * @desc    Get all users
 * @route   GET /api/users
 * @access  Private (PLATFORM_ADMIN, ORG_ADMIN for their org)
 */
router.get("/", permit("USER", "READ"), async (req, res, next) => {
  try {
    const { organizationId, facilityId, role, search } = req.query;

    let filter = {};

    const plantFacilityId = getPlantFacilityId(req.user);

    // Filter by organization
    if (organizationId) {
      filter.organizationId = organizationId;
    }

    // Filter by facility
    if (facilityId) {
      filter.$or = [
        { "facilities.facilityId": facilityId },
        { "facilityAssignments.facilityId": facilityId },
      ];
    }

    // Filter by role
    if (role) {
      filter.role = role;
    }

    // For non-platform-admin users, filter by their organization
    if (!["PLATFORM_ADMIN"].includes(req.user.role)) {
      filter.organizationId = req.user.organizationId;
    }

    if (req.user.role === "HEAD") {
      filter.role = "REGION_ADMIN";
    }

    if (req.user.role === "REGION_ADMIN") {
      filter.role = "PLANT_ADMIN";
    }

    if (req.user.role === "PLANT_ADMIN") {
      filter.role = "ENERGY_MANAGER";
      if (!plantFacilityId) {
        return next(
          new ApiError(400, "Plant Admin must be assigned to a facility")
        );
      }
      filter.$or = [
        { "facilities.facilityId": plantFacilityId },
        { "facilityAssignments.facilityId": plantFacilityId },
      ];
    }

    // Search by username or email
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(filter)
      .select("-password -refreshToken")
      .populate("organizationId", "name")
      .populate("regionId", "name")
      .populate("facilities.facilityId", "facilityName facilityLocation")
      .sort({ createdAt: -1 });

    res
      .status(200)
      .json(new ApiResponse(200, { users }, "Users retrieved successfully"));
  } catch (error) {
    next(new ApiError(500, "Failed to retrieve users", [error.message]));
  }
});

/**
 * @desc    Mark product tour as seen for the current user
 * @route   POST /api/users/hasSeenTour
 * @access  Private (any authenticated user)
 */
router.post(
  "/hasSeenTour",
  permit("USER", "UPDATE"),
  async (req, res, next) => {
    try {
      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { hasSeenTour: true },
        { new: true }
      ).select("hasSeenTour");

      if (!updatedUser) {
        return next(new ApiError(404, "User not found"));
      }

      res
        .status(200)
        .json(
          new ApiResponse(
            200,
            { hasSeenTour: updatedUser.hasSeenTour },
            "Tour status updated"
          )
        );
    } catch (error) {
      next(new ApiError(500, "Failed to update tour status", [error.message]));
    }
  }
);

/**
 * @desc    Get user by ID
 * @route   GET /api/users/:id
 * @access  Private
 */
router.get("/:id", permit("USER", "READ"), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select("-password -refreshToken")
      .populate("organizationId", "name")
      .populate("regionId", "name");

    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    if (
      ["PLATFORM_ADMIN"].includes(req.user.role) &&
      ["PLANT_ADMIN", "ENERGY_MANAGER"].includes(user.role)
    ) {
      return next(
        new ApiError(403, "Platform Admin cannot access lower-level users")
      );
    }

    if (req.user.role === "PLANT_ADMIN") {
      const plantFacilityId = getPlantFacilityId(req.user);
      if (!plantFacilityId) {
        return next(
          new ApiError(400, "Plant Admin must be assigned to a facility")
        );
      }
      if (user.role !== "ENERGY_MANAGER") {
        return next(
          new ApiError(403, "Plant Admin can only access Energy Managers")
        );
      }
      if (!userHasFacility(user, plantFacilityId)) {
        return next(new ApiError(403, "Access denied to this user"));
      }
    }

    res
      .status(200)
      .json(new ApiResponse(200, user, "User retrieved successfully"));
  } catch (error) {
    next(new ApiError(500, "Failed to retrieve user", [error.message]));
  }
});

/**
 * @desc    Create new user (register by admin)
 * @route   POST /api/users/register
 * @access  Private (PLATFORM_ADMIN, ORG_ADMIN, PLANT_ADMIN)
 */
router.post("/register", permit("USER", "CREATE"), async (req, res, next) => {
  try {
    const {
      username,
      email,
      password,
      role,
      organizationId,
      facilityId,
      regionId,
      dataEntryStyle,
    } = req.body;

    const plantFacilityId =
      req.user?.facilities?.[0]?.facilityId ||
      req.user?.facilities?.[0]?.facilityId?._id ||
      "";

    if (
      ["PLATFORM_ADMIN"].includes(req.user.role) &&
      role &&
      !["HEAD", "REGION_ADMIN", "ORG_ADMIN"].includes(role)
    ) {
      return next(
        new ApiError(
          400,
          "Platform Admin can only create Head, Region Admin, or Organization Admin users"
        )
      );
    }

    if (req.user.role === "HEAD") {
      if (role && role !== "REGION_ADMIN") {
        return next(
          new ApiError(400, "Head can only create Region Admin users")
        );
      }
      if (!regionId) {
        return next(
          new ApiError(400, "Region Admin must be assigned to a region")
        );
      }
      const targetRegion = await Region.findById(regionId);
      if (!targetRegion) {
        return next(new ApiError(404, "Region not found"));
      }
      if (
        String(targetRegion.organizationId) !== String(req.user.organizationId)
      ) {
        return next(
          new ApiError(403, "Region must belong to your organization")
        );
      }
    }

    if (req.user.role === "REGION_ADMIN") {
      if (role && role !== "PLANT_ADMIN") {
        return next(
          new ApiError(400, "Region Admin can only create Branch Admin users")
        );
      }
      if (!facilityId) {
        return next(
          new ApiError(400, "Branch Admin must be assigned to a branch")
        );
      }
      const existingFacilityAdmin = await User.findOne({
        role: "PLANT_ADMIN",
        organizationId: req.user.organizationId,
        "facilities.facilityId": facilityId,
      });
      if (existingFacilityAdmin) {
        return next(
          new ApiError(400, "This branch already has a Branch Admin")
        );
      }
    }

    if (req.user.role === "ORG_ADMIN") {
      if (role && role !== "PLANT_ADMIN") {
        return next(
          new ApiError(400, "Org Admin can only create Facility Admins")
        );
      }
      if (!facilityId) {
        return next(
          new ApiError(400, "Facility Admin must be assigned to a facility")
        );
      }
      const existingFacilityAdmin = await User.findOne({
        role: "PLANT_ADMIN",
        organizationId: req.user.organizationId,
        "facilities.facilityId": facilityId,
      });
      if (existingFacilityAdmin) {
        return next(
          new ApiError(400, "This facility already has a Facility Admin")
        );
      }
    }

    if (req.user.role === "PLANT_ADMIN") {
      if (role && role !== "ENERGY_MANAGER") {
        return next(
          new ApiError(400, "Plant Admin can only create Energy Managers")
        );
      }
      if (!plantFacilityId) {
        return next(
          new ApiError(400, "Plant Admin must be assigned to a facility")
        );
      }
      if (facilityId && facilityId.toString() !== plantFacilityId.toString()) {
        return next(
          new ApiError(
            403,
            "Plant Admin can only assign Energy Managers to their own facility"
          )
        );
      }
    }

    // Determine the target organization ID for the new user
    const targetOrgId =
      req.user.role === "PLANT_ADMIN"
        ? req.user.organizationId
        : organizationId;

    const effectiveNewRole = ["PLATFORM_ADMIN"].includes(req.user.role)
      ? role || "ORG_ADMIN"
      : req.user.role === "HEAD"
        ? "REGION_ADMIN"
        : req.user.role === "REGION_ADMIN"
          ? "PLANT_ADMIN"
          : req.user.role === "ORG_ADMIN"
            ? "PLANT_ADMIN"
            : role || "ENERGY_MANAGER";

    if (effectiveNewRole === "HEAD" && targetOrgId) {
      const org = await Organization.findById(targetOrgId).select("industry");
      if (!org || !isServiceSectorIndustry(org.industry)) {
        return next(
          new ApiError(
            400,
            "Head role is allowed only for Service Sector organizations"
          )
        );
      }
    }

    if (effectiveNewRole === "HEAD" && !targetOrgId) {
      return next(new ApiError(400, "Organization is required for Head role"));
    }

    // Check if email already exists globally
    if (email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return next(new ApiError(400, "User with this email already exists"));
      }
    }

    // Check if username already exists in this organization
    const existingUsername = await User.findOne({
      username,
      organizationId: targetOrgId,
    });

    if (existingUsername) {
      return next(
        new ApiError(
          400,
          "User with this username already exists in this organization"
        )
      );
    }

    // Auto-generate password if not provided
    let plainPassword = password;
    if (!plainPassword) {
      plainPassword = EmailService.generatePassword(10);
    }

    // Build user data - DON'T hash password here, let the model pre-save hook handle it
    const userData = {
      username,
      email,
      password: plainPassword, // Plain password - will be hashed by User model pre-save hook
      role: effectiveNewRole,
      organizationId:
        req.user.role === "PLANT_ADMIN"
          ? req.user.organizationId
          : organizationId,
      status: "active",
      createdBy: req.user._id,
      dataEntryStyle,
    };

    if (effectiveNewRole === "REGION_ADMIN") {
      userData.regionId = regionId;
    }

    // If facilityId provided, add to facilities assignments
    const finalFacilityId =
      req.user.role === "PLANT_ADMIN" ? plantFacilityId : facilityId;

    if (finalFacilityId) {
      userData.facilities = [
        {
          facilityId: finalFacilityId,
          role: userData.role,
          assignedBy: req.user._id,
        },
      ];
    }

    const user = await User.create(userData);

    const userResponse = await User.findById(user._id)
      .select("-password -refreshToken")
      .populate("organizationId", "name")
      .populate("regionId", "name");

    // Store default password in plaintext if it was auto-generated or even if provided
    try {
      await DefaultPassword.create({
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        defaultPassword: plainPassword,
      });
    } catch (err) {
      console.error("Failed to store default password:", err.message);
    }

    // Send welcome email (non-blocking)
    if (user.email) {
      EmailService.sendWelcomeEmail(user, plainPassword).catch((err) =>
        console.error("Welcome email failed:", err.message)
      );
    }

    res
      .status(201)
      .json(new ApiResponse(201, userResponse, "User created successfully"));
  } catch (error) {
    next(new ApiError(500, "Failed to create user", [error.message]));
  }
});

/**
 * @desc    Update user
 * @route   PUT /api/users/:id
 * @access  Private
 */
router.put("/:id", permit("USER", "UPDATE"), async (req, res, next) => {
  try {
    const {
      username,
      email,
      password,
      role,
      organizationId,
      facilityId,
      regionId,
      status,
      dataEntryStyle,
    } = req.body;

    const plantFacilityId =
      req.user?.facilities?.[0]?.facilityId ||
      req.user?.facilities?.[0]?.facilityId?._id ||
      "";

    const user = await User.findById(req.params.id);

    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    if (
      ["PLATFORM_ADMIN"].includes(req.user.role) &&
      ["PLANT_ADMIN", "ENERGY_MANAGER"].includes(user.role)
    ) {
      return next(
        new ApiError(403, "Platform Admin cannot modify lower-level users")
      );
    }

    if (req.user.role === "HEAD") {
      if (user.role !== "REGION_ADMIN") {
        return next(
          new ApiError(403, "Head can only manage Region Admin users")
        );
      }
      if (String(user.organizationId) !== String(req.user.organizationId)) {
        return next(
          new ApiError(403, "Head can only manage users in their organization")
        );
      }
    }

    if (req.user.role === "REGION_ADMIN") {
      if (user.role !== "PLANT_ADMIN") {
        return next(
          new ApiError(403, "Region Admin can only manage Branch Admin users")
        );
      }
      if (String(user.organizationId) !== String(req.user.organizationId)) {
        return next(
          new ApiError(
            403,
            "Region Admin can only manage users in their organization"
          )
        );
      }
    }

    if (req.user.role === "PLANT_ADMIN") {
      if (user.role !== "ENERGY_MANAGER") {
        return next(
          new ApiError(403, "Plant Admin can only manage Energy Managers")
        );
      }
      if (!plantFacilityId) {
        return next(
          new ApiError(400, "Plant Admin must be assigned to a facility")
        );
      }
      if (
        Array.isArray(user.facilities) &&
        user.facilities.length > 0 &&
        !user.facilities.some(
          (facility) =>
            facility.facilityId?.toString() === plantFacilityId.toString()
        )
      ) {
        return next(
          new ApiError(
            403,
            "Plant Admin can only manage Energy Managers in their facility"
          )
        );
      }
    }

    // Update fields
    if (username) user.username = username;
    if (email) user.email = email;
    if (role) {
      if (
        ["PLATFORM_ADMIN"].includes(req.user.role) &&
        !["HEAD", "REGION_ADMIN", "ORG_ADMIN"].includes(role)
      ) {
        return next(
          new ApiError(
            400,
            "Platform Admin can only assign HEAD, REGION_ADMIN, or ORG_ADMIN role"
          )
        );
      }
      if (req.user.role === "HEAD" && role !== "REGION_ADMIN") {
        return next(
          new ApiError(400, "Head can only assign Region Admin role")
        );
      }
      if (req.user.role === "REGION_ADMIN" && role !== "PLANT_ADMIN") {
        return next(
          new ApiError(400, "Region Admin can only assign Branch Admin role")
        );
      }

      if (role === "HEAD") {
        const effectiveOrgId = organizationId || user.organizationId;
        const org =
          await Organization.findById(effectiveOrgId).select("industry");
        if (!org || !isServiceSectorIndustry(org.industry)) {
          return next(
            new ApiError(
              400,
              "Head role is allowed only for Service Sector organizations"
            )
          );
        }
      }
      if (req.user.role === "ORG_ADMIN" && role !== "PLANT_ADMIN") {
        return next(
          new ApiError(400, "Org Admin can only assign Facility Admin role")
        );
      }
      if (req.user.role === "PLANT_ADMIN" && role !== "ENERGY_MANAGER") {
        return next(
          new ApiError(400, "Plant Admin can only assign Energy Manager role")
        );
      }
      user.role = role;
    }
    if (organizationId && req.user.role !== "PLANT_ADMIN") {
      user.organizationId = organizationId;
    }

    if (req.user.role === "HEAD" && user.role === "REGION_ADMIN") {
      if (regionId !== undefined) {
        if (!regionId) {
          return next(
            new ApiError(400, "Region Admin must be assigned to a region")
          );
        }
        const targetRegion = await Region.findById(regionId);
        if (!targetRegion) {
          return next(new ApiError(404, "Region not found"));
        }
        if (
          String(targetRegion.organizationId) !==
          String(req.user.organizationId)
        ) {
          return next(
            new ApiError(403, "Region must belong to your organization")
          );
        }
        user.regionId = targetRegion._id;
      }
    }

    if (user.role !== "REGION_ADMIN") {
      user.regionId = undefined;
    }

    if (status) user.status = status;
    if (dataEntryStyle && user.role === "ENERGY_MANAGER") {
      user.dataEntryStyle = dataEntryStyle;
    }

    // Handle facilityId - add to facilities assignments
    const enforcedFacilityId =
      req.user.role === "PLANT_ADMIN" ? plantFacilityId : facilityId;

    if (enforcedFacilityId) {
      if (["ORG_ADMIN", "REGION_ADMIN"].includes(req.user.role)) {
        const existingFacilityAdmin = await User.findOne({
          _id: { $ne: user._id },
          role: "PLANT_ADMIN",
          organizationId: req.user.organizationId,
          "facilities.facilityId": enforcedFacilityId,
        });
        if (existingFacilityAdmin) {
          return next(
            new ApiError(400, "This facility already has a Facility Admin")
          );
        }
      }

      if (
        req.user.role === "PLANT_ADMIN" &&
        facilityId &&
        facilityId.toString() !== plantFacilityId.toString()
      ) {
        return next(
          new ApiError(
            403,
            "Plant Admin can only assign Energy Managers to their own facility"
          )
        );
      }

      user.facilities = [
        {
          facilityId: enforcedFacilityId,
          role: user.role,
          assignedBy: req.user._id,
        },
      ];
    }

    // Set password directly - the pre-save hook will hash it
    if (password) {
      user.password = password;
    }

    await user.save();

    const updatedUser = await User.findById(user._id)
      .select("-password -refreshToken")
      .populate("organizationId", "name")
      .populate("regionId", "name");

    res
      .status(200)
      .json(new ApiResponse(200, updatedUser, "User updated successfully"));
  } catch (error) {
    next(new ApiError(500, "Failed to update user", [error.message]));
  }
});

/**
 * @desc    Admin initiated password reset
 * @route   POST /api/users/:id/reset-password
 * @access  Private (PLATFORM_ADMIN, ORG_ADMIN, PLANT_ADMIN)
 */
router.post(
  "/:id/reset-password",
  permit("USER", "UPDATE"),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);

      if (!user) {
        return next(new ApiError(404, "User not found"));
      }

      const plantFacilityId =
        req.user?.facilities?.[0]?.facilityId ||
        req.user?.facilities?.[0]?.facilityId?._id ||
        "";

      // Permission checks (same as update)
      if (
        ["PLATFORM_ADMIN"].includes(req.user.role) &&
        ["PLANT_ADMIN", "ENERGY_MANAGER"].includes(user.role)
      ) {
        return next(
          new ApiError(403, "Platform Admin cannot modify lower-level users")
        );
      }

      if (req.user.role === "HEAD") {
        if (user.role !== "REGION_ADMIN") {
          return next(
            new ApiError(403, "Head can only manage Region Admin users")
          );
        }
        if (String(user.organizationId) !== String(req.user.organizationId)) {
          return next(
            new ApiError(
              403,
              "Head can only manage users in their organization"
            )
          );
        }
      }

      if (req.user.role === "REGION_ADMIN") {
        if (user.role !== "PLANT_ADMIN") {
          return next(
            new ApiError(403, "Region Admin can only manage Branch Admin users")
          );
        }
        if (String(user.organizationId) !== String(req.user.organizationId)) {
          return next(
            new ApiError(
              403,
              "Head can only manage users in their organization"
            )
          );
        }
      }

      if (req.user.role === "PLANT_ADMIN") {
        if (user.role !== "ENERGY_MANAGER") {
          return next(
            new ApiError(403, "Plant Admin can only manage Energy Managers")
          );
        }
        if (!plantFacilityId) {
          return next(
            new ApiError(400, "Plant Admin must be assigned to a facility")
          );
        }
        if (
          Array.isArray(user.facilities) &&
          user.facilities.length > 0 &&
          !user.facilities.some(
            (f) => f.facilityId?.toString() === plantFacilityId.toString()
          )
        ) {
          return next(
            new ApiError(
              403,
              "Plant Admin can only manage Energy Managers in their facility"
            )
          );
        }
      }

      // Generate new default password
      const plainPassword = EmailService.generatePassword(10);

      // Update user's password
      user.password = plainPassword;
      await user.save();

      // Store in DefaultPassword collection
      try {
        await DefaultPassword.findOneAndUpdate(
          { userId: user._id },
          {
            username: user.username,
            email: user.email,
            role: user.role,
            organizationId: user.organizationId,
            defaultPassword: plainPassword,
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.error("Failed to update default password record:", err.message);
      }

      // Send reset email link
      try {
        await authFacade.requestPasswordResetEmail(user.email);
      } catch (err) {
        console.error("Failed to send reset email link:", err.message);
        return next(
          new ApiError(
            500,
            "Password reset in DB, but failed to send email link."
          )
        );
      }

      res
        .status(200)
        .json(
          new ApiResponse(
            200,
            null,
            "Password reset successfully. Email sent to user."
          )
        );
    } catch (error) {
      next(new ApiError(500, "Failed to reset password", [error.message]));
    }
  }
);

/**
 * @desc    Delete user
 * @route   DELETE /api/users/:id
 * @access  Private (PLATFORM_ADMIN, ORG_ADMIN, PLANT_ADMIN)
 */
router.delete("/:id", permit("USER", "DELETE"), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return next(new ApiError(404, "User not found"));
    }

    if (
      ["PLATFORM_ADMIN"].includes(req.user.role) &&
      ["PLANT_ADMIN", "ENERGY_MANAGER"].includes(user.role)
    ) {
      return next(
        new ApiError(403, "Platform Admin cannot delete lower-level users")
      );
    }

    if (req.user.role === "HEAD") {
      if (user.role !== "REGION_ADMIN") {
        return next(
          new ApiError(403, "Head can only delete Region Admin users")
        );
      }
      if (String(user.organizationId) !== String(req.user.organizationId)) {
        return next(
          new ApiError(403, "Head can only delete users in their organization")
        );
      }
    }

    if (req.user.role === "REGION_ADMIN") {
      if (user.role !== "PLANT_ADMIN") {
        return next(
          new ApiError(403, "Region Admin can only delete Branch Admin users")
        );
      }
      if (String(user.organizationId) !== String(req.user.organizationId)) {
        return next(
          new ApiError(403, "Head can only delete users in their organization")
        );
      }
    }

    if (req.user.role === "PLANT_ADMIN") {
      const plantFacilityId = getPlantFacilityId(req.user);
      if (!plantFacilityId) {
        return next(
          new ApiError(400, "Plant Admin must be assigned to a facility")
        );
      }
      if (user.role !== "ENERGY_MANAGER") {
        return next(
          new ApiError(403, "Plant Admin can only delete Energy Managers")
        );
      }
      if (!userHasFacility(user, plantFacilityId)) {
        return next(new ApiError(403, "Access denied to this user"));
      }
    }

    // Prevent deleting platform admin
    if (["GOD_MODE", "PLATFORM_ADMIN"].includes(user.role)) {
      return next(
        new ApiError(
          403,
          "Cannot delete platform-level users from this endpoint"
        )
      );
    }

    await User.findByIdAndDelete(req.params.id);

    res
      .status(200)
      .json(new ApiResponse(200, null, "User deleted successfully"));
  } catch (error) {
    next(new ApiError(500, "Failed to delete user", [error.message]));
  }
});

/**
 * @desc    Update user status
 * @route   PATCH /api/users/:id/status
 * @access  Private (PLATFORM_ADMIN, ORG_ADMIN, PLANT_ADMIN)
 */
router.patch(
  "/:id/status",
  permit("USER", "STATUS"),
  async (req, res, next) => {
    try {
      const { status } = req.body;

      if (!["active", "inactive", "suspended"].includes(status)) {
        return next(new ApiError(400, "Invalid status value"));
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
      ).select("-password -refreshToken");

      if (!user) {
        return next(new ApiError(404, "User not found"));
      }

      if (
        ["PLATFORM_ADMIN"].includes(req.user.role) &&
        ["PLANT_ADMIN", "ENERGY_MANAGER"].includes(user.role)
      ) {
        return next(
          new ApiError(403, "Platform Admin cannot manage lower-level users")
        );
      }

      if (req.user.role === "HEAD") {
        if (user.role !== "REGION_ADMIN") {
          return next(
            new ApiError(403, "Head can only manage Region Admin users")
          );
        }
        if (String(user.organizationId) !== String(req.user.organizationId)) {
          return next(
            new ApiError(
              403,
              "Head can only manage users in their organization"
            )
          );
        }
      }

      if (req.user.role === "REGION_ADMIN") {
        if (user.role !== "PLANT_ADMIN") {
          return next(
            new ApiError(403, "Region Admin can only manage Branch Admin users")
          );
        }
        if (String(user.organizationId) !== String(req.user.organizationId)) {
          return next(
            new ApiError(
              403,
              "Head can only manage users in their organization"
            )
          );
        }
      }

      if (req.user.role === "PLANT_ADMIN") {
        const plantFacilityId = getPlantFacilityId(req.user);
        if (!plantFacilityId) {
          return next(
            new ApiError(400, "Plant Admin must be assigned to a facility")
          );
        }
        if (user.role !== "ENERGY_MANAGER") {
          return next(
            new ApiError(403, "Plant Admin can only manage Energy Managers")
          );
        }
        if (!userHasFacility(user, plantFacilityId)) {
          return next(new ApiError(403, "Access denied to this user"));
        }
      }

      res
        .status(200)
        .json(new ApiResponse(200, user, "User status updated successfully"));
    } catch (error) {
      next(new ApiError(500, "Failed to update user status", [error.message]));
    }
  }
);

export default router;
