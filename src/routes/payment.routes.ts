import { Router } from "express";
import { authenticate, authorize, requirePaymentOrActive } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { paymentController } from "../controllers/payment.controller";
import { createUploadFileMiddleware } from "../utils/upload.utils";

const router = Router();

const paymentUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 1,
  subfolder: "payment",
});

router.get(
  "/",
  authenticate,
  authorize(
    UserRole.Church,
    UserRole.Company,
    UserRole.User,
    UserRole.Admin,
    UserRole.Ministry
  ),
  (req, res, next) => paymentController.list(req, res, next)
);

router.get(
  "/user/:userId",
  authenticate,
  authorize(
    UserRole.Church,
    UserRole.Company,
    UserRole.User,
    UserRole.Admin,
    UserRole.Ministry
  ),
  (req, res, next) => paymentController.list(req, res, next)
);

// Allow PENDING and INACTIVE users to check validity status; block SUSPENDED users
router.get(
  "/status",
  authenticate,
  requirePaymentOrActive,
  (req, res, next) => paymentController.getValidityStatus(req, res, next)
);

router.get(
  "/user/:userId/status",
  authenticate,
  requirePaymentOrActive,
  (req, res, next) => paymentController.getValidityStatus(req, res, next)
);

router.get(
  "/:id",
  authenticate,
  authorize(
    UserRole.Church,
    UserRole.Company,
    UserRole.User,
    UserRole.Admin,
    UserRole.Ministry
  ),
  (req, res, next) => paymentController.findById(req, res, next)
);

router.patch(
  "/:id",
  authenticate,
  authorize(UserRole.Admin),
  (req, res, next) => paymentController.update(req, res, next)
);

router.patch(
  "/:id/status",
  authenticate,
  authorize(UserRole.Admin),
  (req, res, next) => paymentController.update(req, res, next)
);

router.patch(
  "/user/:userId/status",
  authenticate,
  authorize(UserRole.Admin),
  (req, res, next) => paymentController.updateUserPaymentStatus(req, res, next)
);

router.delete(
  "/:id",
  authenticate,
  authorize(UserRole.Admin),
  (req, res, next) => paymentController.remove(req, res, next)
);

// Allow PENDING and INACTIVE users to submit receipt; block SUSPENDED users
router.post(
  "/verify",
  authenticate,
  requirePaymentOrActive,
  paymentUploadMiddleware,
  (req, res, next) => paymentController.verifyReceipt(req, res, next)
);

export default router;
