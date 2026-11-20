// proxy chỉ được import lib/domain: import module → vi phạm, import lib → hợp lệ.
import { usersApi } from '@/modules/users'
import { util } from '@/lib/util'

export const proxy = [usersApi, util]
