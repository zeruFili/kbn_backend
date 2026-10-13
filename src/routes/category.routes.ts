import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { categoryController } from "../controllers/category.controller";
import { createUploadFieldsMiddleware } from "../utils/upload.utils";

const router = Router();

const categoryUploadMiddleware = createUploadFieldsMiddleware({
  fields: [
    { name: "icon", maxCount: 1 },
    { name: "attachmentFiles", maxCount: 1 },
  ],
  subfolder: "categories",
});

// Listing and retrieval (Available to all authenticated users so they can browse/select categories)
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
  (req, res, next) => categoryController.findAll(req, res, next)
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
  (req, res, next) => categoryController.findById(req, res, next)
);

// All creation and management operations are strictly restricted to Admin users
router.use(authenticate, authorize(UserRole.Admin));

router.post(
  "/",
  categoryUploadMiddleware,
  (req, res, next) => categoryController.create(req, res, next)
);

router.patch(
  "/:id",
  categoryUploadMiddleware,
  (req, res, next) => categoryController.update(req, res, next)
);

router.patch("/:id/status", (req, res, next) =>
  categoryController.updateStatus(req, res, next)
);

router.delete("/:id", (req, res, next) =>
  categoryController.remove(req, res, next)
);

export default router;
