import "server-only";

import {
  getReviewsQuery,
  getReviewByIdQuery,
} from "@/shared/domain/reviews/queries";

export { getReviewsQuery as getReviews, getReviewByIdQuery as getReviewById };
