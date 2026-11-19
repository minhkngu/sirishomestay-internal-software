/** Mở tệp (base64 từ server action) trong tab mới; tab mở trước khi chờ server để không bị chặn cửa sổ bật lên. */
export function openBlankTab(): Window | null {
  return typeof window === 'undefined' ? null : window.open('', '_blank')
}

export function showBase64(tab: Window | null, file: { base64: string; mime: string; name: string }, opts: { download?: boolean } = {}) {
  const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mime }))
  if (tab && !opts.download) { tab.location.href = url; return }
  tab?.close()
  const a = document.createElement('a')
  a.href = url; a.download = file.name; a.click()
}
