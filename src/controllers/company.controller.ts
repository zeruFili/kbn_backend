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

    if (!logoPath && !licensePath && attachmentFiles.length >= 2) {
      const docFile = attachmentFiles.find((f) => isDoc(f.mimetype));
      const imgFile = attachmentFiles.find((f) => isImg(f.mimetype));

      if (docFile && imgFile) {
        licensePath = `/${UPLOAD_DIR}/companys/${docFile.filename}`;
        logoPath = `/${UPLOAD_DIR}/companys/${imgFile.filename}`;
      } else {
        logoPath = `/${UPLOAD_DIR}/companys/${attachmentFiles[0].filename}`;
        licensePath = `/${UPLOAD_DIR}/companys/${attachmentFiles[1].filename}`;
      }
    } else {
      for (const file of attachmentFiles) {
        const filePath = `/${UPLOAD_DIR}/companys/${file.filename}`;
        if (!licensePath && (isDoc(file.mimetype) || logoPath)) {
          licensePath = filePath;
        } else if (!logoPath && isImg(file.mimetype)) {
          logoPath = filePath;
        } else if (!licensePath) {
          licensePath = filePath;
        } else if (!logoPath) {
          logoPath = filePath;
        }
      }
    }
  }

  return { logoPath, licensePath };
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

  async findMyCompany(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new AppError(401, "Unauthorized");
      }

      const company = await companyService.findByOwnerId(req.user.id);
      if (!company) {
        res.status(404).json({
          success: false,
          message: "No company profile found for current user",
        });
        return;
      }

      res.status(200).json({ success: true, data: company });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { logoPath, licensePath } = resolveCompanyFiles(req);

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
      const { logoPath, licensePath } = resolveCompanyFiles(req);

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
        ...(licensePath ? { business_license: licensePath } : {}),
        ...(socialMedia !== undefined ? { social_media: socialMedia } : {}),
      };

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
