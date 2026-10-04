import express from "express";
import { getBeehives, addBeehive, deleteBeehive, updateBeehive } from "../controllers/beehivesController.js";

const router = express.Router();

router.get("/", getBeehives);
router.post("/", addBeehive);
router.delete("/:id", deleteBeehive);
router.put("/:id", updateBeehive);

export default router;
