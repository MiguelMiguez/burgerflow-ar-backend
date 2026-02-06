import { NextFunction, Request, Response } from "express";
import { getFirestore } from "../config/firebase";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

const USERS_COLLECTION = "users";

export interface User {
  uid: string;
  email: string;
  displayName?: string;
  tenantId: string;
  role: "owner" | "admin" | "employee";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  meta?: {
    phoneNumberId?: string;
    accessToken?: string;
  };
}

export const handleGetCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const firebaseUid = req.firebaseUid;

    if (!firebaseUid) {
      throw new HttpError(401, "Usuario no autenticado con Firebase.");
    }

    const db = getFirestore();
    const userDoc = await db
      .collection(USERS_COLLECTION)
      .doc(firebaseUid)
      .get();

    if (!userDoc.exists) {
      // Si el usuario no existe, lo creamos con datos básicos
      const newUser: Omit<User, "uid"> = {
        email: req.firebaseEmail || "",
        tenantId: (req.headers["x-tenant-id"] as string) || "",
        role: "admin",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.collection(USERS_COLLECTION).doc(firebaseUid).set(newUser);

      res.json({
        uid: firebaseUid,
        ...newUser,
      });
      return;
    }

    const userData = userDoc.data() as Omit<User, "uid">;
    res.json({
      uid: firebaseUid,
      ...userData,
    });
  } catch (error) {
    next(error);
  }
};

export const handleUpdateCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const firebaseUid = req.firebaseUid;

    if (!firebaseUid) {
      throw new HttpError(401, "Usuario no autenticado con Firebase.");
    }

    const { meta, displayName } = req.body;

    const db = getFirestore();
    const userRef = db.collection(USERS_COLLECTION).doc(firebaseUid);
    const userDoc = await userRef.get();

    const updateData: Partial<User> = {
      updatedAt: new Date().toISOString(),
    };

    if (displayName !== undefined) {
      updateData.displayName = displayName;
    }

    if (meta) {
      updateData.meta = meta;
    }

    if (userDoc.exists) {
      await userRef.update(updateData);
    } else {
      // Crear el usuario si no existe
      await userRef.set({
        email: req.firebaseEmail || "",
        tenantId: (req.headers["x-tenant-id"] as string) || "",
        role: "admin",
        isActive: true,
        createdAt: new Date().toISOString(),
        ...updateData,
      });
    }

    const updatedUser = await userRef.get();
    logger.info(`Usuario actualizado: ${firebaseUid}`);

    res.json({
      uid: firebaseUid,
      ...(updatedUser.data() as Omit<User, "uid">),
    });
  } catch (error) {
    next(error);
  }
};
