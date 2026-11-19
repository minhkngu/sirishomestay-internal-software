// Cổng phía server của module assets: chỉ những gì nơi ngoài module đang dùng.
export {
  listAssets,
  getAsset,
  assetHistory,
  assetLocationLabel,
  listContractAssetOptions,
  createAsset,
  updateAsset,
  createAssetInTransaction,
  moveAssetsInTransaction,
  setAssetStatusInTransaction,
} from './server/assets/service'
export { listStock } from './server/stock/service'
