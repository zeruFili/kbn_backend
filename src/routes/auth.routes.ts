import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { authController } from "../controllers/auth.controller";
import { resetPasswordLimiter } from "../middlewares/rate-limit.middleware";
import { forgotPasswordLimiter } from "../middlewares/forgot-password-rate-limit.middleware";
import { loginLimiter } from "../middlewares/login-rate-limit.middleware";
import { otpSendLimiter, otpVerifyLimiter } from "../middlewares/otp-rate-limit.middleware";

import { userUploadMiddleware } from "../middlewares/user-upload.middleware";

const router = Router();

// OTP endpoints
router.post("/otp/send", otpSendLimiter, (req, res) => authController.sendOtp(req, res));
router.post("/otp/verify", otpVerifyLimiter, (req, res) => authController.verifyOtp(req, res));

// Auth flow endpoints
router.post("/register", userUploadMiddleware, (req, res) => authController.register(req, res));
router.post("/login", loginLimiter, (req, res) => authController.login(req, res));
router.post("/google", loginLimiter, (req, res) => authController.googleAuth(req, res));
router.post("/google/link", loginLimiter, (req, res) => authController.linkGoogleAccount(req, res));
router.post("/forgot-password", forgotPasswordLimiter, (req, res) => authController.forgotPassword(req, res));
router.post("/reset-password", resetPasswordLimiter, (req, res) => authController.resetPassword(req, res));
router.post("/reset-password/:token", resetPasswordLimiter, (req, res) => authController.resetPassword(req, res));
router.get("/me", authenticate, (req, res) => authController.getMe(req, res));

export default router;
