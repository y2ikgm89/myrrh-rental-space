-- AlterTable
ALTER TABLE "settings_data_retention" ALTER COLUMN "data_retention" SET DEFAULT '{"sessionMonths":6,"verificationMonths":6,"reservationGuestMonths":12,"eventRegistrationGuestMonths":12,"inquiryMonths":36,"customerInactiveMonths":84}';
