import { Router } from "express";
import { verifyJWT, permit, blockGodModeOnNormalRoutes } from "../middlewares/auth.middleware.js";
import {
  createSubmission,
  createDraftSubmission,
  getSubmissions,
  getAuditorSubmissionExample,
  getSubmissionById,
  getApprovedData,
  getApprovedDataById,
  approveSubmission,
  rejectSubmission,
  deleteSubmission,
  submitSubmission,
  downloadSupportingDocument,
  deleteApprovedData,
} from "../controllers/submission.controller.js";

const router = Router();

router.use(verifyJWT);
router.use(blockGodModeOnNormalRoutes);

router.get("/", permit("SUBMISSION", "READ"), getSubmissions);
router.get(
  "/auditor/sample-submissions",
  permit("SUBMISSION", "READ"),
  getAuditorSubmissionExample
);
router.get("/approved-data", permit("SUBMISSION", "READ"), getApprovedData);
router.get(
  "/approved-data/:id",
  permit("SUBMISSION", "READ"),
  getApprovedDataById
);
router.delete(
  "/approved-data/:id",
  permit("APPROVED_DATA", "DELETE"),
  deleteApprovedData
);
router.get(
  "/:id/supporting-document",
  permit("SUBMISSION", "READ"),
  downloadSupportingDocument
);
router.get("/:id", permit("SUBMISSION", "READ"), getSubmissionById);
router.delete("/:id", permit("SUBMISSION", "DELETE"), deleteSubmission);
router.post("/", permit("SUBMISSION", "CREATE"), createSubmission);
router.post("/draft", permit("SUBMISSION", "CREATE"), createDraftSubmission);
router.put("/:id/submit", permit("SUBMISSION", "SUBMIT"), submitSubmission);
router.put("/:id/approve", permit("SUBMISSION", "UPDATE"), approveSubmission);
router.put("/:id/reject", permit("SUBMISSION", "UPDATE"), rejectSubmission);

export default router;
