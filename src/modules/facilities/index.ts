// Cổng phía server của module facilities: chỉ những gì nơi ngoài module đang dùng.
export { listFacilities, getFacility } from './server/facilities/service'
export {
  listRooms,
  getRoom,
  roomAmenitiesOf,
  countRoomsByFacility,
  roomCodesByIds,
  registerRoomsCreatedHook,
  type Room,
  type RoomsCreatedHook,
} from './server/rooms/service'
export { listAmenities } from './server/amenities/service'
export { listFeeDefaults, listFeeTypes, listFeeUnits, listFeeTypePrices } from './server/fees/service'
export { roomInput } from './server/rooms/schemas'
