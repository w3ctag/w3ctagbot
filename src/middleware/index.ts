import { PRIVATE_KEY } from "astro:env/server";
import { sequence } from "astro:middleware";
import { periodicallyRetryFailedWebhookDeliveries } from "src/pages/webhook";

// We don't have any actual middleware, but this is a good place to start periodic tasks.
if (PRIVATE_KEY) {
  periodicallyRetryFailedWebhookDeliveries();
}

export const onRequest = sequence();
