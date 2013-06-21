'use strict'

/*
 * Wrapper for node-dirty.
 * 
 * Accesses the in-memory database.
 */

var fs = require('fs');
var dirty = require('dirty')
var uuid = require('node-uuid')

var cache = new (require ('./collection_cache'))()
var log = require('../log')

module.exports = NodeDirtyConnector

function NodeDirtyConnector() {

  this.checkAvailable = function(callbackAvailable, callbackNotAvailable) {
    callbackAvailable()
  }

  this.list = function(collectionName, writeDocument, writeEnd) {
    log.debug("listing " + collectionName)
    withCollectionDo(collectionName, function(collection) {
      collection.forEach(function(key, doc) {
        if (doc) {
          doc._id = key
          writeDocument(doc)
        } else {
          log.warn("node-dirty backend handed empty doc to callback, key: " + key)
        }
      })
      writeEnd(null)
    })
  }

  // Duplication: Same code as for nStore backend
  this.removeCollection = function(collectionName, writeResponse) {
    log.debug("removing collection " + collectionName)

    // For now, we just do a hard filesystem delete on the file.
    // Of course, this is bound to break on concurrent requests.
    var databaseFilename = getDatabaseFilename(collectionName)
    cache.remove(databaseFilename)
    fs.exists(databaseFilename, function (exists) {
      if (exists) {
        fs.unlink(databaseFilename, function (err) {
          // ignore error number 34/ENOENT, might happen if a concurrent removeCollection alread killed the file
          if (err && err.errno && err.errno === 34) {
            log.warn("Ignoring: " + err)
            err = undefined
          }
          writeResponse(err)
        })
      } else {
        log.debug(databaseFilename + " does not exist, doing nothing.")
        writeResponse(null)
      }
    })
  }

  this.read = function(collectionName, key, writeResponse) {
    withCollectionDo(collectionName, function(collection) {
      log.debug("reading " + collectionName + "/" + key)
      var doc = collection.get(key) 
      if (doc) {
        doc._id = key
        log.debug("read result: " + JSON.stringify(doc))
        writeResponse(undefined, doc, key)
      } else {
        writeResponse(create404(), null, key)
      }
    })
  }

  this.create = function(collectionName, doc, writeResponse) {
    log.debug("creating item in " + collectionName)
    var collection = openCollection(collectionName)
    // using uuid.v4() might give even "better" uuid, but is also more expensive
    var key = uuid.v1()
    collection.set(key, doc)
    writeResponse(undefined, key)
  }

  this.update = function(collectionName, key, doc, writeResponse) {
    log.debug("updating item " + collectionName + "/" + key + ": " + JSON.stringify(doc))
    withCollectionDo(collectionName, function(collection) {
      // call get to make sure the key exist, otherwise we need to 404
      var existingDoc = collection.get(key)
      if (existingDoc) { 
        log.debug("now really updating item " + collectionName + "/" + key + ": " + JSON.stringify(doc))
        collection.set(key, doc)
        writeResponse(undefined)
      } else {
        writeResponse(create404()) 
      }    
    })
  }

  this.remove = function(collectionName, key, writeResponse) {
    log.debug("removing item " + collectionName + "/" + key)
    var collection = openCollection(collectionName)
    collection.rm(key)
    writeResponse()
  }

  this.closeConnection = function closeConnection(callback) {
    log.debug("closeConnection has no effect with the node-dirty backend.")
    if (callback && typeof callback == 'function') {
      callback(undefined)
    }
  }

  /*
   * For write access only, use the (potentially faster) method openCollection.
   * For read access, use this method and pass a callback.
   */
  function withCollectionDo(collectionName, callback) {
    accessCollection(collectionName, callback)
  }

  /*
   * According to node-dirty docs you can safely write to the collection (db in
   * their terms) directly. To safely read from the collection, you need to wait
   * for the event 'load', however. See withCollectionDo.
   */
  function openCollection(collectionName) {
    return accessCollection(collectionName, undefined)
  }

  /* To be used only from withCollectionDo and openCollection */
  function accessCollection(collectionName, callback) {
    var databaseFilename = getDatabaseFilename(collectionName)
    var collection = cache.get(databaseFilename)
    if (collection) {
      log.debug('accessing collection ' + databaseFilename + ' via cached collection object.') 
      if (callback) {
        callback(collection)
      }
      return collection
    } else {
      log.debug("collection " + collectionName + " was not in cache.")
      collection = dirty.Dirty(databaseFilename)
      collection.on('load', function() {
        log.debug("collection " + collectionName + " created/loaded.")
        cache.put(databaseFilename, collection)
        if (callback) {
          callback(collection)
        }
      })
      return collection
    }
  }

  function getDatabaseFilename(collectionName) {
    return 'data/' + collectionName + '.node-dirty.db'
  }

  function create404() {
    var error = new Error("not found")
    error.http_status = 404
    return error
  }
}
