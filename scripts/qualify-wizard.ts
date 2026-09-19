import { qualifyWizard } from "./lib/qualify-wizard";

qualifyWizard(process.argv.slice(2), process.env, message => console.log(message)).catch(() => {
  // Never print raw parser/provider exceptions: these may contain credentials or draft content.
  console.error("Wizard qualification failed. Check arguments, model metadata and VENICE_API_KEY (live only). No retry or save was made; an attempted live request may have been charged.");
  process.exitCode = 1;
});
