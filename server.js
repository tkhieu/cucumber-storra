'use strict'

/*
 * server module - starts the http server.
 */

var http = require("http")

var log = require("./log")
var router = require("./router")

function start() {
  function onRequest(request, response) {
    log.debug(request.method + ": " + request.url)
    router.route(request, response)
  }
  http.createServer(onRequest).listen(global.storra_port, global.storra_bind_address)
  log.info("now listening on port " + global.storra_port + " (bind address: " + global.storra_bind_address + ")" + "...")
}

exports.start = start
