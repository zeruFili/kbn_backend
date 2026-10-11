import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { paymentController } from "../controllers/payment.controller";
import { createUploadFileMiddleware } from "../utils/upload.utils";

const router = Router();

const paymentUploadMiddleware = createUploadFileMiddleware({
  fieldName: "attachmentFiles",
  maxCount: 1,
  subfolder: "payment",
});

router.get(
  "/",
  authenticate,
  (req, res, next) => paymentController.list(req, res, next)
);

router.post(
  "/verify",
  authenticate,
  paymentUploadMiddleware,
  (req, res, next) => paymentController.verifyReceipt(req, res, next)
);

export default router;
