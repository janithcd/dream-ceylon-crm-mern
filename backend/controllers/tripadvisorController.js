const {
    getTripadvisorReviews,
} = require(
    "../services/tripadvisorService"
);

const getPublicTripadvisorReviews =
    async (req, res, next) => {
        try {
            const requestedLanguage =
                typeof req.query.language ===
                "string" &&
                req.query.language.trim()
                    ? req.query.language.trim()
                    : "en";

            const result =
                await getTripadvisorReviews({
                    language:
                    requestedLanguage,
                });

            /*
             * Do not allow browsers, proxies,
             * or CDNs to persist Tripadvisor
             * review content at this stage.
             */
            res.set({
                "Cache-Control":
                    "no-store, no-cache, must-revalidate, proxy-revalidate",

                Pragma: "no-cache",

                Expires: "0",

                "Surrogate-Control":
                    "no-store",
            });

            return res
                .status(200)
                .json(result);
        } catch (error) {
            console.error(
                "[Tripadvisor Reviews]",
                error.message
            );

            return next(error);
        }
    };

module.exports = {
    getPublicTripadvisorReviews,
};