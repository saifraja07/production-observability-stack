// Registers the module-loader hook that lets OpenTelemetry instrument ES modules.
// Load it BEFORE tracing.js:  node --import ./observability/tracing-loader.js --import ./observability/tracing.js server.js
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("@opentelemetry/instrumentation/hook.mjs", pathToFileURL("./"));
