import { Router } from "express";
import { authenticate, authorize, optionalAuthenticate } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { userController } from "../controllers/user.controller";
import { userUploadMiddleware } from "../middlewares/user-upload.middleware";

const router = Router();

router.get(
  "/",
  optionalAuthenticate,
  (req, res, next) => userController.findAll(req, res, next)
);
router.get(
  "/:id",
  optionalAuthenticate,
  (req, res, next) => userController.findById(req, res, next)
);

router.post("/", userUploadMiddleware, (req, res, next) => userController.create(req, res, next));

// Allow users to update their own profile/image and admins to update any user
router.patch("/:id", authenticate, userUploadMiddleware, (req, res, next) =>
  userController.update(req, res, next)
);

// Admin-only management endpoints
router.use(authenticate, authorize(UserRole.Admin));

router.patch("/:id/role", (req, res, next) => userController.updateRole(req, res, next));
router.patch("/:id/status", (req, res, next) => userController.updateStatus(req, res, next));
router.delete("/:id", (req, res, next) => userController.softDelete(req, res, next));

export default router;
