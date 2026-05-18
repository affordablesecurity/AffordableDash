import { env } from "./config/env.js";
import { app } from "./app.js";
import { startEstimateReminderScheduler } from "./modules/estimates/estimate-reminders.service.js";

app.listen(env.PORT, () => {
  console.log(`Locksmith CRM API listening on http://localhost:${env.PORT}`);
  startEstimateReminderScheduler();
});
