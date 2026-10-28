import { Router } from "express";
import { listItems, getItem, slow, fail } from "../controllers/itemController.js";
import { rememberMountPath } from "../observability/metrics.js";

const router = Router();
router.use(rememberMountPath);

router.get("/items", listItems);
router.get("/items/:id", getItem);
router.get("/slow", slow);
router.get("/error", fail);

export default router;
