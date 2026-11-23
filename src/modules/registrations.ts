// Mỗi file có register* chỉ chạy khi được import; file này gom chúng để mọi điểm vào (actions, API route, layout) nạp một lần.
import '@/server/contracts/service'
import '@/server/contracts/lifecycle'
import '@/server/addenda/service'
import '@/server/handovers/service'
import '@/server/incidents/service'
import '@/server/invoices/service'
import '@/modules/meters/server/meters/service'
