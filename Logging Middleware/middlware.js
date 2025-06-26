const axios = require("axios");
require("dotenv").config();

console.log(process.env.AUTH_TOKEN, "TEST");
const Log = async (stack, level, pkg, message) => {
  console.log(stack, level, pkg, message);
  const TOKEN = process.env.AUTH_TOKEN;
  if (!TOKEN) {
    console.warn("[Log] LOG_TOKEN missing – skipping external log");
    return;
  }

  try {
    console.log(stack, level, pkg, message);
    await axios.post(
      "http://20.244.56.144/evaluation-service/logs",
      { stack, level, package: pkg, message },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 3000,
      }
    );
  } catch (err) {
    console.warn("[Log] Failed:", err.response?.data || err.message);
  }
};

const logMiddleware = async (req, res, next) => {
  const { stack, level, pkg, message } = req.body || {};
  // await log("backend", "info", "handler", "received request");
  await Log(
    `${stack},${level},${pkg},${message}  ${req.method} ${req.originalUrl}`
  );
  next();
};

module.exports = {
  Log,
  logMiddleware,
};
