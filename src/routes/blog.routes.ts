import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { blogController } from "../controllers/blog.controller";

const router = Router();
router.use(authenticate, authorize(UserRole.Admin));
router.get("/", (req, res, next) => blogController.list(req, res, next));
router.get("/:id", (req, res, next) => blogController.findById(req, res, next));
router.post("/", (req, res, next) => blogController.create(req, res, next));
router.patch("/:id", (req, res, next) => blogController.update(req, res, next));
router.delete("/:id", (req, res, next) => blogController.remove(req, res, next));
export default router;
