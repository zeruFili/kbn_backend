import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";

// Rate limiter for sending OTP (max 5 requests per 10 minutes per IP)
export const otpSendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many OTP requests from this IP. Please wait a few minutes before trying again.",
  },
});

// Rate limiter for OTP verification endpoints (max 20 attempts per 10 minutes per IP)
export const otpVerifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many verification attempts from this IP. Please wait a few minutes before trying again.",
  },
});
