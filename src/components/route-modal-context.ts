'use client'

import { createContext, useContext } from 'react'

/** Đang ở trong popup của route chặn (mở từ danh sách), không phải trang mở thẳng hay tải lại. */
export const RouteModalContext = createContext(false)
export const useInRouteModal = () => useContext(RouteModalContext)
