import "express";

declare module "express-serve-static-core" {
  interface Request {
    userRole?: "admin" | "user";
    firebaseUid?: string;
    firebaseEmail?: string;
  }
}
