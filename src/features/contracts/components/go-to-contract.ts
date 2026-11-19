/** Sau khi tạo hợp đồng: tải trang hợp đồng đầy đủ. Điều hướng mềm sẽ bị route chặn mở popup đè lên trang tạo cũ. */
export function goToContract(id: string) {
  window.location.assign(`/contracts/${id}`)
}
