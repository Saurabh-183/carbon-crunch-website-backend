/**
 * Audit Service
 * Handles creation and querying of audit logs
 */

import AuditLog from "../models/AuditLog.model.js";
import { createBaseDao } from "../../../core/BaseDao.js";
import { AUDIT_ACTIONS } from "../../../constants/index.js";

class AuditService {
  constructor() {
    this.dao = createBaseDao(AuditLog);
  }

  /**
   * Log an action to audit trail
   */
  async log(auditData) {
    const {
      action,
      user,
      targetResource,
      organizationId,
      facilityId,
      changes,
      metadata,
      remarks,
      severity,
    } = auditData;

    const logEntry = await AuditLog.logAction({
      action,
      performedBy: {
        userId: user._id,
        username: user.username,
        role: user.role,
      },
      targetResource,
      organizationId,
      facilityId,
      changes,
      metadata,
      remarks,
      severity,
    });

    return logEntry;
  }

  /**
   * Log user creation
   */
  async logUserCreated(performedBy, createdUser, metadata = {}) {
    return this.log({
      action: AUDIT_ACTIONS.USER_CREATED,
      user: performedBy,
      targetResource: {
        resourceType: "User",
        resourceId: createdUser._id,
        resourceName: createdUser.username,
      },
      organizationId: createdUser.organizationId,
      metadata,
      severity: "high",
      remarks: `User ${createdUser.username} created with role ${createdUser.role}`,
    });
  }

  /**
   * Log user login
   */
  async logUserLogin(user, metadata = {}) {
    return this.log({
      action: AUDIT_ACTIONS.USER_LOGIN,
      user,
      targetResource: {
        resourceType: "User",
        resourceId: user._id,
        resourceName: user.username,
      },
      organizationId: user.organizationId,
      metadata,
      severity: "low",
      remarks: `User ${user.username} logged in`,
    });
  }

  /**
   * Log user logout
   */
  async logUserLogout(user, metadata = {}) {
    return this.log({
      action: AUDIT_ACTIONS.USER_LOGOUT,
      user,
      targetResource: {
        resourceType: "User",
        resourceId: user._id,
        resourceName: user.username,
      },
      organizationId: user.organizationId,
      metadata,
      severity: "low",
      remarks: `User ${user.username} logged out`,
    });
  }

  /**
   * Log data entry
   */
  async logDataEntry(
    user,
    resourceType,
    resourceId,
    resourceName,
    changes,
    metadata = {}
  ) {
    return this.log({
      action: AUDIT_ACTIONS.ENERGY_DATA_ENTERED,
      user,
      targetResource: {
        resourceType,
        resourceId,
        resourceName,
      },
      organizationId: user.organizationId,
      changes,
      metadata,
      severity: "high",
      remarks: `Energy data entered by ${user.username}`,
    });
  }

  /**
   * Log permission changes
   */
  async logPermissionChange(performedBy, targetUser, changes, metadata = {}) {
    return this.log({
      action: AUDIT_ACTIONS.PERMISSION_GRANTED,
      user: performedBy,
      targetResource: {
        resourceType: "User",
        resourceId: targetUser._id,
        resourceName: targetUser.username,
      },
      organizationId: targetUser.organizationId,
      changes,
      metadata,
      severity: "critical",
      remarks: `Permissions modified for ${targetUser.username}`,
    });
  }

  /**
   * Get audit logs by user
   */
  async getLogsByUser(userId, options = {}) {
    const query = {
      "performedBy.userId": userId,
    };

    if (options.startDate && options.endDate) {
      query.timestamp = {
        $gte: new Date(options.startDate),
        $lte: new Date(options.endDate),
      };
    }

    return this.dao.paginate(query, {
      ...options,
      sort: { timestamp: -1 },
    });
  }

  /**
   * Get audit logs by organization
   */
  async getLogsByOrganization(organizationId, options = {}) {
    const query = {
      organizationId,
    };

    if (options.action) {
      query.action = options.action;
    }

    if (options.severity) {
      query.severity = options.severity;
    }

    if (options.startDate && options.endDate) {
      query.timestamp = {
        $gte: new Date(options.startDate),
        $lte: new Date(options.endDate),
      };
    }

    return this.dao.paginate(query, {
      ...options,
      sort: { timestamp: -1 },
    });
  }

  /**
   * Get audit logs by facility
   */
  async getLogsByFacility(facilityId, options = {}) {
    const query = {
      facilityId,
    };

    if (options.action) {
      query.action = options.action;
    }

    if (options.startDate && options.endDate) {
      query.timestamp = {
        $gte: new Date(options.startDate),
        $lte: new Date(options.endDate),
      };
    }

    return this.dao.paginate(query, {
      ...options,
      sort: { timestamp: -1 },
    });
  }

  /**
   * Get audit logs for a specific resource
   */
  async getLogsByResource(resourceType, resourceId, options = {}) {
    const query = {
      "targetResource.resourceType": resourceType,
      "targetResource.resourceId": resourceId,
    };

    return this.dao.paginate(query, {
      ...options,
      sort: { timestamp: -1 },
    });
  }

  /**
   * Verify audit trail integrity
   */
  async verifyIntegrity(startDate, endDate) {
    return AuditLog.verifyIntegrity(startDate, endDate);
  }

  /**
   * Get audit statistics
   */
  async getAuditStats(organizationId, startDate, endDate) {
    const matchQuery = {
      organizationId,
    };

    if (startDate && endDate) {
      matchQuery.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const stats = await AuditLog.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            action: "$action",
            severity: "$severity",
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: "$_id.severity",
          actions: {
            $push: {
              action: "$_id.action",
              count: "$count",
            },
          },
          total: { $sum: "$count" },
        },
      },
    ]);

    return stats;
  }
}

export default new AuditService();
