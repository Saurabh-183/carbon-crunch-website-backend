/**
 * User Service
 * Business logic for user management operations
 */

import User from "../models/User.model.js";
import { createBaseDao } from "../../../core/BaseDao.js";
import {
  NotFoundException,
  ConflictException,
} from "../../../core/Exception.js";

class UserService {
  constructor() {
    this.dao = createBaseDao(User);
  }

  /**
   * Create new user
   */
  async createUser(userData) {
    // Check if user already exists
    const existingUser = await User.findOne({
      username: userData.username,
      organizationId: userData.organizationId,
      isDeleted: false,
    });

    if (existingUser) {
      throw new ConflictException(
        "User with this username already exists in this organization"
      );
    }

    // Check email uniqueness if provided
    if (userData.email) {
      const existingEmail = await User.findOne({
        email: userData.email
      });

      if (existingEmail) {
        throw new ConflictException("Email already in use");
      }
    }

    // Create user
    try {
      const user = await this.dao.create(userData);
      return user;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException("Email already in use");
      }
      throw error;
    }
  }

  /**
   * Find user by ID
   */
  async findById(userId, includePassword = false) {
    const projection = includePassword ? "+password" : "";
    const user = await User.findById(userId).select(projection);

    if (!user || user.isDeleted) {
      throw new NotFoundException("User");
    }

    return user;
  }

  /**
   * Find user by username and organization
   */
  async findByUsernameAndOrg(username, organizationId) {
    const user = await User.findOne({
      username,
      organizationId,
      isDeleted: false,
    });

    return user;
  }

  /**
   * Find user by email
   */
  async findByEmail(email) {
    const user = await User.findOne({
      email,
      isDeleted: false,
    }).select("+password +refreshToken");

    return user;
  }

  /**
   * Find user by credentials (for login)
   */
  async findByCredentials(username, organizationId) {
    const user = await User.findOne({
      username,
      organizationId,
      isDeleted: false,
      status: "active",
    }).select("+password +refreshToken");

    return user;
  }

  /**
   * Update user
   */
  async updateUser(userId, updateData) {
    const user = await this.findById(userId);

    // Prevent updating sensitive fields directly
    delete updateData.password;
    delete updateData.role;
    delete updateData.organizationId;

    const updatedUser = await this.dao.findByIdAndUpdate(userId, updateData, {
      new: true,
    });
    return updatedUser;
  }

  /**
   * Update user password
   */
  async updatePassword(userId, newPassword) {
    const user = await User.findById(userId);
    if (!user || user.isDeleted) {
      throw new NotFoundException("User");
    }

    user.password = newPassword; // Will be hashed by pre-save hook
    await user.save();

    return user;
  }

  /**
   * Soft delete user
   */
  async deleteUser(userId) {
    const user = await this.findById(userId);

    const result = await this.dao.findByIdAndUpdate(
      userId,
      {
        isDeleted: true,
        deletedAt: new Date(),
        status: "inactive",
      },
      { new: true }
    );

    return result;
  }

  /**
   * Assign facility to user
   */
  async assignFacility(userId, facilityData) {
    const user = await this.findById(userId);

    // Check if already assigned
    const alreadyAssigned = user.facilities.some(
      (f) => f.facilityId.toString() === facilityData.facilityId.toString()
    );

    if (alreadyAssigned) {
      throw new ConflictException("User already assigned to this facility");
    }

    user.facilities.push({
      facilityId: facilityData.facilityId,
      facilityName: facilityData.facilityName,
      role: facilityData.role,
      assignedBy: facilityData.assignedBy,
    });

    await user.save();
    return user;
  }

  /**
   * Remove facility from user
   */
  async removeFacility(userId, facilityId) {
    const user = await this.findById(userId);

    user.facilities = user.facilities.filter(
      (f) => f.facilityId.toString() !== facilityId.toString()
    );

    await user.save();
    return user;
  }

  /**
   * Update refresh token
   */
  async updateRefreshToken(userId, refreshToken) {
    return this.dao.findByIdAndUpdate(userId, { refreshToken }, { new: true });
  }

  /**
   * Clear refresh token (logout)
   */
  async clearRefreshToken(userId) {
    return this.dao.findByIdAndUpdate(
      userId,
      { $unset: { refreshToken: 1 } },
      { new: true }
    );
  }

  /**
   * Update last login
   */
  async updateLastLogin(userId) {
    return this.dao.findByIdAndUpdate(
      userId,
      {
        lastLogin: new Date(),
        lastActivityAt: new Date(),
        $inc: { loginCount: 1 },
      },
      { new: true }
    );
  }

  /**
   * Get users by organization
   */
  async getUsersByOrganization(organizationId, options = {}) {
    const query = {
      organizationId,
      isDeleted: false,
    };

    if (options.role) {
      query.role = options.role;
    }

    if (options.status) {
      query.status = options.status;
    }

    return this.dao.find(query, {}, options);
  }

  /**
   * Get users by facility
   */
  async getUsersByFacility(facilityId, options = {}) {
    const query = {
      "facilities.facilityId": facilityId,
      isDeleted: false,
    };

    return this.dao.find(query, {}, options);
  }

  /**
   * Search users
   */
  async searchUsers(searchTerm, organizationId, options = {}) {
    const query = {
      organizationId,
      isDeleted: false,
      $or: [
        { username: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
        { firstName: { $regex: searchTerm, $options: "i" } },
        { lastName: { $regex: searchTerm, $options: "i" } },
      ],
    };

    return this.dao.find(query, {}, options);
  }

  /**
   * Get user statistics
   */
  async getUserStats(organizationId) {
    const stats = await User.aggregate([
      {
        $match: {
          organizationId: organizationId,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
    ]);

    const totalUsers = await User.countDocuments({
      organizationId,
      isDeleted: false,
    });

    const activeUsers = await User.countDocuments({
      organizationId,
      isDeleted: false,
      status: "active",
    });

    return {
      total: totalUsers,
      active: activeUsers,
      byRole: stats,
    };
  }
}

export default new UserService();
