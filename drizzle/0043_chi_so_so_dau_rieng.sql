-- Mỗi lần ghi tháng giữ số đầu riêng: lần ghi cũ còn trống thì ghi cố định bằng số cuối lần ghi liền trước (hoặc chỉ số lúc lắp), để sửa chỉ số ban đầu ở hợp đồng không kéo theo.
UPDATE "meter_readings" r
SET "opening" = COALESCE(
  (SELECT p."value" FROM "meter_readings" p WHERE p."meter_id" = r."meter_id" AND p."read_on" < r."read_on" ORDER BY p."read_on" DESC LIMIT 1),
  (SELECT m."start_reading" FROM "meters" m WHERE m."id" = r."meter_id")
)
WHERE r."kind" = 'monthly' AND r."opening" IS NULL;
