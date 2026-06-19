import { loadConfig, validateConfig } from "../config/index.js";

const strict = process.argv.includes("--strict");
const regionArg = process.argv.find((arg) => arg.startsWith("--region="));
const localeArg = process.argv.find((arg) => arg.startsWith("--locale="));
const region = regionArg?.split("=")[1] ?? "tampere";
const locale = localeArg?.split("=")[1] ?? "en";

try {
  const config = await loadConfig(process.cwd(), region, locale);
  const result = validateConfig(config, { strict });

  for (const issue of result.issues) {
    const label = issue.severity.toUpperCase();
    console.log(`${label}: ${issue.message}`);
  }

  if (result.errorCount > 0) {
    console.error(`Config validation failed with ${result.errorCount} error(s) and ${result.warningCount} warning(s).`);
    process.exit(1);
  }

  console.log(`Config validation passed with ${result.warningCount} warning(s).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
