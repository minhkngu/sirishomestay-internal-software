-- Gộp cách tính "Nhập tay" vào "Nhập lượng mỗi kỳ"
UPDATE "fee_types" SET "quantity_from" = 'period_input' WHERE "quantity_from" = 'manual';
