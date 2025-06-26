const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { Log, logMiddleware } = require("../Logging Middleware/middlware.js"); // Import the logging functions

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(logMiddleware); // Add logging middleware for all HTTP requests

// In-memory storage (replace with database in production)
const urlDatabase = new Map();
const clickStats = new Map();

// Keep your existing logToServer function for backward compatibility
// but now it can use the new Log function
const logToServer = async (stack, level, package, message) => {
  await Log(stack, level, package, message);
};

// Generate unique short code
const generateShortCode = (customCode = null) => {
  if (customCode) {
    return customCode.toLowerCase();
  }
  return crypto.randomBytes(3).toString("hex");
};

// Validate URL format
const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

// API Routes

// Create Short URL
app.post("/shorturls", async (req, res) => {
  try {
    const { url, validity = 30, shortcode } = req.body;

    // Validate required fields
    if (!url) {
      await logToServer(
        "backend",
        "error",
        "controller",
        "Missing URL in request"
      );
      return res.status(400).json({
        error: "URL is required",
      });
    }

    // Validate URL format
    if (!isValidUrl(url)) {
      await logToServer(
        "backend",
        "error",
        "controller",
        "Invalid URL format provided"
      );
      return res.status(400).json({
        error: "Invalid URL format",
      });
    }

    // Validate validity (must be integer)
    if (!Number.isInteger(validity) || validity <= 0) {
      await logToServer(
        "backend",
        "error",
        "controller",
        "Invalid validity period"
      );
      return res.status(400).json({
        error: "Validity must be a positive integer representing minutes",
      });
    }

    // Generate or validate shortcode
    let finalShortCode;
    if (shortcode) {
      // Check if custom shortcode already exists
      if (urlDatabase.has(shortcode.toLowerCase())) {
        await logToServer(
          "backend",
          "error",
          "controller",
          "Shortcode collision detected"
        );
        return res.status(409).json({
          error: "Shortcode already exists",
        });
      }
      finalShortCode = shortcode.toLowerCase();
    } else {
      // Generate unique shortcode
      do {
        finalShortCode = generateShortCode();
      } while (urlDatabase.has(finalShortCode));
    }

    // Calculate expiry time
    const expiryDate = new Date();
    expiryDate.setMinutes(expiryDate.getMinutes() + validity);

    // Store URL data
    const urlData = {
      originalUrl: url,
      shortCode: finalShortCode,
      createdAt: new Date(),
      expiryDate: expiryDate,
      validity: validity,
    };

    urlDatabase.set(finalShortCode, urlData);
    clickStats.set(finalShortCode, []);

    await logToServer(
      "backend",
      "info",
      "controller",
      `Short URL created: ${finalShortCode}`
    );

    // Return response
    res.status(201).json({
      shortLink: `http://localhost:${PORT}/${finalShortCode}`,
      expiry: expiryDate.toISOString(),
    });
  } catch (error) {
    await logToServer(
      "backend",
      "error",
      "controller",
      `Error creating short URL: ${error.message}`
    );
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

// Redirect shortened URL
app.get("/:shortcode", async (req, res) => {
  try {
    const { shortcode } = req.params;
    const urlData = urlDatabase.get(shortcode.toLowerCase());

    if (!urlData) {
      await logToServer(
        "backend",
        "warn",
        "controller",
        `Short URL not found: ${shortcode}`
      );
      return res.status(404).json({
        error: "Short URL not found",
      });
    }

    // Check if URL has expired
    if (new Date() > urlData.expiryDate) {
      await logToServer(
        "backend",
        "warn",
        "controller",
        `Expired URL accessed: ${shortcode}`
      );
      return res.status(410).json({
        error: "Short URL has expired",
      });
    }

    // Log click data
    const clickData = {
      timestamp: new Date(),
      userAgent: req.get("User-Agent") || "Unknown",
      referer: req.get("Referer") || "Direct",
      ip: req.ip || req.connection.remoteAddress || "Unknown",
    };

    const stats = clickStats.get(shortcode.toLowerCase()) || [];
    stats.push(clickData);
    clickStats.set(shortcode.toLowerCase(), stats);

    await logToServer(
      "backend",
      "info",
      "controller",
      `URL redirected: ${shortcode}`
    );

    // Redirect to original URL
    res.redirect(urlData.originalUrl);
  } catch (error) {
    await logToServer(
      "backend",
      "error",
      "controller",
      `Error redirecting URL: ${error.message}`
    );
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

// Get URL statistics
app.get("/shorturls/:shortcode", async (req, res) => {
  try {
    const { shortcode } = req.params;
    const urlData = urlDatabase.get(shortcode.toLowerCase());

    if (!urlData) {
      await logToServer(
        "backend",
        "warn",
        "controller",
        `Statistics requested for non-existent URL: ${shortcode}`
      );
      return res.status(404).json({
        error: "Short URL not found",
      });
    }

    const stats = clickStats.get(shortcode.toLowerCase()) || [];

    const response = {
      shortCode: urlData.shortCode,
      originalUrl: urlData.originalUrl,
      createdAt: urlData.createdAt,
      expiryDate: urlData.expiryDate,
      totalClicks: stats.length,
      clickDetails: stats.map((click) => ({
        timestamp: click.timestamp,
        referer: click.referer,
        userAgent: click.userAgent,
        location: "Unknown", // Placeholder for geographical location
      })),
    };

    await logToServer(
      "backend",
      "info",
      "controller",
      `Statistics retrieved for: ${shortcode}`
    );

    res.json(response);
  } catch (error) {
    await logToServer(
      "backend",
      "error",
      "controller",
      `Error retrieving statistics: ${error.message}`
    );
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

// Get all URLs (for statistics page)
app.get("/api/all-urls", async (req, res) => {
  try {
    const allUrls = [];

    for (const [shortCode, urlData] of urlDatabase) {
      const stats = clickStats.get(shortCode) || [];
      allUrls.push({
        shortCode: urlData.shortCode,
        originalUrl: urlData.originalUrl,
        createdAt: urlData.createdAt,
        expiryDate: urlData.expiryDate,
        totalClicks: stats.length,
        clickDetails: stats,
      });
    }

    await logToServer(
      "backend",
      "info",
      "controller",
      "All URLs statistics retrieved"
    );
    res.json(allUrls);
  } catch (error) {
    await logToServer(
      "backend",
      "error",
      "controller",
      `Error retrieving all URLs: ${error.message}`
    );
    res.status(500).json({
      error: "Internal server error",
    });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date(),
    uptime: process.uptime(),
  });
});

app.listen(PORT, async () => {
  console.log(`URL Shortener Backend running on port ${PORT}`);
  await logToServer(
    "backend",
    "info",
    "service",
    `URL Shortener Backend started on port ${PORT}`
  );
});

// const express = require("express");
// const cors = require("cors");
// const crypto = require("crypto");

// const app = express();
// const PORT = process.env.PORT || 3001;

// // Middleware
// app.use(cors());
// app.use(express.json());

// // In-memory storage (replace with database in production)
// const urlDatabase = new Map();
// const clickStats = new Map();

// // Logger middleware integration
// const logToServer = async (stack, level, package, message) => {
//   try {
//     const response = await fetch(
//       "http://20.244.56.144/evaluation-service/logs",
//       {
//         method: "POST",
//         headers: {
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           stack,
//           level,
//           package,
//           message,
//         }),
//       }
//     );

//     if (!response.ok) {
//       console.error("Failed to log to server:", response.statusText);
//     }
//   } catch (error) {
//     console.error("Error logging to server:", error);
//   }
// };

// // Generate unique short code
// const generateShortCode = (customCode = null) => {
//   if (customCode) {
//     return customCode.toLowerCase();
//   }
//   return crypto.randomBytes(3).toString("hex");
// };

// // Validate URL format
// const isValidUrl = (string) => {
//   try {
//     new URL(string);
//     return true;
//   } catch (_) {
//     return false;
//   }
// };

// // API Routes

// // Create Short URL
// app.post("/shorturls", async (req, res) => {
//   try {
//     const { url, validity = 30, shortcode } = req.body;

//     // Validate required fields
//     if (!url) {
//       await logToServer(
//         "backend",
//         "error",
//         "controller",
//         "Missing URL in request"
//       );
//       return res.status(400).json({
//         error: "URL is required",
//       });
//     }

//     // Validate URL format
//     if (!isValidUrl(url)) {
//       await logToServer(
//         "backend",
//         "error",
//         "controller",
//         "Invalid URL format provided"
//       );
//       return res.status(400).json({
//         error: "Invalid URL format",
//       });
//     }

//     // Validate validity (must be integer)
//     if (!Number.isInteger(validity) || validity <= 0) {
//       await logToServer(
//         "backend",
//         "error",
//         "controller",
//         "Invalid validity period"
//       );
//       return res.status(400).json({
//         error: "Validity must be a positive integer representing minutes",
//       });
//     }

//     // Generate or validate shortcode
//     let finalShortCode;
//     if (shortcode) {
//       // Check if custom shortcode already exists
//       if (urlDatabase.has(shortcode.toLowerCase())) {
//         await logToServer(
//           "backend",
//           "error",
//           "controller",
//           "Shortcode collision detected"
//         );
//         return res.status(409).json({
//           error: "Shortcode already exists",
//         });
//       }
//       finalShortCode = shortcode.toLowerCase();
//     } else {
//       // Generate unique shortcode
//       do {
//         finalShortCode = generateShortCode();
//       } while (urlDatabase.has(finalShortCode));
//     }

//     // Calculate expiry time
//     const expiryDate = new Date();
//     expiryDate.setMinutes(expiryDate.getMinutes() + validity);

//     // Store URL data
//     const urlData = {
//       originalUrl: url,
//       shortCode: finalShortCode,
//       createdAt: new Date(),
//       expiryDate: expiryDate,
//       validity: validity,
//     };

//     urlDatabase.set(finalShortCode, urlData);
//     clickStats.set(finalShortCode, []);

//     await logToServer(
//       "backend",
//       "info",
//       "controller",
//       `Short URL created: ${finalShortCode}`
//     );

//     // Return response
//     res.status(201).json({
//       shortLink: `http://localhost:${PORT}/${finalShortCode}`,
//       expiry: expiryDate.toISOString(),
//     });
//   } catch (error) {
//     await logToServer(
//       "backend",
//       "error",
//       "controller",
//       `Error creating short URL: ${error.message}`
//     );
//     res.status(500).json({
//       error: "Internal server error",
//     });
//   }
// });

// // Redirect shortened URL
// app.get("/:shortcode", async (req, res) => {
//   try {
//     const { shortcode } = req.params;
//     const urlData = urlDatabase.get(shortcode.toLowerCase());

//     if (!urlData) {
//       await logToServer(
//         "backend",
//         "warn",
//         "controller",
//         `Short URL not found: ${shortcode}`
//       );
//       return res.status(404).json({
//         error: "Short URL not found",
//       });
//     }

//     // Check if URL has expired
//     if (new Date() > urlData.expiryDate) {
//       await logToServer(
//         "backend",
//         "warn",
//         "controller",
//         `Expired URL accessed: ${shortcode}`
//       );
//       return res.status(410).json({
//         error: "Short URL has expired",
//       });
//     }

//     // Log click data
//     const clickData = {
//       timestamp: new Date(),
//       userAgent: req.get("User-Agent") || "Unknown",
//       referer: req.get("Referer") || "Direct",
//       ip: req.ip || req.connection.remoteAddress || "Unknown",
//     };

//     const stats = clickStats.get(shortcode.toLowerCase()) || [];
//     stats.push(clickData);
//     clickStats.set(shortcode.toLowerCase(), stats);

//     await logToServer(
//       "backend",
//       "info",
//       "controller",
//       `URL redirected: ${shortcode}`
//     );

//     // Redirect to original URL
//     res.redirect(urlData.originalUrl);
//   } catch (error) {
//     await logToServer(
//       "backend",
//       "error",
//       "controller",
//       `Error redirecting URL: ${error.message}`
//     );
//     res.status(500).json({
//       error: "Internal server error",
//     });
//   }
// });

// // Get URL statistics
// app.get("/shorturls/:shortcode", async (req, res) => {
//   try {
//     const { shortcode } = req.params;
//     const urlData = urlDatabase.get(shortcode.toLowerCase());

//     if (!urlData) {
//       await logToServer(
//         "backend",
//         "warn",
//         "controller",
//         `Statistics requested for non-existent URL: ${shortcode}`
//       );
//       return res.status(404).json({
//         error: "Short URL not found",
//       });
//     }

//     const stats = clickStats.get(shortcode.toLowerCase()) || [];

//     const response = {
//       shortCode: urlData.shortCode,
//       originalUrl: urlData.originalUrl,
//       createdAt: urlData.createdAt,
//       expiryDate: urlData.expiryDate,
//       totalClicks: stats.length,
//       clickDetails: stats.map((click) => ({
//         timestamp: click.timestamp,
//         referer: click.referer,
//         userAgent: click.userAgent,
//         location: "Unknown", // Placeholder for geographical location
//       })),
//     };

//     await logToServer(
//       "backend",
//       "info",
//       "controller",
//       `Statistics retrieved for: ${shortcode}`
//     );

//     res.json(response);
//   } catch (error) {
//     await logToServer(
//       "backend",
//       "error",
//       "controller",
//       `Error retrieving statistics: ${error.message}`
//     );
//     res.status(500).json({
//       error: "Internal server error",
//     });
//   }
// });

// // Get all URLs (for statistics page)
// app.get("/api/all-urls", async (req, res) => {
//   try {
//     const allUrls = [];

//     for (const [shortCode, urlData] of urlDatabase) {
//       const stats = clickStats.get(shortCode) || [];
//       allUrls.push({
//         shortCode: urlData.shortCode,
//         originalUrl: urlData.originalUrl,
//         createdAt: urlData.createdAt,
//         expiryDate: urlData.expiryDate,
//         totalClicks: stats.length,
//         clickDetails: stats,
//       });
//     }

//     await logToServer(
//       "backend",
//       "info",
//       "controller",
//       "All URLs statistics retrieved"
//     );
//     res.json(allUrls);
//   } catch (error) {
//     await logToServer(
//       "backend",
//       "error",
//       "controller",
//       `Error retrieving all URLs: ${error.message}`
//     );
//     res.status(500).json({
//       error: "Internal server error",
//     });
//   }
// });

// // Health check
// app.get("/health", (req, res) => {
//   res.json({
//     status: "OK",
//     timestamp: new Date(),
//     uptime: process.uptime(),
//   });
// });

// app.listen(PORT, () => {
//   console.log(`URL Shortener Backend running on port ${PORT}`);
//   logToServer(
//     "backend",
//     "info",
//     "service",
//     `URL Shortener Backend started on port ${PORT}`
//   );
// });
