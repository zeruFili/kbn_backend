import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { eventController } from "../controllers/event.controller";

const router = Router();
router.use(authenticate, authorize(UserRole.Admin));
router.get("/", (req, res, next) => eventController.list(req, res, next));
router.get("/:id", (req, res, next) => eventController.findById(req, res, next));
router.post("/", (req, res, next) => eventController.create(req, res, next));
router.patch("/:id", (req, res, next) => eventController.update(req, res, next));
router.delete("/:id", (req, res, next) => eventController.remove(req, res, next));
export default router;
