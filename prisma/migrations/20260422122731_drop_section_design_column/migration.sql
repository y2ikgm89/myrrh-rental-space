-- Drop legacy Section.design column (superseded by styleId + styleOverride cascade; Phase B.4 C6)
ALTER TABLE "sections" DROP COLUMN "design";
