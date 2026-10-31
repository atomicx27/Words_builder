// Re-exported wrapper pointing to the Firebase GameRoomService.
// This preserves backwards compatibility for any modules referencing ColyseusClient.
import gameRoomServiceInstance, { GameRoomService } from './GameRoomService.js';

export default gameRoomServiceInstance;
export { gameRoomServiceInstance as colyseusClientInstance, GameRoomService as ColyseusClient };
