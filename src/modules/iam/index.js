/**
 * IAM Module Index
 * Central export point for IAM module
 */

// Models
import User from "./models/User.model.js";
import Organization from "./models/Organization.model.js";
import Permission from "./models/Permission.model.js";
import AuditLog from "./models/AuditLog.model.js";
import Session from "./models/Session.model.js";

// Services
import userService from "./services/user.service.js";
import auditService from "./services/audit.service.js";

// Facades
import authFacade from "./facades/auth.facade.js";

// Controllers
import authController from "./controllers/auth.controller.js";

// Routes
import authRoutes from "./routes/auth.routes.js";

export {
  // Models
  User,
  Organization,
  Permission,
  AuditLog,
  Session,
  
  // Services
  userService,
  auditService,
  
  // Facades
  authFacade,
  
  // Controllers
  authController,
  
  // Routes
  authRoutes,
};
