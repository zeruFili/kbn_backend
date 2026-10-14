import { Router } from "express";
import {
  authenticate,
  requireExactRole,
} from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { rolePaymentController } from "../controllers/role-payment.controller";

const router = Router();

// Only users with the ADMIN role can create, view, update, activate, or deactivate role payment configurations.
router.use(
  authenticate,
  requireExactRole(
    UserRole.Admin,
    "Only users with the ADMIN role can access or manage role payment configurations"
  )
);

// Create a new role payment configuration
router.post("/", (req, res, next) =>
  rolePaymentController.create(req, res, next)
);

// View / list role payment configurations (supports query filters: role, status, page, limit)
router.get("/", (req, res, next) =>
  rolePaymentController.findAll(req, res, next)
);

// View role payment configuration by user role
router.get("/role/:role", (req, res, next) =>
  rolePaymentController.findByRole(req, res, next)
);

// View role payment configuration by ID
router.get("/:id", (req, res, next) =>
  rolePaymentController.findById(req, res, next)
);

// Update role payment configuration (monthlyAmount, status, role)
router.put("/:id", (req, res, next) =>
  rolePaymentController.update(req, res, next)
);
router.patch("/:id", (req, res, next) =>
  rolePaymentController.update(req, res, next)
);

// Update status (ACTIVE / INACTIVE)
router.patch("/:id/status", (req, res, next) =>
  rolePaymentController.updateStatus(req, res, next)
);

// Activate role payment configuration
router.patch("/:id/activate", (req, res, next) =>
  rolePaymentController.activate(req, res, next)
);

// Deactivate role payment configuration
router.patch("/:id/deactivate", (req, res, next) =>
  rolePaymentController.deactivate(req, res, next)
);

// Delete role payment configuration
router.delete("/:id", (req, res, next) =>
  rolePaymentController.remove(req, res, next)
);

export default router;
