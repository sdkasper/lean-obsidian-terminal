"use strict";
/**
 * Patched ConoutConnection that uses inline socket piping instead of Worker threads.
 * Worker threads are not supported in Obsidian's Electron renderer process.
 * ConPTY defaults to true in node-pty; this patch avoids Worker threads so inline piping is safe.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConoutConnection = void 0;
var net = require("net");
var conout_1 = require("./shared/conout");

var ConoutConnection = (function () {
    function ConoutConnection(_conoutPipeName, _useConptyDll) {
        var _this = this;
        this._conoutPipeName = _conoutPipeName;
        this._useConptyDll = _useConptyDll;
        this._isDisposed = false;
        this._readyCallbacks = [];
        this._isReady = false;
        this._conoutSocket = null;
        this._server = null;
        this._drainTimeout = null;

        // Inline version of what the Worker would do:
        // Connect to conout pipe, create server, pipe data through
        this._conoutSocket = new net.Socket();
        this._conoutSocket.setEncoding('utf8');
        this._conoutSocket.connect(_conoutPipeName, function () {
            _this._server = net.createServer(function (workerSocket) {
                _this._conoutSocket.pipe(workerSocket);
            });
            _this._server.listen(conout_1.getWorkerPipeName(_conoutPipeName));
            _this._isReady = true;
            _this._readyCallbacks.forEach(function (cb) { cb(); });
            _this._readyCallbacks = [];
        });

        this._conoutSocket.on('error', function () {
            // Ignore connection errors during cleanup
        });
    }

    ConoutConnection.prototype.onReady = function (listener) {
        if (this._isReady) {
            listener();
        } else {
            this._readyCallbacks.push(listener);
        }
        return { dispose: function () {} };
    };

    ConoutConnection.prototype.connectSocket = function (socket) {
        socket.connect(conout_1.getWorkerPipeName(this._conoutPipeName));
    };

    ConoutConnection.prototype.dispose = function () {
        var _this = this;
        if (!this._useConptyDll && this._isDisposed) {
            return;
        }
        this._isDisposed = true;
        if (this._drainTimeout) {
            clearTimeout(this._drainTimeout);
        }
        this._drainTimeout = setTimeout(function () {
            try {
                if (_this._server) _this._server.close();
                if (_this._conoutSocket) _this._conoutSocket.destroy();
            } catch (e) {
                // ignore cleanup errors
            }
        }, 1000);
    };

    return ConoutConnection;
}());

exports.ConoutConnection = ConoutConnection;
