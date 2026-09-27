import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Single canonical uploads directory — exported so app.ts can serve from the same path
export const UPLOADS_DIR = path.resolve(__dirname, "../../uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-msvideo",
  "video/x-matroska",
]);

const IMAGE_MAX_SIZE = 10 * 1024 * 1024;  // 10 MB
const VIDEO_MAX_SIZE = 200 * 1024 * 1024; // 200 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, unique);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: IMAGE_MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"));
    }
  },
});

export const uploadVideo = multer({
  storage,
  limits: { fileSize: VIDEO_MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_VIDEO_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only MP4, WebM, MOV, AVI, and MKV videos are allowed"));
    }
  },
});

// Chat attachment — images + common document types
const ALLOWED_ATTACHMENT_MIME = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

const ATTACHMENT_MAX_SIZE = 25 * 1024 * 1024; // 25 MB

export const uploadAttachment = multer({
  storage,
  limits: { fileSize: ATTACHMENT_MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_ATTACHMENT_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Allowed file types: images (JPEG, PNG, WebP, GIF) and documents (PDF, DOC, DOCX, XLS, XLSX, TXT)"));
    }
  },
});

export function getUploadUrl(filename: string): string {
  return `/api/uploads/${filename}`;
}
