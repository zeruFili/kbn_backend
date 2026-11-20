import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { featuredController } from "../controllers/featured.controller";

const router = Router();

// Public routes for landing page & clients
router.get("/", (req, res, next) => featuredController.getCombined(req, res, next));
router.get("/members", (req, res, next) => featuredController.getFeaturedMembers(req, res, next));
router.get("/companies", (req, res, next) => featuredController.getFeaturedCompanies(req, res, next));

// Admin routes for updating selections
router.put(
  "/members",
  authenticate,
  authorize(UserRole.Admin),
  (req, res, next) => featuredController.setFeaturedMembers(req, res, next)
);

router.post(
  "/members",
  authenticate,
  authorize(UserRole.Admin),
  (req, res, next) => featuredController.setFeaturedMembers(req, res, next)
);

router.put(
  "/companies",
  authenticate,
  authorize(UserRole.Admin),
  (req, res, next) => featuredController.setFeaturedCompanies(req, res, next)
);

router.post(
  "/companies",
  authenticate,
  authorize(UserRole.Admin),
  (req, res, next) => featuredController.setFeaturedCompanies(req, res, next)
);

export default router;
