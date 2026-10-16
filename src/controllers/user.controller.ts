import { Request, Response, NextFunction } from "express";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from "../validators/user.dto";
import { UserRole } from "../enums/user-role.enum";
import { UserStatus } from "../enums/user-status.enum";
import { OtpPurpose } from "../enums/otp-purpose.enum";
import { userService } from "../services/user.service";
import { otpService } from "../services/otp.service";
import {
  cleanupUploadedFiles,
  getUploadedFilePath,
} from "../utils/upload.utils";
import { USER_UPLOAD_SUBFOLDER } from "../middlewares/user-upload.middleware";
import { generateAccessToken } from "../utils/jwt.utils";
import { AppDataSource } from "../config/data-source";
import { User } from "../entities/User";

function resolveUserProfileImage(req: Request): string | undefined {
  return (
    getUploadedFilePath(req, "profileImage", USER_UPLOAD_SUBFOLDER) ||
    getUploadedFilePath(req, "profile_image", USER_UPLOAD_SUBFOLDER) ||
    getUploadedFilePath(req, "avatar", USER_UPLOAD_SUBFOLDER) ||
    getUploadedFilePath(req, "image", USER_UPLOAD_SUBFOLDER) ||
    getUploadedFilePath(req, "attachmentFiles", USER_UPLOAD_SUBFOLDER) ||
    (typeof req.body.profileImage === "string" ? req.body.profileImage : undefined) ||
    (typeof req.body.profile_image === "string" ? req.body.profile_image : undefined) ||
    (typeof req.body.avatar === "string" ? req.body.avatar : undefined)
  );
}

async function validateDto<T extends object>(dtoClass: new () => T, plain: object): Promise<T> {
  const instance = plainToInstance(dtoClass, plain);
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints || {}))
      .flat()
      .join(", ");
    throw new AppError(400, messages);
  }

  return instance;
}

export class UserController {
  async findAll(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

      let role: UserRole | undefined = undefined;
      if (req.query.role) {
        const rawRole = (req.query.role as string).trim().toLowerCase();
        if (rawRole !== "all" && rawRole !== "") {
          const matched = Object.values(UserRole).find((r) => r.toLowerCase() === rawRole);
          if (!matched) {
            res.status(400).json({ success: false, message: `Invalid role: ${req.query.role}` });
            return;
          }
          role = matched;
        }
      }

      let status: UserStatus | undefined = undefined;
      if (req.query.status) {
        const rawStatus = (req.query.status as string).trim().toLowerCase();
        if (rawStatus !== "all" && rawStatus !== "") {
          const matched = Object.values(UserStatus).find((s) => s.toLowerCase() === rawStatus);
          if (!matched) {
            res.status(400).json({ success: false, message: `Invalid status: ${req.query.status}` });
            return;
          }
          status = matched;
        }
      }

      const isActiveParam = req.query.is_active as string | undefined;
      const is_active = isActiveParam !== undefined ? isActiveParam === "true" : undefined;
      const search = req.query.search as string | undefined;
      const sort_by = req.query.sort_by as string | undefined;
      const sort_order = req.query.sort_order as string | undefined;
      const include_admin = req.query.include_admin === "true" || req.query.includeAdmin === "true";

      const currentUser = req.user
        ? { id: req.user.id, role: req.user.role }
        : undefined;

      const result = await userService.findAll(
        page,
        limit,
        role,
        is_active,
        search,
        status,
        currentUser,
        sort_by,
        sort_order,
        include_admin
      );
      res.status(200).json({ success: true, ...result });

    } catch (error) {
      next(error);
    }
  }

  async findById(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id as string;
      const id = idParam === "me" && req.user ? req.user.id : idParam;
      const user = await userService.findById(id);
      res.status(200).json({ success: true, data: user });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const imagePath = resolveUserProfileImage(req);
      const payload = {
        ...req.body,
        ...(imagePath ? { profileImage: imagePath } : {}),
      };
      const dto = await validateDto(CreateUserDto, payload);

      const isAdmin = req.user?.role === UserRole.Admin;
      if (!isAdmin) {
        // Step 1: Validates inputs and checks email uniqueness
        const existingEmail = await AppDataSource.getRepository(User).findOne({
          where: { email: dto.email.trim().toLowerCase() },
        });
        if (existingEmail) {
          cleanupUploadedFiles(req);
          res.status(409).json({ success: false, message: "Email already exists" });
          return;
        }

        if (!dto.phone) {
          cleanupUploadedFiles(req);
          res.status(400).json({
            success: false,
            message: "Phone number is required for registration and OTP verification.",
          });
          return;
        }

        // Before successfully registering the user, send an OTP via SMS and require verification
        if (!dto.otp) {
          cleanupUploadedFiles(req);
          const sendResult = await otpService.generateAndSendOtp(dto.phone, OtpPurpose.REGISTER);
          res.status(200).json({
            success: true,
            requiresOtp: true,
            message: "Verification code sent to your phone via SMS. Please enter the OTP to complete registration.",
            data: {
              identifier: sendResult.identifier,
              expiresAt: sendResult.expiresAt,
            },
          });
          return;
        }
      }

      const user = await userService.create(dto, isAdmin);
      const accessToken = generateAccessToken({
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
      });

      res.status(201).json({
        success: true,
        accessToken,
        data: {
          id: user.id,
          fullName: user.fullName,
          full_name: user.fullName,
          email: user.email,
          role: user.role,
          status: user.status,
          profileImage: user.profileImage,
          accessToken,
        },
        message: "User created successfully",
      });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const idParam = req.params.id as string;
      if (!req.user) {
        cleanupUploadedFiles(req);
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const id = idParam === "me" ? req.user.id : idParam;
      const imagePath = resolveUserProfileImage(req);

      const isImageRemoved =
        req.body.remove_profile_image === "true" ||
        req.body.remove_profile_image === true ||
        req.body.removeProfileImage === "true" ||
        req.body.removeProfileImage === true ||
        req.body.remove_avatar === "true" ||
        req.body.remove_avatar === true ||
        req.body.profileImage === "" ||
        req.body.profileImage === "null" ||
        req.body.profileImage === null ||
        req.body.profile_image === "" ||
        req.body.profile_image === "null" ||
        req.body.profile_image === null;

      let finalProfileImage: string | null | undefined = undefined;
      if (imagePath) {
        finalProfileImage = imagePath;
      } else if (isImageRemoved) {
        finalProfileImage = null;
      } else if (typeof req.body.profileImage === "string" && req.body.profileImage.trim()) {
        finalProfileImage = req.body.profileImage.trim();
      } else if (typeof req.body.profile_image === "string" && req.body.profile_image.trim()) {
        finalProfileImage = req.body.profile_image.trim();
      }

      const payload = {
        ...req.body,
        ...(finalProfileImage !== undefined ? { profileImage: finalProfileImage } : {}),
      };

      delete (payload as Record<string, unknown>).remove_profile_image;
      delete (payload as Record<string, unknown>).removeProfileImage;
      delete (payload as Record<string, unknown>).remove_avatar;
      delete (payload as Record<string, unknown>).profile_image;
      delete (payload as Record<string, unknown>).avatar;

      const dto = await validateDto(UpdateUserDto, payload);
      const user = await userService.update(id, dto, { id: req.user.id, role: req.user.role });
      res.status(200).json({ success: true, data: user, message: "User updated successfully" });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }

  async updateRole(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const dto = await validateDto(UpdateUserRoleDto, req.body);

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const user = await userService.updateRole(id, dto.role, {
        id: req.user.id,
        role: req.user.role,
      });
      res.status(200).json({ success: true, data: user, message: "User role updated successfully" });
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;
      const dto = await validateDto(UpdateUserStatusDto, req.body);

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      const user = await userService.updateStatus(id, {
        status: dto.status,
        is_active: dto.is_active,
        expirationDate: dto.expirationDate,
        expiration_date: dto.expiration_date,
      }, {
        id: req.user.id,
        role: req.user.role,
      });
      res.status(200).json({ success: true, data: user, message: "User status updated successfully" });
    } catch (error) {
      next(error);
    }
  }

  async softDelete(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id as string;

      if (!req.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      await userService.softDelete(id, { id: req.user.id, role: req.user.role });
      res.status(200).json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      next(error);
    }
  }
}


export const userController = new UserController();
