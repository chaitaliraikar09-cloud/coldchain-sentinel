let _io = null;

function init(io) {
  _io = io;
}

function getIO() {
  return _io;
}

function emit(event, data, room = null) {
  if (!_io) return;
  if (room) {
    _io.to(room).emit(event, data);
  } else {
    _io.emit(event, data);
  }
}

function emitToShipment(shipmentId, event, data) {
  if (!_io) return;
  _io.to(`shipment:${shipmentId}`).emit(event, data);
  // Also emit to global listeners
  _io.emit(event, data);
}

function getConnectedCount() {
  if (!_io) return 0;
  return _io.engine.clientsCount;
}

module.exports = { init, getIO, emit, emitToShipment, getConnectedCount };
