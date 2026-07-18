const TRIPADVISOR_LISTING_URL =
    "https://www.tripadvisor.com/Attraction_Review-g665217-d34303718-Reviews-Dream_Ceylon_Journeys-Sri_Jayawardenepura_Western_Province.html";

function getTripadvisorConfig() {
    const apiKey =
        process.env.TRIPADVISOR_API_KEY;

    const locationId =
        process.env.TRIPADVISOR_LOCATION_ID;

    const apiBaseUrl =
        process.env.TRIPADVISOR_API_BASE_URL ||
        "https://terra.tripadvisor.com/api";

    if (!apiKey) {
        const error = new Error(
            "TRIPADVISOR_API_KEY is not configured."
        );

        error.statusCode = 500;
        throw error;
    }

    if (!locationId) {
        const error = new Error(
            "TRIPADVISOR_LOCATION_ID is not configured."
        );

        error.statusCode = 500;
        throw error;
    }

    return {
        apiKey,
        locationId,
        apiBaseUrl:
            apiBaseUrl.replace(/\/+$/, ""),
    };
}

async function fetchTripadvisorJson(url) {
    const { apiKey } =
        getTripadvisorConfig();

    const controller =
        new AbortController();

    const timeoutId =
        setTimeout(
            () => controller.abort(),
            10000
        );

    try {
        const response =
            await fetch(url, {
                method: "GET",

                headers: {
                    "x-api-key": apiKey,
                    Accept: "application/json",
                    "User-Agent":
                        "Dream-Ceylon-Journeys-CRM",
                },

                signal:
                controller.signal,
            });

        const responseText =
            await response.text();

        let responseData = null;

        if (responseText) {
            try {
                responseData =
                    JSON.parse(
                        responseText
                    );
            } catch {
                responseData = {
                    message:
                    responseText,
                };
            }
        }

        if (!response.ok) {
            const errorMessage =
                responseData?.detail ||
                responseData?.message ||
                responseData?.title ||
                `Tripadvisor API returned ${response.status}.`;

            const error =
                new Error(
                    errorMessage
                );

            error.statusCode =
                response.status >= 500
                    ? 502
                    : response.status;

            error.tripadvisorStatus =
                response.status;

            throw error;
        }

        return responseData;
    } catch (error) {
        if (
            error.name ===
            "AbortError"
        ) {
            const timeoutError =
                new Error(
                    "Tripadvisor API request timed out."
                );

            timeoutError.statusCode =
                504;

            throw timeoutError;
        }

        if (!error.statusCode) {
            error.statusCode = 502;
        }

        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

function extractReviews(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (
        Array.isArray(
            payload?.data
        )
    ) {
        return payload.data;
    }

    if (
        Array.isArray(
            payload?.reviews
        )
    ) {
        return payload.reviews;
    }

    if (
        Array.isArray(
            payload?.results
        )
    ) {
        return payload.results;
    }

    return [];
}

function getNestedValue(
    object,
    possiblePaths
) {
    for (
        const path of
        possiblePaths
        ) {
        const value =
            path
                .split(".")
                .reduce(
                    (
                        current,
                        key
                    ) =>
                        current?.[
                            key
                            ],
                    object
                );

        if (
            value !==
            undefined &&
            value !== null &&
            value !== ""
        ) {
            return value;
        }
    }

    return null;
}

/*
 * Tripadvisor may return translated
 * content as a nested object rather
 * than a direct string.
 *
 * This helper extracts the readable
 * string without producing
 * "[object Object]".
 */
function extractPlainText(
    value,
    depth = 0
) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    if (
        typeof value ===
        "string"
    ) {
        const text =
            value.trim();

        return text || null;
    }

    if (
        typeof value ===
        "number" ||
        typeof value ===
        "boolean"
    ) {
        return String(value);
    }

    if (
        depth > 6
    ) {
        return null;
    }

    if (
        Array.isArray(value)
    ) {
        for (
            const item of value
            ) {
            const extracted =
                extractPlainText(
                    item,
                    depth + 1
                );

            if (extracted) {
                return extracted;
            }
        }

        return null;
    }

    if (
        typeof value ===
        "object"
    ) {
        /*
         * Check likely content
         * properties first.
         */
        const preferredKeys = [
            "value",
            "text",
            "translated_text",
            "translatedText",
            "translated",
            "translation",
            "localized_text",
            "localizedText",
            "original_text",
            "originalText",
            "original",
            "content",
            "display_name",
            "displayName",
            "name",
            "label",
            "title",
            "en",
        ];

        for (
            const key of
            preferredKeys
            ) {
            if (
                Object.prototype
                    .hasOwnProperty
                    .call(
                        value,
                        key
                    )
            ) {
                const extracted =
                    extractPlainText(
                        value[key],
                        depth + 1
                    );

                if (extracted) {
                    return extracted;
                }
            }
        }

        /*
         * Final fallback: inspect
         * other nested properties,
         * while ignoring metadata.
         */
        const ignoredKeys =
            new Set([
                "language",
                "lang",
                "locale",
                "language_code",
                "languageCode",
                "id",
                "type",
                "status",
            ]);

        for (
            const [
                key,
                nestedValue,
            ] of Object.entries(
            value
        )
            ) {
            if (
                ignoredKeys.has(
                    key
                )
            ) {
                continue;
            }

            const extracted =
                extractPlainText(
                    nestedValue,
                    depth + 1
                );

            if (extracted) {
                return extracted;
            }
        }
    }

    return null;
}

function getTextFromPaths(
    object,
    paths
) {
    for (
        const path of paths
        ) {
        const rawValue =
            getNestedValue(
                object,
                [path]
            );

        const text =
            extractPlainText(
                rawValue
            );

        if (text) {
            return text;
        }
    }

    return null;
}

function normalizeRating(value) {
    const rating =
        Number(value);

    if (
        !Number.isFinite(
            rating
        )
    ) {
        return 0;
    }

    return Math.min(
        Math.max(
            rating,
            0
        ),
        5
    );
}

function formatTripType(value) {
    const text =
        extractPlainText(
            value
        );

    if (!text) {
        return null;
    }

    return text
        .toLowerCase()
        .replace(
            /[_-]+/g,
            " "
        )
        .replace(
            /\b\w/g,
            (letter) =>
                letter.toUpperCase()
        );
}

function normalizeReview(
    review,
    index
) {
    const reviewerName =
        getTextFromPaths(
            review,
            [
                "user.username",
                "user.display_name",
                "user.displayName",
                "user.name",
                "member.username",
                "member.name",
                "reviewer.name",
                "author.name",
                "username",
            ]
        ) ||
        "Tripadvisor Traveller";

    const reviewerLocation =
        getTextFromPaths(
            review,
            [
                "user.user_location.name",
                "user.user_location",
                "user.location.name",
                "user.location",
                "member.location.name",
                "member.location",
                "reviewer.location",
                "author.location",
                "user_location.name",
                "user_location",
            ]
        );

    const avatarUrl =
        getTextFromPaths(
            review,
            [
                "user.avatar.medium.url",
                "user.avatar.small.url",
                "user.avatar.url",
                "user.avatar_url",
                "member.avatar.url",
                "reviewer.avatar",
            ]
        );

    const title =
        getTextFromPaths(
            review,
            [
                "title",
                "review_title",
                "translated_title",
                "translation.title",
            ]
        );

    const text =
        getTextFromPaths(
            review,
            [
                "text",
                "review_text",
                "translated_text",
                "translation.text",
                "body",
                "content",
            ]
        );

    const publishedDate =
        getTextFromPaths(
            review,
            [
                "published_date",
                "publishedDate",
                "created_at",
                "date",
            ]
        );

    const travelDate =
        getTextFromPaths(
            review,
            [
                "travel_date",
                "travelDate",
            ]
        );

    const tripTypeRaw =
        getNestedValue(
            review,
            [
                "trip_type",
                "tripType",
            ]
        );

    const reviewUrl =
        getTextFromPaths(
            review,
            [
                "url",
                "web_url",
                "review_url",
            ]
        ) ||
        TRIPADVISOR_LISTING_URL;

    const reviewId =
        getTextFromPaths(
            review,
            [
                "id",
                "review_id",
            ]
        ) ||
        `tripadvisor-review-${index + 1}`;

    return {
        id: reviewId,

        reviewerName,

        reviewerLocation:
            reviewerLocation ||
            null,

        avatarUrl:
            avatarUrl || null,

        rating:
            normalizeRating(
                review.rating
            ),

        title:
            title || null,

        text:
            text || "",

        publishedDate:
            publishedDate ||
            null,

        travelDate:
            travelDate ||
            null,

        tripType:
            formatTripType(
                tripTypeRaw
            ),

        reviewUrl,

        source:
            "Tripadvisor",
    };
}

async function getTripadvisorReviews({
                                         language = "en",
                                     } = {}) {
    const {
        locationId,
        apiBaseUrl,
    } =
        getTripadvisorConfig();

    const query =
        new URLSearchParams({
            language,
        });

    const requestUrl =
        `${apiBaseUrl}` +
        `/locations/${encodeURIComponent(
            locationId
        )}/reviews?${query.toString()}`;

    const payload =
        await fetchTripadvisorJson(
            requestUrl
        );

    const reviews =
        extractReviews(payload)
            .map(
                normalizeReview
            )
            .filter(
                (review) =>
                    review.text
                        .trim()
                        .length >
                    0
            )
            .slice(0, 3);

    return {
        success: true,

        source:
            "Tripadvisor",

        locationId,

        listingUrl:
        TRIPADVISOR_LISTING_URL,

        language,

        count:
        reviews.length,

        reviews,

        fetchedAt:
            new Date()
                .toISOString(),
    };
}

module.exports = {
    getTripadvisorReviews,
};