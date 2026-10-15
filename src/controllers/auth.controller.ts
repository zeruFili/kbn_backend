import { Request, Response } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { authService } from "../services/auth.service";
import { LoginDto, ForgotPasswordDto, ResetPasswordDto, RegisterDto } from "../validators/auth.dto";
import { recordLoginFailure } from "../middlewares/login-rate-limit.middleware";

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

      const result = await authService.register({
        full_name: dto.full_name,
        email: dto.email,
        password: dto.password,
        role: dto.role,
        phone: dto.phone,
        website: dto.website,
        profileImage: dto.profileImage,
      });

      res.status(201).json({ success: true, message: "User registered successfully", data: result });
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

  async forgotPassword(req: Request, res: Response): Promise<void> {
    try {
      const dto = plainToInstance(ForgotPasswordDto, req.body);
      const errors = await validate(dto);
      if (errors.length > 0) {
        res.status(200).json({
          success: true,
          message: "If an account exists with this email, a password reset link has been sent.",
        });
        return;
      }

      await authService.forgotPassword(dto.email);
      res.status(200).json({
        success: true,
        message: "If an account exists with this email, a password reset link has been sent.",
      });
    } catch (err) {
      console.error("Forgot password error:", err);
      res.status(200).json({
        success: true,
        message: "If an account exists with this email, a password reset link has been sent.",
      });
    }
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    try {
      const token = req.params.token as string;
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
