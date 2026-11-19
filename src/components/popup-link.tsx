'use client'

import Link from 'next/link'
import { useSyncExternalStore, type ComponentProps } from 'react'

const subscribe = () => () => {}

/**
 * Liên kết mở popup (route chặn). Trước khi trang nạp xong script thì chưa có `href`, nên bấm quá sớm không làm trình duyệt
 * tải trang đầy đủ (chỉ chưa có phản hồi); nạp xong thì là `Link` thường, điều hướng mềm ra popup.
 */
export function PopupLink(props: ComponentProps<typeof Link>) {
  const ready = useSyncExternalStore(subscribe, () => true, () => false)
  if (!ready) {
    const { children, className, title } = props
    return <a className={className} title={title} role="link" aria-disabled="true">{children}</a>
  }
  return <Link {...props} />
}
