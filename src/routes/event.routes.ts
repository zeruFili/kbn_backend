import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { eventController } from "../controllers/event.controller";
import { createUploadFileMiddleware } from "../utils/upload.utils";

const router = Router();
const eventUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 5,
  subfolder: "event",
});

router.get("/", authenticate, (req, res, next) => eventController.list(req, res, next));
router.get("/:id", authenticate,  (req, res, next) => eventController.findById(req, res, next));
router.post("/", authenticate, authorize(UserRole.Admin), eventUploadMiddleware, (req, res, next) => eventController.create(req, res, next));
router.patch("/:id", authenticate, authorize(UserRole.Admin), eventUploadMiddleware, (req, res, next) => eventController.update(req, res, next));
router.delete("/:id", authenticate, authorize(UserRole.Admin), (req, res, next) => eventController.remove(req, res, next));
export default router;
