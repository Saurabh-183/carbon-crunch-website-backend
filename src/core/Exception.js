/**
 * Custom Exception Class
 * Standardized error handling for CarbonOS
 */

class Exception extends Error {
  constructor(errorCode, message, status = 400, errorDetails = null) {
    super(message);
    this.name = this.constructor.name;
    this.errorCode = errorCode;
    this.message = message;
    this.status = status;
    this.errorDetails = errorDetails;
    this.timestamp = new Date();

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      errorCode: this.errorCode,
      message: this.message,
      status: this.status,
      timestamp: this.timestamp,
      ...(this.errorDetails && { details: this.errorDetails }),
    };
  }
}

/**
 * Pre-defined Exception Types
 */
class ValidationException extends Exception {
  constructor(message, details = null) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

class UnauthorizedException extends Exception {
  constructor(message = "Unauthorized access") {
    super("UNAUTHORIZED", message, 401);
  }
}

class ForbiddenException extends Exception {
  constructor(message = "Insufficient permissions") {
    super("FORBIDDEN", message, 403);
  }
}

class NotFoundException extends Exception {
  constructor(resource = "Resource") {
    super("NOT_FOUND", `${resource} not found`, 404);
  }
}

class ConflictException extends Exception {
  constructor(message = "Resource already exists") {
    super("CONFLICT", message, 409);
  }
}

class InternalServerException extends Exception {
  constructor(message = "Internal server error", details = null) {
    super("INTERNAL_ERROR", message, 500, details);
  }
}

class TokenExpiredException extends Exception {
  constructor(message = "Token has expired") {
    super("TOKEN_EXPIRED", message, 401);
  }
}

class InvalidTokenException extends Exception {
  constructor(message = "Invalid token") {
    super("INVALID_TOKEN", message, 401);
  }
}

class SessionExpiredException extends Exception {
  constructor(message = "Session has expired") {
    super("SESSION_EXPIRED", message, 401);
  }
}

class InsufficientPermissionsException extends Exception {
  constructor(message = "You do not have permission to perform this action") {
    super("INSUFFICIENT_PERMISSIONS", message, 403);
  }
}

export {
  Exception,
  ValidationException,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  InternalServerException,
  TokenExpiredException,
  InvalidTokenException,
  SessionExpiredException,
  InsufficientPermissionsException,
};
