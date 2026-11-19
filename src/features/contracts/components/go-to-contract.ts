'use client'

import { useRouter } from 'next/navigation'
import { useInRouteModal } from '@/components/route-modal-context'

/**
 * Sau khi tạo hợp đồng: đang ở popup thì chuyển ngay sang popup hợp đồng vừa tạo (không tải lại trang, URL đổi sang hợp đồng);
 * mở thẳng trang tạo thì tải trang hợp đồng đầy đủ, vì điều hướng mềm sẽ bị route chặn mở popup đè lên trang tạo cũ.
 */
export function useGoToContract() {
  const router = useRouter()
  const inModal = useInRouteModal()
  return (id: string) => {
    if (inModal) {
      router.replace(`/contracts/${id}`)
      router.refresh()
    } else window.location.assign(`/contracts/${id}`)
  }
}
