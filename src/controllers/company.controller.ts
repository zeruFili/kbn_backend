import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AppError } from "../middlewares/error.middleware";
import { VerificationStatus } from "../enums/verification-status.enum";
import { SocialPlatform } from "../enums/social-platform.enum";
import { companyService } from "../services/company.service";
import {
  CreateCompanyDto,
  UpdateCompanyDto,
  UpdateCompanyVerificationStatusDto,
  UpdateCompanyStatusDto,
  CompanySocialMediaDto,
} from "../validators/company.dto";
import {
  contentResourceId,
  validateContentDto,
} from "../utils/content-controller.utils";
import {
  cleanupUploadedFiles,
  getUploadedFilePath,
  UPLOAD_DIR,
} from "../utils/upload.utils";

function resolveCompanyFiles(req: Request): {
  logoPath?: string;
  licensePath?: string;
  coverPath?: string;
} {
  let logoPath =
    getUploadedFilePath(req, "company_logo", "companys") ||
    getUploadedFilePath(req, "logo", "companys") ||
    (typeof req.body.company_logo === "string" ? req.body.company_logo : undefined) ||
    (typeof req.body.logo === "string" ? req.body.logo : undefined);

  let licensePath =
    getUploadedFilePath(req, "business_license", "companys") ||
    getUploadedFilePath(req, "license", "companys") ||
    (typeof req.body.business_license === "string" ? req.body.business_license : undefined) ||
    (typeof req.body.license === "string" ? req.body.license : undefined);

  let coverPath =
    getUploadedFilePath(req, "cover_image", "companys") ||
    getUploadedFilePath(req, "cover", "companys") ||
    (typeof req.body.cover_image === "string" ? req.body.cover_image : undefined) ||
    (typeof req.body.cover === "string" ? req.body.cover : undefined);

  const rawFiles = req.files as
    | Express.Multer.File[]
    | { [fieldname: string]: Express.Multer.File[] }
    | undefined;

  let attachmentFiles: Express.Multer.File[] = [];
  if (Array.isArray(rawFiles)) {
    attachmentFiles = rawFiles.filter(
      (f) =>
        f.fieldname === "attachmentFiles" ||
        f.fieldname === "files" ||
        (f.fieldname !== "company_logo" &&
          f.fieldname !== "logo" &&
          f.fieldname !== "cover_image" &&
          f.fieldname !== "cover" &&
          f.fieldname !== "business_license" &&
          f.fieldname !== "license")
    );
  } else if (typeof rawFiles === "object") {
    if (rawFiles["attachmentFiles"]) {
      attachmentFiles.push(...rawFiles["attachmentFiles"]);
    }
    if (rawFiles["files"]) {
      attachmentFiles.push(...rawFiles["files"]);
    }
  }

  if (attachmentFiles.length > 0) {
    const isDoc = (mimetype: string) =>
      mimetype.startsWith("application/") ||
      mimetype.includes("pdf") ||
      mimetype.includes("word") ||
      mimetype.includes("document");
    const isImg = (mimetype: string) => mimetype.startsWith("image/");

    for (const file of attachmentFiles) {
      const filePath = `/${UPLOAD_DIR}/companys/${file.filename}`;
      if (!licensePath && isDoc(file.mimetype)) {
        licensePath = filePath;
      } else if (!logoPath && isImg(file.mimetype)) {
        logoPath = filePath;
      } else if (!coverPath && isImg(file.mimetype)) {
        coverPath = filePath;
      } else if (!licensePath) {
        licensePath = filePath;
      } else if (!logoPath) {
        logoPath = filePath;
      } else if (!coverPath) {
        coverPath = filePath;
      }
    }
  }

  return { logoPath, licensePath, coverPath };
}

export class CompanyController {
  async findAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const search = req.query.search as string | undefined;
      const business_category_id = (req.query.business_category_id ?? req.query.category_id) as
        | string
        | undefined;
      const verification_status = req.query.verification_status as
        | VerificationStatus
        | undefined;
      const isActiveParam = req.query.is_active as string | undefined;
      const is_active =
        isActiveParam !== undefined ? isActiveParam === "true" : undefined;
      const sort_by = req.query.sort_by as
        | "created_at"
        | "company_name"
        | "updated_at"
        | undefined;
      const sort_order =
        (req.query.sort_order as string)?.toUpperCase() === "ASC"
          ? "ASC"
          : "DESC";

      if (
        verification_status &&
        !Object.values(VerificationStatus).includes(verification_status)
      ) {
        res.status(400).json({
          success: false,
          message: `Invalid verification status: ${verification_status}`,
        });
        return;
      }

      const result = await companyService.findAll({
        page,
        limit,
        search,
        business_category_id,
        verification_status,
        is_active,
        sort_by,
        sort_order,
      });

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  async findById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = contentResourceId(req);
      const company = await companyService.findById(id);
      res.status(200).json({ success: true, data: company });
    } catch (error) {
      next(error);
    }
  }

  async findMyCompanies(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const companies = await companyService.findAllByOwnerId(
        req.user.id,
        req.user.email
      );

      res.status(200).json({ success: true, data: companies });
    } catch (error) {
      next(error);
    }
  }

  async findMyCompany(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const companies = await companyService.findAllByOwnerId(
        req.user.id,
        req.user.email
      );

      const company = companies[0] || null;
      if (!company) {
        res.status(404).json({
          success: false,
          message: "No company profile found for current user",
        });
        return;
      }

      res.status(200).json({ success: true, data: company, companies });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { logoPath, licensePath, coverPath } = resolveCompanyFiles(req);

      let socialMedia = req.body.social_media;
      if (typeof socialMedia === "string") {
        try {
          socialMedia = JSON.parse(socialMedia);
        } catch {}
      }

      const payload = {
        ...req.body,
        ...(req.body.name && !req.body.company_name
          ? { company_name: req.body.name }
          : {}),
        ...(req.body.category_id && !req.body.business_category_id
          ? { business_category_id: req.body.category_id }
          : {}),
        ...(req.body.owner_name && !req.body.owner_primary_contact
          ? { owner_primary_contact: req.body.owner_name }
          : {}),
        ...(req.body.phone && !req.body.phone_number
          ? { phone_number: req.body.phone }
          : {}),
        ...(req.body.address && !req.body.physical_address
          ? { physical_address: req.body.address }
          : {}),
        ...(logoPath ? { company_logo: logoPath } : {}),
        ...(coverPath ? { cover_image: coverPath } : {}),
        ...(licensePath ? { business_license: licensePath } : {}),
        ...(socialMedia !== undefined ? { social_media: socialMedia } : {}),
      };

      const dto = await validateContentDto(CreateCompanyDto, payload);
      const company = await companyService.create(dto, req.user?.id);

      res.status(201).json({
        success: true,
        data: company,
        message: "Company created successfully",
      });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = contentResourceId(req);
      const { logoPath, licensePath, coverPath } = resolveCompanyFiles(req);

      let socialMedia = req.body.social_media;
      if (typeof socialMedia === "string") {
        try {
          socialMedia = JSON.parse(socialMedia);
        } catch {}
      }

      // Check explicit removal flags or empty strings
      const isLogoRemoved =
        req.body.remove_company_logo === "true" ||
        req.body.remove_company_logo === true ||
        req.body.remove_logo === "true" ||
        req.body.remove_logo === true ||
        req.body.company_logo === "" ||
        req.body.company_logo === "null" ||
        req.body.company_logo === null;

      const isCoverRemoved =
        req.body.remove_cover_image === "true" ||
        req.body.remove_cover_image === true ||
        req.body.remove_cover === "true" ||
        req.body.remove_cover === true ||
        req.body.cover_image === "" ||
        req.body.cover_image === "null" ||
        req.body.cover_image === null;

      let finalLogo: string | null | undefined = undefined;
      if (logoPath) {
        finalLogo = logoPath;
      } else if (isLogoRemoved) {
        finalLogo = null;
      } else if (typeof req.body.company_logo === "string" && req.body.company_logo.trim()) {
        finalLogo = req.body.company_logo.trim();
      }

      let finalCover: string | null | undefined = undefined;
      if (coverPath) {
        finalCover = coverPath;
      } else if (isCoverRemoved) {
        finalCover = null;
      } else if (typeof req.body.cover_image === "string" && req.body.cover_image.trim()) {
        finalCover = req.body.cover_image.trim();
      }

      const payload = {
        ...req.body,
        ...(req.body.name && !req.body.company_name
          ? { company_name: req.body.name }
          : {}),
        ...(req.body.category_id && !req.body.business_category_id
          ? { business_category_id: req.body.category_id }
          : {}),
        ...(req.body.owner_name && !req.body.owner_primary_contact
          ? { owner_primary_contact: req.body.owner_name }
          : {}),
        ...(req.body.phone && !req.body.phone_number
          ? { phone_number: req.body.phone }
          : {}),
        ...(req.body.address && !req.body.physical_address
          ? { physical_address: req.body.address }
          : {}),
        ...(finalLogo !== undefined ? { company_logo: finalLogo } : {}),
        ...(finalCover !== undefined ? { cover_image: finalCover } : {}),
        ...(licensePath ? { business_license: licensePath } : {}),
        ...(socialMedia !== undefined ? { social_media: socialMedia } : {}),
      };

      // Strip non-DTO removal helper fields
      delete (payload as Record<string, unknown>).remove_company_logo;
      delete (payload as Record<string, unknown>).remove_logo;
      delete (payload as Record<string, unknown>).remove_cover_image;
      delete (payload as Record<string, unknown>).remove_cover;

      const dto = await validateContentDto(UpdateCompanyDto, payload);
      const company = await companyService.update(id, dto, req.user);

      res.status(200).json({
        success: true,
        data: company,
        message: "Company updated successfully",
      });
    } catch (error) {
      cleanupUploadedFiles(req);
      next(error);
    }
  }

  async updateVerificationStatus(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = contentResourceId(req);
      const dto = await validateContentDto(
        UpdateCompanyVerificationStatusDto,
        req.body
      );
      const company = await companyService.updateVerificationStatus(
        id,
        dto.verification_status
      );

      res.status(200).json({
        success: true,
        data: company,
        message: "Company verification status updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = contentResourceId(req);
      const dto = await validateContentDto(UpdateCompanyStatusDto, req.body);
      const company = await companyService.updateStatus(
        id,
        dto.is_active,
        req.user
      );

      res.status(200).json({
        success: true,
        data: company,
        message: "Company status updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = contentResourceId(req);
      await companyService.remove(id, req.user);

      res.status(200).json({
        success: true,
        message: "Company deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async getSocialMedia(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = contentResourceId(req);
      const data = await companyService.getSocialMedia(id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async addOrUpdateSocialMedia(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = contentResourceId(req);
      const dto = await validateContentDto(CompanySocialMediaDto, req.body);
      const data = await companyService.addOrUpdateSocialMedia(
        id,
        dto,
        req.user
      );

      res.status(200).json({
        success: true,
        data,
        message: "Social media link updated successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  async removeSocialMedia(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = contentResourceId(req);
      const platform = req.params.platform as SocialPlatform;

      if (!platform || !Object.values(SocialPlatform).includes(platform)) {
        res.status(400).json({
          success: false,
          message: `Invalid social platform: ${platform}`,
        });
        return;
      }

      await companyService.removeSocialMedia(id, platform, req.user);

      res.status(200).json({
        success: true,
        message: "Social media link removed successfully",
      });
    } catch (error) {
      next(error);
    }
  }
}

export const companyController = new CompanyController();
