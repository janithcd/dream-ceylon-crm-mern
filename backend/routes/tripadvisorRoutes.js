const express = require("express");

const {
    getPublicTripadvisorReviews,
} = require(
    "../controllers/tripadvisorController"
);

const router = express.Router();

/*
 * Public route:
 * GET /api/public/tripadvisor-reviews
 */
router.get(
    "/",
    getPublicTripadvisorReviews
);

module.exports = router;