const { ZodError } = require("zod");
const { resError } = require("../utils/responseUtil");

const validateMiddleware = (schema, property = "body") => {
  return (req, res, next) => {
    try {
      const data = req[property];
      const parsed = schema.parse(data);
      req.validatedData = parsed; 
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return resError(
          res,
          err.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
          400
        );
      }

      return resError(res, "Validation failed", 400);
    }
  };
};

module.exports = validateMiddleware;
