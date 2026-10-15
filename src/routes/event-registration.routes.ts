import { Router } from "express";
import { authenticate, authorize, requireActiveUser } from "../middlewares/auth.middleware";
import { UserRole } from "../enums/user-role.enum";
import { eventRegistrationController } from "../controllers/event-registration.controller";

const router = Router();

// All registration routes require active authentication
router.use(authenticate, requireActiveUser);

// 1. Register for an event
router.post("/", (req, res, next) =>
  eventRegistrationController.create(req, res, next)
);

// 2. View user's own registrations
router.get("/my", (req, res, next) =>
  eventRegistrationController.listMy(req, res, next)
);

// 3. View registrations for a specific event
router.get("/event/:eventId", (req, res, next) =>
  eventRegistrationController.listByEvent(req, res, next)
);

// 4. List registrations (users view their own; admins can view all with filters)
router.get("/", (req, res, next) =>
  eventRegistrationController.list(req, res, next)
);

// 5. View specific registration by ID
router.get("/:id", (req, res, next) =>
  eventRegistrationController.findById(req, res, next)
);

// 6. Admin: Approve / reject / update registration status
router.patch("/:id/status", authorize(UserRole.Admin), (req, res, next) =>
  eventRegistrationController.updateStatus(req, res, next)
);

router.put("/:id/status", authorize(UserRole.Admin), (req, res, next) =>
  eventRegistrationController.updateStatus(req, res, next)
);

router.patch("/:id", authorize(UserRole.Admin), (req, res, next) =>
  eventRegistrationController.updateStatus(req, res, next)
);

// 7. Delete / Cancel registration
router.delete("/:id", (req, res, next) =>
  eventRegistrationController.remove(req, res, next)
);

export default router;
