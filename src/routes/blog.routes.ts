import { Router } from "express";
import { authenticate, authorize, optionalAuthenticate } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { blogController } from "../controllers/blog.controller";
import { createUploadFieldsMiddleware } from "../utils/upload.utils";

const router = Router();
const blogUploadMiddleware = createUploadFieldsMiddleware({
  fields: [
    { name: "image", maxCount: 1 },
    { name: "featured_image", maxCount: 5 },
    { name: "featuredImage", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
    { name: "attachmentFiles", maxCount: 5 },
  ],
  subfolder: "blog",
});

router.get("/", optionalAuthenticate, (req, res, next) => blogController.list(req, res, next));
router.get("/:id", optionalAuthenticate, (req, res, next) => blogController.findById(req, res, next));
router.post("/", authenticate, authorize(UserRole.Admin), blogUploadMiddleware, (req, res, next) => blogController.create(req, res, next));
router.patch("/:id", authenticate, authorize(UserRole.Admin), blogUploadMiddleware, (req, res, next) => blogController.update(req, res, next));
router.delete("/:id", authenticate, authorize(UserRole.Admin), (req, res, next) => blogController.remove(req, res, next));
export default router;
