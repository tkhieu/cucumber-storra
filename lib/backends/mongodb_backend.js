'use strict'

/*
 * Wrapper for MongoDB.
 */

var log = require('../log')
var MongoClient = require('mongodb').MongoClient
var Server = require('mongodb').Server
var ObjectID = require('mongodb').ObjectID

global.storra_config.mergeDefaults({
  mongodb: {
    connection_max_retries: 20,
    connection_time_between_retries: 50,
    database: 'storra'
  }
})
log.debug('MongoDB configuration, merged with defaults:\n' + JSON.stringify(global.storra_config.mongodb))

module.exports = MongoDBConnector

function MongoDBConnector() {

  var self = this
  this.maxRetries          = global.storra_config.mongodb.connection_max_retries
  this.timeBetweenRetries  = global.storra_config.mongodb.connection_time_between_retries
  this.database            = global.storra_config.mongodb.database

  this.mongoClient = new MongoClient(new Server('localhost', 27017, {auto_connect: true, poolSize: 10}));


  // Also cache collection objects? But maybe it's cheap to access them every time
  // without using a cache (and probably safer)?

  this.checkAvailable = function(callbackAvailable, callbackNotAvailable) {
    openConnection(function(err) {
      if (err) {
        callbackNotAvailable(err)
      } else {
        callbackAvailable()
      }
    })
  }

  this.list = function(collectionName, writeDocument, writeEnd) {
    log.debug("listing " + collectionName)
    openConnection(function(err, mongoClient) {
      // Right now we push each single document to the http response.
      // It might be more efficient to buffer a number of documents and 
      // push them through in larger chunks.
      withCollectionDo(mongoClient, collectionName, function(collection) {
        var results = [] 
        collection.find().each(function(err, doc) {
          if (err) {
            writeEnd(err)
          } else if (doc) {
            log.debug("listing entry: " + JSON.stringify(doc))
            writeDocument(doc)
          } else {
            // db cursor exhausted, no more results
            writeEnd(null)
          }
        })
      })
    }, writeEnd)
  }

  this.removeCollection = function removeCollection(collectionName, writeResponse) {
    log.debug("removing collection " + collectionName)
    openConnection(function(err, mongoClient) {
      db().dropCollection(collectionName, function(err, result) {
        // help node-mongodb-native to be idempotent, that is, ignore error if
        // collection to be removed does not exist.
        if (err && (err.message === 'ns not found' || err.errmsg === 'ns not found')) {
          log.debug("Ignoring 'ns not found' error during removeCollection")
          err = null
        }
        writeResponse(err)
      })
    }, writeResponse)
  }

  this.read = function(collectionName, key, writeResponse) {
    log.debug("reading item " + collectionName + "/" + key)
    openConnection(function(err, mongoClient) {
      withCollectionDo(mongoClient, collectionName, function(collection) {
        collection.findOne({_id: new ObjectID(key) }, function(err, doc) {
          if (err) {
            writeResponse(err, null, key)
          } else {
            if (doc) {
              writeResponse(err, doc, key)
            } else {
              writeResponse(create404(), null, key)
            }
          }
        })
      })
    }, writeResponse)
  }


  this.create = function(collectionName, doc, writeResponse) {
    log.debug("creating item in " + collectionName)
    openConnection(function(err, mongoClient) {
      withCollectionDo(mongoClient, collectionName, function(collection) {
        collection.insert(doc, {}, function(err, result) {
          if (err) {
            writeResponse(err, null)
          } else {
            if (result) {
              var oid = result[0]['_id'].toHexString()
              writeResponse(err, oid)
            } else {
              writeResponse(err, null)
            }
          }
        })
      })
    }, writeResponse)
  }

  this.update = function(collectionName, key, doc, writeResponse) {
    log.debug("updating item " + collectionName + "/" + key)
    openConnection(function(err, mongoClient) {
      withCollectionDo(mongoClient, collectionName, function(collection) {
        doc._id = new ObjectID(key)
        collection.update({_id: doc._id}, doc, {}, function(err, result) {
          if (result == 0) {
            writeResponse(create404()) 
          } else if (result > 1) {
            // This will never happen™.
            writeResponse(new Error('An update changed ' + result + ' documents instead of one.'))
          } else {
            writeResponse(err)
          }
        })
      })
    }, writeResponse)
  }

  this.remove = function(collectionName, key, writeResponse) {
    log.debug("removing item " + collectionName + "/" + key)
    openConnection(function(err, mongoClient) {
      withCollectionDo(mongoClient, collectionName, function(collection) {
        collection.remove({_id: new ObjectID(key)}, function(err, numberOfRemovedDocs) {
          log.debug("Removed " + numberOfRemovedDocs + " documents")
          writeResponse(err)
        })
      })
    }, writeResponse)
  }

  this.closeConnection = function closeConnection(callback) {
    log.debug("closing connection to MongoDB")
    this.mongoClient.close(function(err, result) {
      if (callback && typeof callback == 'function') {
        callback(err)
      }
    })
  }

  this.setRetryParameters = function(maxRetries, timeBetweenRetries) {
    this.maxRetries = maxRetries
    this.timeBetweenRetries = timeBetweenRetries
  }

  function openConnection(callback, writeResponse, retriesLeft) {
    // TODO We are using a lot of mongodb client lib's internals here
    // Can we do better than this?
    if (!self.mongoClient._db.openCalled) {
      // connection not yet or no longer open, connect now
      log.debug('MongoDB not yet connected, establishing connection now.')
      reallyOpenConnection(callback)
    } else if (self.mongoClient._db._state === 'connected') {
      // connection already open, do nothing
      callback(null, self.mongoClient)
    } else if (self.mongoClient._db._state === 'connecting') {
      // connection has been requested before, but has not been fully established yet
      // we wait and poll until the connection has been established or maxRetries is
      // reached
      log.warn('Connection to MongoDB is currently being established, waiting/retrying.')
      if (retriesLeft === undefined) {
        retriesLeft = self.maxRetries
      } 
      if (retriesLeft === 0) {
        var err = new Error('Could not connect to MongoDB after ' + self.maxRetries + ' retries, MongoClient is still in state connecting.')
        onConnectError(err, writeResponse)
      } else {
        // retry later/wait for connection to be established
        setTimeout(function() {
          log.debug('in retry callback')
          openConnection(callback, writeResponse, retriesLeft - 1)
        }, self.timeBetweenRetries)
      }
    } else {
      var err = 'Unexpected state of MongoClient: Connection has already been opened but connection state is ' + self.mongoClient._db._state + '.'
      onConnectError(err, writeResponse)
    }
  }

  function reallyOpenConnection(callback) {
    self.mongoClient.open(function(err, mongoClient) {
      callback(err, mongoClient)
    })
  }

  function onConnectError(err, writeResponse) {
    err.http_status = 500
    writeResponse(err)
  }

  function withCollectionDo(mongoClient, collectionName, callback) {
    callback(db().collection(collectionName))
  }

  function db() {
    return self.mongoClient.db(self.database)
  }

  function create404() {
    var error = new Error("not found")
    error.http_status = 404
    return error
  }

  /*
  // keep this around for debugging purposes
  function dumpMongoState(label) {
    log.error(label)
    log.error('openCalled: ' + self.mongoClient._db.openCalled)
    log.error('_state    : ' + self.mongoClient._db._state)
  }
  */
}