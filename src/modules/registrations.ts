// Mỗi file có register* chỉ chạy khi được import; file này gom chúng để mọi điểm vào (actions, API route, layout) nạp một lần.
import '@/modules/leasing/server/contracts/service'
import '@/modules/leasing/server/contracts/lifecycle'
import '@/modules/leasing/server/addenda/service'
import '@/modules/leasing/server/handovers/service'
import '@/modules/leasing/server/incidents/service'
import '@/modules/leasing/server/invoices/service'
import '@/modules/meters/server/meters/service'
