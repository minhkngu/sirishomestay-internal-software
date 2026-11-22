-- Đồng hồ cũ chưa có tên: đặt tên theo loại (Điện, Nước, Khác).
UPDATE "meters" SET "name" = CASE "utility" WHEN 'electric' THEN 'Điện' WHEN 'water' THEN 'Nước' ELSE 'Khác' END WHERE "name" = '';
