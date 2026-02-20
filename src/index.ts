import app from "./app";
import env from "./config/env";
import { getFirestore } from "./config/firebase";
import { startAutoCloseScheduler } from "./services/autoCloseService";

import { logger } from "./utils/logger";

const start = async (): Promise<void> => {
  try {
    await getFirestore();
    const host =
      process.env.NODE_ENV === "production" ? "0.0.0.0" : "localhost";
    app.listen(env.port, host, () => {
      logger.info(`Servidor escuchando en puerto ${env.port} (${host})`);
      logger.info("WhatsApp Bot: Usando Meta Business API (webhooks)");
    });

    // Iniciar scheduler de cierre automático de cajas (a las 3 AM)
    startAutoCloseScheduler(3);
   
  } catch (error) {
    logger.error("No se pudo iniciar el servidor");
    process.exit(1);
  }
};

process.on("unhandledRejection", (reason: unknown) => {
  logger.error("Unhandled Promise Rejection", reason);
});

process.on("uncaughtException", (error: Error) => {
  logger.error("Uncaught Exception", error);
  process.exit(1);
});

void start();
