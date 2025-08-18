// routes/userRoutes.js
const express = require("express");
const router = express.Router();

const { createUser, getUsers, getUserById, updateUser, deleteUser } = require("../controllers/userController");

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

// Protect all user routes with admin-only access
router.use(authMiddleware, roleMiddleware(["admin"]));

router.post("/", createUser); 
router.get("/", getUsers);
router.get("/:id", getUserById); 
router.put("/:id", updateUser); 
router.delete("/:id", deleteUser);

module.exports = router;
