-- Bổ sung công tơ điện/nước đang dùng cho mọi phòng còn thiếu (kể cả phòng ngừng sử dụng).
-- Phòng từng có công tơ cùng loại đã gỡ: công tơ mới tiếp nối chỉ số cuối và ngày gỡ của công tơ gỡ gần nhất; ngược lại bắt đầu từ 0 vào ngày tạo phòng (giờ Việt Nam).
-- Chạy lặp lại không tạo trùng.
INSERT INTO "meters" ("room_id", "utility", "installed_on", "start_reading")
SELECT r."id", u."utility",
  COALESCE(prev."removed_on", (r."created_at" AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
  COALESCE(prev."final_reading", 0)
FROM "rooms" r
CROSS JOIN (VALUES ('electric'), ('water')) AS u("utility")
LEFT JOIN LATERAL (
  SELECT m."removed_on", m."final_reading" FROM "meters" m
  WHERE m."room_id" = r."id" AND m."utility" = u."utility" AND m."removed_on" IS NOT NULL
  ORDER BY m."removed_on" DESC, m."installed_on" DESC LIMIT 1
) prev ON true
WHERE NOT EXISTS (
  SELECT 1 FROM "meters" a WHERE a."room_id" = r."id" AND a."utility" = u."utility" AND a."removed_on" IS NULL
);
