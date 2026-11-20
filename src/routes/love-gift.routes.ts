import { Router } from "express";
import { authenticate, authorize, optionalAuthenticate } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { loveGiftController } from "../controllers/love-gift.controller";
import { createUploadFileMiddleware } from "../utils/upload.utils";

const router = Router();

const loveGiftUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 1,
  subfolder: "love-gift",
});

// Submit a voluntary love gift with receipt verification (accessible to visitors and members)
router.post(
  "/",
  optionalAuthenticate,
  loveGiftUploadMiddleware,
  (req, res, next) => loveGiftController.submit(req, res, next)
);

// Get current user's love gift contribution summary & transaction history
router.get(
  "/my",
  authenticate,
  (req, res, next) => loveGiftController.getUserSummary(req, res, next)
);

// Admin: List all submitted love gifts with statistics and filters
router.get(
  "/",
  authenticate,
  authorize(UserRole.Admin),
  (req, res, next) => loveGiftController.adminList(req, res, next)
);

// Get single gift details
router.get(
  "/:id",
  authenticate,
  (req, res, next) => loveGiftController.findById(req, res, next)
);

// Admin: Update verification status (approve / reject)
router.patch(
  "/:id/status",
  authenticate,
  authorize(UserRole.Admin),
  (req, res, next) => loveGiftController.updateStatus(req, res, next)
);

export default router;
