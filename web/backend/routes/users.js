import express from "express";
import { getUsers, addUser, deleteUser, updateUser } from "../controllers/usersController.js";

const router = express.Router();

router.get("/", getUsers);
router.post("/", addUser);
router.delete("/:id", deleteUser);
router.put("/:id", updateUser);

export default router;
