import { Request, Response } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { authService } from "../services/auth.service";
import { otpService } from "../services/otp.service";
import {
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RegisterDto,
  GoogleAuthDto,
  GoogleLinkDto,
} from "../validators/auth.dto";
import { SendOtpDto, VerifyOtpDto, ResetPasswordWithOtpDto } from "../validators/otp.dto";
import { OtpPurpose } from "../enums/otp-purpose.enum";
import { recordLoginFailure } from "../middlewares/login-rate-limit.middleware";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";

import {
  cleanupUploadedFiles,
  getUploadedFilePath,
} from "../utils/upload.utils";
import { USER_UPLOAD_SUBFOLDER } from "../middlewares/user-upload.middleware";

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    try {
      const uploadedImage =
        getUploadedFilePath(req, "profileImage", USER_UPLOAD_SUBFOLDER) ||
        getUploadedFilePath(req, "profile_image", USER_UPLOAD_SUBFOLDER) ||
        getUploadedFilePath(req, "avatar", USER_UPLOAD_SUBFOLDER) ||
        getUploadedFilePath(req, "image", USER_UPLOAD_SUBFOLDER) ||
        getUploadedFilePath(req, "attachmentFiles", USER_UPLOAD_SUBFOLDER);

      const profileImage =
        uploadedImage ||
        (typeof req.body.profileImage === "string" ? req.body.profileImage : undefined) ||
        (typeof req.body.profile_image === "string" ? req.body.profile_image : undefined) ||
        (typeof req.body.avatar === "string" ? req.body.avatar : undefined);

      const body = {
        ...req.body,
        full_name: req.body.full_name || req.body.name,
        phone: typeof req.body.phone === "string" && req.body.phone.trim() ? req.body.phone.trim() : undefined,
        otpMethod: req.body.otpMethod || req.body.otp_method || (req.body.phone ? "sms" : "email"),
        ...(profileImage ? { profileImage } : {}),
      };
      const dto = plainToInstance(RegisterDto, body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        cleanupUploadedFiles(req);
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat();
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      // Step 1: Validates inputs and checks email uniqueness
      const existingUser = await AppDataSource.getRepository(User).findOne({
        where: { email: dto.email.trim().toLowerCase() },
      });
      if (existingUser) {
        cleanupUploadedFiles(req);
        res.status(409).json({ success: false, message: "Email already exists" });
        return;
      }

      const otpMethod = (dto.otpMethod || (dto.phone ? "sms" : "email")).toLowerCase() as "sms" | "email";

      // If OTP is not provided, generate and send verification code via chosen destination (SMS or Email)
      if (!dto.otp) {
        cleanupUploadedFiles(req);

        let targetIdentifier: string;
        let channelMessage: string;

        if (otpMethod === "email") {
          targetIdentifier = dto.email.trim().toLowerCase();
          channelMessage = `Verification code sent to your email (${targetIdentifier}). Please check your inbox and enter the OTP to complete registration.`;
        } else {
          if (!dto.phone) {
            res.status(400).json({
              success: false,
              message: "Phone number is required for SMS OTP verification.",
            });
            return;
          }
          targetIdentifier = dto.phone.trim();
          channelMessage = "Verification code sent to your phone via SMS. Please enter the OTP to complete registration.";
        }

        const sendResult = await otpService.generateAndSendOtp(targetIdentifier, OtpPurpose.REGISTER);
        res.status(200).json({
          success: true,
          requiresOtp: true,
          message: channelMessage,
          data: {
            identifier: sendResult.identifier,
            otpMethod,
            expiresAt: sendResult.expiresAt,
          },
        });
        return;
      }

      const result = await authService.register({
        full_name: dto.full_name,
        email: dto.email,
        password: dto.password,
        role: dto.role,
        phone: dto.phone,
        website: dto.website,
        profileImage: dto.profileImage,
        otp: dto.otp,
        otpMethod,
      });

      res.status(201).json({
        success: true,
        accessToken: result.accessToken,
        data: {
          id: result.user.id,
          fullName: result.user.full_name,
          full_name: result.user.full_name,
          email: result.user.email,
          role: result.user.role,
          status: result.user.status,
          profileImage: result.user.profileImage,
          accessToken: result.accessToken,
        },
        message: "User created successfully",
      });
    } catch (err) {
      cleanupUploadedFiles(req);
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("Register error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async login(req: Request, res: Response): Promise<void> {
    try {
      
      const dto = plainToInstance(LoginDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat();
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await authService.login(dto.email, dto.password);
      console.log("Login successfgfffffffffffffful:", dto.email);
      res.status(200).json({ success: true, message: "Login successful", data: result });
    } catch (err) {
      if (err instanceof AppError) {
        if (err.statusCode === 401) {
          recordLoginFailure(req);
        }
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("Login error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async sendOtp(req: Request, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(SendOtpDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat();
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await otpService.generateAndSendOtp(dto.identifier, dto.purpose);
      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          identifier: result.identifier,
          expiresAt: result.expiresAt,
        },
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("Send OTP error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async verifyOtp(req: Request, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(VerifyOtpDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat();
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      let resolvedIdentifier = dto.identifier;
      if (dto.purpose === OtpPurpose.RESET_PASSWORD) {
        resolvedIdentifier = await authService.resolveResetPasswordIdentifier(dto.identifier);
      }

      const result = await otpService.verifyOtp(resolvedIdentifier, dto.otp, dto.purpose);
      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          verified: true,
          identifier: result.record.identifier,
          purpose: result.record.purpose,
        },
      });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("Verify OTP error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const identifier = req.body.identifier || req.body.phone || req.body.email;
      if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
        res.status(200).json({
          success: true,
          message: "If an account exists with this credential, a verification code has been sent.",
        });
        return;
      }

      const result = await authService.forgotPassword(identifier.trim());
      res.status(200).json({
        success: true,
        message: result.message,
        data: result.maskedDestination
          ? {
              channel: result.channel,
              maskedDestination: result.maskedDestination,
            }
          : undefined,
      });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(200).json({
        success: true,
        message: "If an account exists with this credential, a verification code has been sent.",
      });
    }
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const token = req.params.token as string;
      const isOtpReset = Boolean(req.body.otp || req.body.identifier || !token);

      if (isOtpReset) {
        const dto = plainToInstance(ResetPasswordWithOtpDto, req.body);
        const errors = await validate(dto);
        if (errors.length > 0) {
          const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat();
          res.status(400).json({ success: false, message: "Validation failed", errors: messages });
          return;
        }

        await authService.resetPasswordWithOtp(
          dto.identifier,
          dto.otp,
          dto.password,
          dto.confirmPassword
        );
        res.status(200).json({
          success: true,
          message: "Password has been reset successfully. Please log in.",
        });
        return;
      }

      // Legacy token-based reset
      if (!token) {
        res.status(400).json({ success: false, message: "Reset token is required" });
        return;
      }

      const dto = plainToInstance(ResetPasswordDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat();
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      await authService.resetPassword(token, dto.password, dto.confirmPassword);
      res.status(200).json({ success: true, message: "Password has been reset successfully. Please log in." });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("Reset password error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async googleAuth(req: Request, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(GoogleAuthDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat();
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await authService.googleLogin(dto.idToken);
      res.status(200).json({
        success: true,
        message: "Google authentication successful",
        accessToken: result.accessToken,
        data: {
          ...result.user,
          accessToken: result.accessToken,
        },
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        if (err.statusCode === 409) {
          res.status(409).json({
            success: false,
            conflict: true,
            code: "ACCOUNT_EXISTS_LINK_REQUIRED",
            message: err.message,
          });
          return;
        }
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("[AuthController] Google auth error:", err?.message || err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async linkGoogleAccount(req: Request, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(GoogleLinkDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        const messages = errors.map((e) => Object.values(e.constraints ?? {})).flat();
        res.status(400).json({ success: false, message: "Validation failed", errors: messages });
        return;
      }

      const result = await authService.linkGoogleAccount(dto.idToken, dto.password);
      res.status(200).json({
        success: true,
        message: result.message,
        accessToken: result.accessToken,
        data: {
          ...result.user,
          accessToken: result.accessToken,
        },
      });
    } catch (err: any) {
      if (err instanceof AppError) {
        if (err.statusCode === 401) {
          recordLoginFailure(req);
        }
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("[AuthController] Google link error:", err?.message || err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  async getMe(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const user = await authService.getMe(req.user.id);
      res.status(200).json({ success: true, message: "User profile", data: user });
    } catch (err) {
      if (err instanceof AppError) {
        res.status(err.statusCode).json({ success: false, message: err.message });
        return;
      }
      console.error("GetMe error:", err);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}

export const authController = new AuthController();
