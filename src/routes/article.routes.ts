import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { articleController } from "../controllers/article.controller";

const router = Router();
router.use(authenticate, authorize(UserRole.Admin));
router.get("/", (req, res, next) => articleController.list(req, res, next));
router.get("/:id", (req, res, next) => articleController.findById(req, res, next));
router.post("/", (req, res, next) => articleController.create(req, res, next));
router.patch("/:id", (req, res, next) => articleController.update(req, res, next));
router.delete("/:id", (req, res, next) => articleController.remove(req, res, next));
export default router;
