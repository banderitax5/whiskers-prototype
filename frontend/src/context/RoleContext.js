import { createContext, useContext } from 'react'

// 'user' | 'staff' | 'admin' — provided by RequireAdmin inside the back office
export const RoleContext = createContext('user')

export function useRole() {
  return useContext(RoleContext)
}
