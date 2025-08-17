// Role-based access control middleware
// Usage: router.get("/admin", authMiddleware, roleMiddleware(["admin"]), controllerFn);

const roleMiddleware = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        error: "Access denied. No role found.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: "Forbidden. You do not have permission to perform this action.",
      });
    }

    next();
  };
};

module.exports = roleMiddleware;
