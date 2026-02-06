import app from "./app";
import env from "./config/env";
import { getFirestore } from "./config/firebase";
import { startAutoCloseScheduler } from "./services/autoCloseService";
// TODO: Refactorizar después de migración a Meta API
// import { startWhatsappBot } from "./bot/burgerBot";
import { logger } from "./utils/logger";

const start = async (): Promise<void> => {
  try {
    await getFirestore();
    app.listen(env.port, () => {
      logger.info(`Servidor escuchando en http://localhost:${env.port}`);
      logger.info("WhatsApp Bot: Usando Meta Business API (webhooks)");
    });

    // Iniciar scheduler de cierre automático de cajas (a las 3 AM)
    startAutoCloseScheduler(3);

    // TODO: Remover después de completar migración a Meta API
    // El bot ahora funciona por webhooks, no requiere inicialización
    /* 
    if (env.whatsappEnabled) {
      logger.info("Inicializando bot de WhatsApp...");
      startWhatsappBot();
    } else {
      logger.info(
        "Bot de WhatsApp deshabilitado. Define WHATSAPP_ENABLED=true para activarlo.",
      );
    }
    */
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
