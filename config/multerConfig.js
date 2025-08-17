const fs = require("fs");
const path = require("path");
const multer = require("multer");

const createUploadDir = (uploadDir) => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
};

const getMulterUpload = (uploadDir) => {
  createUploadDir(uploadDir);

  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const timestamp = Date.now().toString().slice(-5);
      const random = Math.floor(Math.random() * 90000 + 10000);
      const ext = path.extname(file.originalname);
      const base = path.basename(file.originalname, ext);
      const suffix = `_${timestamp}${random}`;
      cb(null, `${base}${suffix}${ext}`);
    },
  });

  return multer({ storage });
};

module.exports = { getMulterUpload };
