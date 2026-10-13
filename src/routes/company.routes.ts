import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { companyController } from "../controllers/company.controller";
import { createUploadFieldsMiddleware } from "../utils/upload.utils";

const router = Router();

const companyUploadMiddleware = createUploadFieldsMiddleware({
  fields: [
    { name: "attachmentFiles", maxCount: 5 },
    { name: "company_logo", maxCount: 1 },
    { name: "business_license", maxCount: 1 },
    { name: "logo", maxCount: 1 },
    { name: "license", maxCount: 1 },
  ],
  subfolder: "companys",
});

// Listing and details
router.get(
  "/",
  authenticate,
  authorize(
    UserRole.Admin,
    UserRole.Company,
    UserRole.User,
    UserRole.Church,
    UserRole.Ministry
  ),
  (req, res, next) => companyController.findAll(req, res, next)
);

router.get("/my-company", authenticate, (req, res, next) =>
  companyController.findMyCompany(req, res, next)
);

router.get(
  "/:id",
  authenticate,
  authorize(
    UserRole.Admin,
    UserRole.Company,
    UserRole.User,
    UserRole.Church,
    UserRole.Ministry
  ),
  (req, res, next) => companyController.findById(req, res, next)
);

// Creation
router.post(
  "/",
  authenticate,
  companyUploadMiddleware,
  (req, res, next) => companyController.create(req, res, next)
);

// General updates
router.patch(
  "/:id",
  authenticate,
  companyUploadMiddleware,
  (req, res, next) => companyController.update(req, res, next)
);

// Verification status (Admin only)
router.patch(
  "/:id/verification-status",
  authenticate,
  authorize(UserRole.Admin),
  (req, res, next) => companyController.updateVerificationStatus(req, res, next)
);

// Active/Inactive status toggle
router.patch("/:id/status", authenticate, (req, res, next) =>
  companyController.updateStatus(req, res, next)
);

// Deletion
router.delete("/:id", authenticate, (req, res, next) =>
  companyController.remove(req, res, next)
);

// Social Media sub-routes
router.get("/:id/social-media", authenticate, (req, res, next) =>
  companyController.getSocialMedia(req, res, next)
);

router.post("/:id/social-media", authenticate, (req, res, next) =>
  companyController.addOrUpdateSocialMedia(req, res, next)
);

router.delete(
  "/:id/social-media/:platform",
  authenticate,
  (req, res, next) => companyController.removeSocialMedia(req, res, next)
);

export default router;
