/**
 * Response Handler
 * Standardized API response formatting
 */

import { STATUS_CODE } from "../constants/index.js";
import { Exception } from "./Exception.js";

/**
 * API Response Class
 */
class APIResponse {
  constructor(statusCode, data = null, message = null) {
    this.success = statusCode >= 200 && statusCode < 300;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();

    if (this.success) {
      this.data = data;
      if (message) this.message = message;
    } else {
      this.error = data;
      this.message = message || "An error occurred";
    }
  }
}

/**
 * Send Success Response
 */
const sendSuccess = (
  res,
  data = null,
  message = null,
  statusCode = STATUS_CODE.SUCCESS
) => {
  const response = new APIResponse(statusCode, data, message);
  return res.status(statusCode).json(response);
};

/**
 * Send Error Response
 */
const sendError = (res, error) => {
  let statusCode = STATUS_CODE.INTERNAL_ERROR;
  let errorResponse = {
    errorCode: "INTERNAL_ERROR",
    message: "Internal server error",
  };

  // Handle custom Exception instances
  if (error instanceof Exception) {
    statusCode = error.status;
    errorResponse = error.toJSON();
  }
  // Handle Mongoose validation errors
  else if (error.name === "ValidationError") {
    statusCode = STATUS_CODE.BAD_REQUEST;
    errorResponse = {
      errorCode: "VALIDATION_ERROR",
      message: Object.values(error.errors)
        .map((err) => err.message)
        .join(", "),
      details: error.errors,
    };
  }
  // Handle Mongoose duplicate key errors
  else if (error.code === 11000) {
    statusCode = STATUS_CODE.CONFLICT;
    const field = Object.keys(error.keyPattern || {})[0] || "field";
    errorResponse = {
      errorCode: "DUPLICATE_ERROR",
      message: `${field} already exists`,
      details: error.keyValue,
    };
  }
  // Handle Mongoose cast errors
  else if (error.name === "CastError") {
    statusCode = STATUS_CODE.BAD_REQUEST;
    const field = error.path || "field";
    let message = "Invalid request data";
    if (field === "organizationId") {
      message = "Invalid organization selection";
    }
    errorResponse = {
      errorCode: "INVALID_ID",
      message,
      details: {
        field,
      },
    };
  }
  // Handle JWT errors
  else if (error.name === "JsonWebTokenError") {
    statusCode = STATUS_CODE.UNAUTHORIZED;
    errorResponse = {
      errorCode: "INVALID_TOKEN",
      message: "Invalid token",
    };
  } else if (error.name === "TokenExpiredError") {
    statusCode = STATUS_CODE.UNAUTHORIZED;
    errorResponse = {
      errorCode: "TOKEN_EXPIRED",
      message: "Token has expired",
    };
  }
  // Handle generic errors
  else if (error instanceof Error) {
    errorResponse = {
      errorCode: error.name || "INTERNAL_ERROR",
      message: error.message || "Internal server error",
    };
  }

  const response = new APIResponse(
    statusCode,
    errorResponse,
    errorResponse.message
  );

  // Log error in development
  if (process.env.NODE_ENV === "development") {
    console.error("Error:", error);
    response.stack = error.stack;
  }

  return res.status(statusCode).json(response);
};

/**
 * Global Error Handler Middleware
 */
const errorHandler = (error, req, res, next) => {
  console.error("Error Handler:", error);
  return sendError(res, error);
};

/**
 * 404 Not Found Handler
 */
const notFoundHandler = (req, res) => {
  return res
    .status(STATUS_CODE.NOT_FOUND)
    .json(
      new APIResponse(
        STATUS_CODE.NOT_FOUND,
        { errorCode: "NOT_FOUND", message: "Route not found" },
        "The requested resource was not found"
      )
    );
};

export { APIResponse, sendSuccess, sendError, errorHandler, notFoundHandler };
