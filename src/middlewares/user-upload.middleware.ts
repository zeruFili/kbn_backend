import { createUploadFieldsMiddleware, ALLOWED_IMAGE_TYPES } from "../utils/upload.utils";

export const USER_UPLOAD_SUBFOLDER = "users";

export const userUploadMiddleware = createUploadFieldsMiddleware({
  fields: [
    { name: "profileImage", maxCount: 1 },
    { name: "profile_image", maxCount: 1 },
    { name: "avatar", maxCount: 1 },
    { name: "image", maxCount: 1 },
    { name: "attachmentFiles", maxCount: 1 },
  ],
  subfolder: USER_UPLOAD_SUBFOLDER,
  allowedTypes: ALLOWED_IMAGE_TYPES,
  fileSizeLimit: 5 * 1024 * 1024, // 5MB limit for user profile image
});
