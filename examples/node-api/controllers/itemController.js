// Demonstrates a custom span around business logic, in addition to the spans
// that auto-instrumentation creates for HTTP and Express.
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { logger } from "../observability/logger.js";

const tracer = trace.getTracer("example-api-items");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ITEMS = [
  { id: 1, name: "alpha" },
  { id: 2, name: "beta" },
  { id: 3, name: "gamma" },
];

export async function listItems(_req, res) {
  await sleep(10 + Math.random() * 40);
  res.json(ITEMS);
}

export async function getItem(req, res, next) {
  await tracer.startActiveSpan("items.lookup", async (span) => {
    try {
      await sleep(10 + Math.random() * 40);
      const item = ITEMS.find((i) => i.id === Number(req.params.id));
      span.setAttribute("item.found", Boolean(item));
      if (!item) return res.status(404).json({ error: "not found" });
      res.json(item);
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      next(err);
    } finally {
      span.end();
    }
  });
}

// Deliberately slow endpoint to exercise latency panels and alerts.
export async function slow(_req, res) {
  await sleep(800 + Math.random() * 1500);
  res.json({ status: "slow but ok" });
}

// Deliberate failure to exercise error-rate panels and alerts.
export function fail(_req, _res, next) {
  logger.warn("simulated failure requested");
  next(new Error("simulated failure"));
}
