-- Store the reservation-time email address independently from the mutable Customer record.
ALTER TABLE "reservations" ADD COLUMN "guestEmail" TEXT;
