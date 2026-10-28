// Prometheus HTTP metrics (prom-client).
// Label policy: method, ROUTE TEMPLATE and status code only. Requests that
// match no route (scanners, typos) collapse into route="unmatched" so label
// cardinality stays bounded. Never label with raw URLs, IDs or emails.
import promClient from "prom-client";

const PREFIX = "example_api_";

promClient.collectDefaultMetrics({ prefix: PREFIX });

const requestsTotal = new promClient.Counter({
  name: `${PREFIX}http_requests_total`,
  help: "Total HTTP requests.",
  labelNames: ["method", "route", "status_code"],
});

const requestsFailedTotal = new promClient.Counter({
  name: `${PREFIX}http_requests_failed_total`,
  help: "Total HTTP requests that ended with a 5xx status.",
  labelNames: ["method", "route", "status_code"],
});

const requestsInFlight = new promClient.Gauge({
  name: `${PREFIX}http_requests_in_flight`,
  help: "HTTP requests currently being processed.",
});

const requestDuration = new promClient.Histogram({
  name: `${PREFIX}http_request_duration_seconds`,
  help: "HTTP request duration in seconds.",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});

export function trackHttpMetrics(req, res, next) {
  if (req.path === "/metrics" || req.method === "OPTIONS") return next();

  const start = process.hrtime.bigint();
  let done = false;
  requestsInFlight.inc();

  // "close" also fires for aborted connections, so the gauge cannot leak.
  // "finish" fires first for normal responses; `done` makes this run once.
  const finish = () => {
    if (done) return;
    done = true;
    requestsInFlight.dec();

    // Express resets req.baseUrl when an error leaves a mounted router, so use
    // the mount path remembered by rememberMountPath() when it is available.
    const base = req.metricsBase ?? req.baseUrl;
    const route = req.route ? `${base}${req.route.path}` : "unmatched";
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    requestsTotal.inc(labels);
    requestDuration.observe(labels, Number(process.hrtime.bigint() - start) / 1e9);
    if (res.statusCode >= 500) requestsFailedTotal.inc(labels);
  };

  res.on("finish", finish);
  res.on("close", finish);
  next();
}

// Add as the first middleware of every router that is mounted under a prefix
// (router.use(rememberMountPath)), so error responses keep their full route label.
export function rememberMountPath(req, _res, next) {
  req.metricsBase = req.baseUrl;
  next();
}

export async function serveHttpMetrics(_req, res) {
  res.set("Content-Type", promClient.register.contentType);
  res.end(await promClient.register.metrics());
}
