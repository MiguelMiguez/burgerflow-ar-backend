import admin from "firebase-admin";
import { getFirestore } from "../config/firebase";
import { CreateUserInput, User, AuthResponse, LoginInput } from "../models/user";
import { CreateTenantInput, Tenant } from "../models/tenant";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

const db = getFirestore();
const USERS_COLLECTION = "users";
const TENANTS_COLLECTION = "tenants";

/**
 * Registra un nuevo usuario y crea automáticamente su tenant
 */
export const registerUser = async (
  input: CreateUserInput
): Promise<AuthResponse> => {
  try {
    // 1. Crear usuario en Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
    });

    // 2. Crear el tenant asociado
    const tenantData: Omit<Tenant, "id"> = {
      name: input.tenantName,
      ownerId: userRecord.uid,
      hasPickup: true, // Por defecto activado
      hasDelivery: false, // Por defecto desactivado
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    const tenantRef = await db.collection(TENANTS_COLLECTION).add(tenantData);
    const tenantId = tenantRef.id;

    // 3. Crear documento de usuario en Firestore
    const userData: Omit<User, "uid"> = {
      email: userRecord.email!,
      displayName: input.displayName,
      tenantId,
      role: "owner",
      isActive: true,
      createdAt: new Date().toISOString(),
    };

    await db.collection(USERS_COLLECTION).doc(userRecord.uid).set(userData);

    // 4. Crear custom token para autenticación
    const customToken = await admin.auth().createCustomToken(userRecord.uid, {
      tenantId,
      role: "owner",
    });

    logger.info(
      `Usuario registrado exitosamente: ${input.email} (Tenant: ${input.tenantName})`
    );

    return {
      uid: userRecord.uid,
      email: userRecord.email!,
      displayName: input.displayName,
      tenantId,
      role: "owner",
      customToken,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      logger.error(`Error al registrar usuario: ${error.message}`);
      
      if (error.message.includes("email-already-exists")) {
        throw new HttpError(400, "El email ya está registrado");
      }
      
      throw new HttpError(500, `Error al registrar usuario: ${error.message}`);
    }
    
    throw new HttpError(500, "Error desconocido al registrar usuario");
  }
};

/**
 * Autentica a un usuario existente
 */
export const loginUser = async (input: LoginInput): Promise<AuthResponse> => {
  try {
    // Firebase Admin SDK no tiene método para verificar password directamente
    // El login se debe hacer desde el cliente, aquí solo generamos el token
    // Esta función es principalmente para obtener datos del usuario después del login

    // Buscar usuario por email
    const userRecord = await admin.auth().getUserByEmail(input.email);

    // Obtener datos del usuario desde Firestore
    const userDoc = await db
      .collection(USERS_COLLECTION)
      .doc(userRecord.uid)
      .get();

    if (!userDoc.exists) {
      throw new HttpError(404, "Usuario no encontrado");
    }

    const userData = userDoc.data() as User;

    if (!userData.isActive) {
      throw new HttpError(403, "Usuario inactivo");
    }

    // Crear custom token
    const customToken = await admin.auth().createCustomToken(userRecord.uid, {
      tenantId: userData.tenantId,
      role: userData.role,
    });

    logger.info(`Usuario autenticado: ${input.email}`);

    return {
      uid: userRecord.uid,
      email: userRecord.email!,
      displayName: userData.displayName,
      tenantId: userData.tenantId,
      role: userData.role,
      customToken,
    };
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (error instanceof Error) {
      logger.error(`Error al autenticar usuario: ${error.message}`);
      throw new HttpError(401, "Credenciales inválidas");
    }

    throw new HttpError(500, "Error desconocido al autenticar usuario");
  }
};

/**
 * Obtiene los datos de un usuario por su UID
 */
export const getUserByUid = async (uid: string): Promise<User> => {
  const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();

  if (!userDoc.exists) {
    throw new HttpError(404, "Usuario no encontrado");
  }

  return {
    uid,
    ...userDoc.data(),
  } as User;
};

/**
 * Obtiene todos los usuarios de un tenant específico
 */
export const getUsersByTenant = async (tenantId: string): Promise<User[]> => {
  const snapshot = await db
    .collection(USERS_COLLECTION)
    .where("tenantId", "==", tenantId)
    .get();

  return snapshot.docs.map((doc) => ({
    uid: doc.id,
    ...doc.data(),
  })) as User[];
};

/**
 * Actualiza el perfil de un usuario
 */
export const updateUserProfile = async (
  uid: string,
  updates: {
    meta?: {
      phoneNumberId?: string;
      accessToken?: string;
    };
  }
): Promise<User> => {
  try {
    logger.info(`📝 Actualizando perfil del usuario: ${uid}`);

    // Obtener el documento actual del usuario
    const userDoc = await db.collection(USERS_COLLECTION).doc(uid).get();

    if (!userDoc.exists) {
      throw new HttpError(404, "Usuario no encontrado");
    }

    const currentUser = userDoc.data() as User;

    // Preparar los datos a actualizar
    const updateData: Partial<Omit<User, "uid">> = {};

    // Actualizar Meta datos si se proporcionan
    if (updates.meta) {
      updateData.meta = {
        phoneNumberId: updates.meta.phoneNumberId || currentUser.meta?.phoneNumberId || "",
        accessToken: updates.meta.accessToken || currentUser.meta?.accessToken || "",
      };
      logger.info(`✅ Credenciales de Meta actualizadas para: ${uid}`);
    }

    // Actualizar el documento
    await db.collection(USERS_COLLECTION).doc(uid).update(updateData);

    // Obtener y devolver el usuario actualizado
    const updatedUserDoc = await db.collection(USERS_COLLECTION).doc(uid).get();
    const updatedUserData = updatedUserDoc.data() as Omit<User, "uid">;

    return {
      uid,
      ...updatedUserData,
    } as User;
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (error instanceof Error) {
      logger.error(`Error al actualizar perfil del usuario: ${error.message}`);
      throw new HttpError(500, `Error al actualizar perfil: ${error.message}`);
    }

    logger.error(`Error desconocido al actualizar perfil del usuario`);
    throw new HttpError(500, "Error desconocido al actualizar perfil");
  }
};


export const verifyAuthToken = async (
  idToken: string
): Promise<{ uid: string; tenantId: string; role: string }> => {
  try {
    logger.info("🔐 Verificando token con Firebase Admin...");
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    logger.info(`✅ Token válido para UID: ${decodedToken.uid}`);

    // Obtener datos adicionales del usuario
    logger.info(`📖 Buscando usuario en Firestore: /users/${decodedToken.uid}`);
    const userData = await getUserByUid(decodedToken.uid);
    logger.info(`✅ Usuario encontrado: ${userData.email} (tenant: ${userData.tenantId})`);

    return {
      uid: decodedToken.uid,
      tenantId: userData.tenantId,
      role: userData.role,
    };
  } catch (error) {
    logger.error(`❌ Error al verificar token:`, error);
    throw new HttpError(401, "Token inválido o expirado");
  }
};

/**
 * Maneja el login con Google Sign-In
 * Si el usuario ya existe, devuelve sus datos
 * Si no existe, crea el usuario y el tenant con el tenantName proporcionado
 */
export const googleSignIn = async (input: {
  uid: string;
  email: string;
  displayName?: string;
  tenantName?: string;
}): Promise<AuthResponse> => {
  try {
    logger.info(`🔐 Iniciando Google Sign-In para ${input.email}`);

    // Verificar si el usuario ya existe en Firestore
    const userDoc = await db.collection(USERS_COLLECTION).doc(input.uid).get();

    if (userDoc.exists) {
      // Usuario existente: devolver sus datos
      logger.info(`ℹ️ Usuario ya existe en Firestore: ${input.email}`);
      const userData = userDoc.data() as User;

      if (!userData.isActive) {
        throw new HttpError(403, "Usuario inactivo");
      }

      const customToken = await admin.auth().createCustomToken(input.uid, {
        tenantId: userData.tenantId,
        role: userData.role,
      });

      logger.info(`✅ Usuario de Google autenticado: ${input.email}`);

      return {
        uid: input.uid,
        email: input.email,
        displayName: userData.displayName,
        tenantId: userData.tenantId,
        role: userData.role,
        customToken,
      };
    } else {
      // Usuario nuevo: requiere tenantName
      logger.info(`👤 Usuario nuevo en Google Sign-In: ${input.email}`);
      
      if (!input.tenantName) {
        logger.warn(`⚠️ Usuario nuevo sin tenantName: ${input.email}`);
        throw new HttpError(
          400,
          "tenantName es requerido para nuevos usuarios de Google"
        );
      }

      logger.info(`📋 Creando tenant y usuario para ${input.email}`);

      // Crear el tenant
      const tenantData: Omit<Tenant, "id"> = {
        name: input.tenantName,
        ownerId: input.uid,
        hasPickup: true,
        hasDelivery: false,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      const tenantRef = await db.collection(TENANTS_COLLECTION).add(tenantData);
      const tenantId = tenantRef.id;

      logger.info(`✅ Tenant creado: ${tenantId} (${input.tenantName})`);

      // Crear documento de usuario con credenciales de Meta vacías (se configurarán después)
      const userData: Omit<User, "uid"> = {
        email: input.email,
        displayName: input.displayName,
        tenantId,
        role: "owner",
        isActive: true,
        createdAt: new Date().toISOString(),
        // Meta credentials - cada usuario tiene los suyos, inicialmente vacíos
        meta: {
          phoneNumberId: "",
          accessToken: "",
        },
      };

      await db.collection(USERS_COLLECTION).doc(input.uid).set(userData);

      logger.info(`✅ Usuario documento creado en Firestore: ${input.uid}`);

      const customToken = await admin.auth().createCustomToken(input.uid, {
        tenantId,
        role: "owner",
      });

      logger.info(
        `✅ Nuevo usuario de Google registrado: ${input.email} (Tenant: ${input.tenantName})`
      );

      return {
        uid: input.uid,
        email: input.email,
        displayName: input.displayName,
        tenantId,
        role: "owner",
        customToken,
      };
    }
  } catch (error: unknown) {
    if (error instanceof HttpError) {
      logger.error(`HttpError en googleSignIn: ${error.message}`);
      throw error;
    }

    if (error instanceof Error) {
      logger.error(`Error en Google Sign-In: ${error.message}`);
      throw new HttpError(500, `Error en Google Sign-In: ${error.message}`);
    }

    logger.error(`Error desconocido en Google Sign-In`);
    throw new HttpError(500, "Error desconocido en Google Sign-In");
  }
};
