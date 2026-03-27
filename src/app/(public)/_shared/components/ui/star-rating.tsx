"use client";

import { useState } from "react";
import { Star } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StarRatingReadonlyProps {
  readonly rating: number;
  readonly size?: number;
  readonly mode?: "readonly";
}

interface StarRatingInteractiveProps {
  readonly rating: number;
  readonly size?: number;
  readonly mode: "interactive";
  readonly onChange: (rating: number) => void;
}

type StarRatingProps = StarRatingReadonlyProps | StarRatingInteractiveProps;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_STARS = 5;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StarRating(props: StarRatingProps) {
  const { rating, size = 20, mode = "readonly" } = props;

  if (mode === "interactive" && "onChange" in props) {
    return (
      <InteractiveStars rating={rating} size={size} onChange={props.onChange} />
    );
  }

  return <ReadonlyStars rating={rating} size={size} />;
}

// ---------------------------------------------------------------------------
// Readonly Stars
// ---------------------------------------------------------------------------

function ReadonlyStars({
  rating,
  size,
}: {
  readonly rating: number;
  readonly size: number;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={`5段階中${Math.round(rating)}の評価`}
    >
      {Array.from({ length: MAX_STARS }, (_, i) => (
        <Star
          key={i}
          className={
            i < Math.round(rating) ? "text-rating" : "text-muted-foreground/30"
          }
          size={size}
          {...(i < Math.round(rating) ? { fill: "currentColor" } : {})}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Interactive Stars
// ---------------------------------------------------------------------------

function InteractiveStars({
  rating,
  size,
  onChange,
}: {
  readonly rating: number;
  readonly size: number;
  readonly onChange: (rating: number) => void;
}) {
  const [hoverRating, setHoverRating] = useState(0);
  const displayRating = hoverRating > 0 ? hoverRating : rating;

  return (
    <div
      className="inline-flex items-center gap-0.5"
      onMouseLeave={() => setHoverRating(0)}
    >
      {Array.from({ length: MAX_STARS }, (_, i) => {
        const starValue = i + 1;
        const isFilled = starValue <= displayRating;

        return (
          <button
            key={i}
            type="button"
            aria-label={`${starValue}星`}
            className="rounded-sm p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onChange(starValue)}
            onMouseEnter={() => setHoverRating(starValue)}
          >
            <Star
              className={isFilled ? "text-rating" : "text-muted-foreground/30"}
              size={size}
              {...(isFilled ? { fill: "currentColor" } : {})}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
