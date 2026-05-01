-- Drop Settings.address (display-only column).
-- Display address is now derived from structured fields (postalCode + prefecture + city + streetAddress + buildingName) at the application layer.
ALTER TABLE "settings" DROP COLUMN "address";
