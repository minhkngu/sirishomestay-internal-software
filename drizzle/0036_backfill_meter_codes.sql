-- Đồng hồ cũ chưa có mã: đánh số theo thứ tự tạo trong từng phòng, dạng DH-<mã toà>-<mã phòng>-<số thứ tự>.
UPDATE "meters" AS m SET "code" = 'DH-' || f."code" || '-' || r."code" || '-' || lpad(x.rn::text, 2, '0')
FROM (SELECT "id", row_number() OVER (PARTITION BY "room_id" ORDER BY "created_at", "id") AS rn FROM "meters") x, "rooms" r, "facilities" f
WHERE x."id" = m."id" AND r."id" = m."room_id" AND f."id" = r."facility_id" AND m."code" IS NULL;
