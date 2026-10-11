import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { blogController } from "../controllers/blog.controller";
import { createUploadFileMiddleware } from "../utils/upload.utils";

const router = Router();
const blogUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 5,
  subfolder: "blog",
});

router.get("/", authenticate, (req, res, next) => blogController.list(req, res, next));
router.get("/:id", authenticate, (req, res, next) => blogController.findById(req, res, next));
router.post("/", authenticate, authorize(UserRole.Admin), blogUploadMiddleware, (req, res, next) => blogController.create(req, res, next));
router.patch("/:id", authenticate, authorize(UserRole.Admin), blogUploadMiddleware, (req, res, next) => blogController.update(req, res, next));
router.delete("/:id", authenticate, authorize(UserRole.Admin), (req, res, next) => blogController.remove(req, res, next));
export default router;
