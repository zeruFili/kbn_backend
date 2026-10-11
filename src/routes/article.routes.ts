import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { articleController } from "../controllers/article.controller";
import { createUploadFileMiddleware } from "../utils/upload.utils";

const router = Router();
const articleUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 5,
  subfolder: "article",
});

router.get("/", authenticate,  (req, res, next) => articleController.list(req, res, next));
router.get("/:id", authenticate, (req, res, next) => articleController.findById(req, res, next));
router.post("/", authenticate, authorize(UserRole.Admin), articleUploadMiddleware, (req, res, next) => articleController.create(req, res, next));
router.patch("/:id", authenticate, authorize(UserRole.Admin), articleUploadMiddleware, (req, res, next) => articleController.update(req, res, next));
router.delete("/:id", authenticate, authorize(UserRole.Admin), (req, res, next) => articleController.remove(req, res, next));
export default router;
