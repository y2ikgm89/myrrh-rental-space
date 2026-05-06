-- Reseed home Page Section rows for the visual restore.
-- Wipes all existing home Sections and reinserts the new 5-section structure.
-- Page.pageHero is NOT touched (separate JSON column path).

DELETE FROM "sections"
WHERE "pageId" = (SELECT "id" FROM "pages" WHERE "slug" = 'home');

INSERT INTO "sections" ("id", "pageId", "type", "title", "config", "content", "order", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", 'features', 'ご利用の流れ',
  '{"sectionLabel":"How to Reserve","title":"ご利用の流れ","displayLayout":"numbered-steps","items":[{"icon":"IconSearch","title":"スペースを選ぶ","description":"用途や人数に合った空間を見つける"},{"icon":"IconCalendarEvent","title":"日時を決める","description":"カレンダーから空き状況を確認"},{"icon":"IconCircleCheck","title":"オンラインで予約","description":"最短1分で予約完了"}],"layout":{"padding":"lg","containerWidth":"lg","animateOnScroll":"fade-up"}}'::jsonb,
  NULL, 0, true, NOW(), NOW()
FROM "pages" p WHERE p."slug" = 'home';

INSERT INTO "sections" ("id", "pageId", "type", "title", "config", "content", "order", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", 'value-props', NULL,
  '{"sectionLabel":"","title":"","iconStyle":"tabler","items":[{"icon":"IconClock","title":"最短1時間から"},{"icon":"IconCalendarCheck","title":"当日予約OK"},{"icon":"IconWifi","title":"Wi-Fi完備"},{"icon":"IconCreditCard","title":"オンライン決済"}],"layout":{"padding":"md","containerWidth":"lg","animateOnScroll":"fade-up"}}'::jsonb,
  NULL, 1, true, NOW(), NOW()
FROM "pages" p WHERE p."slug" = 'home';

INSERT INTO "sections" ("id", "pageId", "type", "title", "config", "content", "order", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", 'space-showcase', '厳選スペース',
  '{"sectionLabel":"Selected Spaces","title":"厳選スペース","maxItems":8,"showOnlyPublished":true,"displayLayout":"carousel","autoPlayInterval":5,"columns":3,"cardStyle":"bordered","imageAspect":"4:3","layout":{"padding":"lg","containerWidth":"xl","animateOnScroll":"fade-up"}}'::jsonb,
  NULL, 2, true, NOW(), NOW()
FROM "pages" p WHERE p."slug" = 'home';

INSERT INTO "sections" ("id", "pageId", "type", "title", "config", "content", "order", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", 'features', '選ばれる理由',
  '{"sectionLabel":"Why Myrrh","title":"選ばれる理由","displayLayout":"numbered-editorial","items":[{"title":"自然光設計","description":"全室に大きな窓を配置。時間帯で変化する光が、空間に深みを与えます。"},{"title":"遮音性能","description":"プロフェッショナル水準の遮音設計。外部の喧騒を遮断し、深い集中を可能にします。"},{"title":"即日予約","description":"オンラインで空き状況確認から決済まで完結。当日予約にも対応しています。"},{"title":"柔軟なレイアウト","description":"可動式の家具と設備で、会議・撮影・イベントなど用途に合わせた配置変更が可能です。"}],"layout":{"padding":"lg","containerWidth":"lg","animateOnScroll":"fade-up"}}'::jsonb,
  NULL, 3, true, NOW(), NOW()
FROM "pages" p WHERE p."slug" = 'home';

INSERT INTO "sections" ("id", "pageId", "type", "title", "config", "content", "order", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."id", 'cta', NULL,
  '{"sectionLabel":"Reservation","title":"あなたに最適な空間を","description":"空き状況の確認から予約まで、オンラインで完結。まずは空間をご覧ください。","buttons":[{"text":"スペースを見る","url":"/spaces","variant":"primary"}],"layout":{"padding":"xl","containerWidth":"md","animateOnScroll":"fade-up"}}'::jsonb,
  NULL, 4, true, NOW(), NOW()
FROM "pages" p WHERE p."slug" = 'home';
