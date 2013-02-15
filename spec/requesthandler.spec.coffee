describe "The request handler", ->

  sandbox = null
  storage = null
  requesthandler = null
  request = null
  response = null

  beforeEach ->
    sandbox = require 'sandboxed-module'
    storage = jasmine.createSpyObj('storage', [
      'list'
      'removeCollection'
      'read'
      'create'
      'update'
      'remove'
    ])
    request = jasmine.createSpyObj('request', [
      'on'
    ])
    request.headers = {host: 'localhost'} 
    request.url = "http://localhost:8888"
    response = jasmine.createSpyObj('response', [
      'writeHead'
      'write'
      'end'
    ])

    global.storage = './storage'
    requesthandler = sandbox.require '../requesthandler', 
      requires:
        './storage': storage

  it "responds to root with 400 Bad Request", -> 
    requesthandler.root(request, response)
    expectResponse 400
    expectContent()

  it "handles OPTIONS requests", -> 
    requesthandler.options(request, response)
    expectResponse 200
    #  OPTIONS response has no body
    expectNoContent()

  it "serves a collection of documents", -> 
    requesthandler.list(request, response, 'collection')
    expect(storage.list).toHaveBeenCalledWith 'collection', jasmine.any(Function)
    # execute callback that would be called from storage.list
    callback = storage.list.mostRecentCall.args[1]
    callback.call(requesthandler, undefined, [])
    expectResponse 200
    expectContent()
  
  it "says 500 if listing the collection fails", -> 
    requesthandler.list(request, response, 'collection')
    callback = storage.list.mostRecentCall.args[1]
    callback.call(requesthandler, 'error', [])
    expect500()

  it "removes a collection", ->
    requesthandler.removeCollection(request, response, 'collection')
    expect(storage.removeCollection).toHaveBeenCalledWith 'collection', jasmine.any(Function)
    callback = storage.removeCollection.mostRecentCall.args[1]
    callback.call(requesthandler, undefined)
    expectResponse 204
    expectNoContent()

  it "says 500 if removing a collection fails", ->
    requesthandler.removeCollection(request, response, 'collection')
    expect(storage.removeCollection).toHaveBeenCalledWith 'collection', jasmine.any(Function)
    callback = storage.removeCollection.mostRecentCall.args[1]
    callback.call(requesthandler, 'error')
    expect500()

  it "serves a document", ->
    requesthandler.retrieve(request, response, 'collection', 'key')
    callback = storage.read.mostRecentCall.args[2]
    callback.call(requesthandler, undefined, {foo: 'bar'}, 'key')
    expectResponse 200
    expectContent('{"foo":"bar","nstore_key":"key"}')

  it "says 404 if serving a document fails", ->
    requesthandler.retrieve(request, response, 'collection', 'key')
    callback = storage.read.mostRecentCall.args[2]
    callback.call(requesthandler, 'error', {}, 'key')
    # TODO requesthandler unconditionally assumes that the document was not found, reqardless of the error. This is very optimistic. Other error types will be masked as 404 Not Found.
    expect404()

  it "creates a document", ->
    requesthandler.create(request, response, 'collection')
    stubCreateUpdate()
    expect(storage.create).toHaveBeenCalled()
    storageCallback = storage.create.mostRecentCall.args[2]
    storageCallback.call(requesthandler, undefined, 'key')
    expectResponse 201
    #expect(response.writeHead).toHaveBeenCalledWith("Location")
    expectNoContent()

  it "says 500 if creating a document fails", ->
    requesthandler.create(request, response, 'collection')
    stubCreateUpdate()
    storageCallback = storage.create.mostRecentCall.args[2]
    storageCallback.call(requesthandler, 'error', 'key')
    expect500()

  it "updates a document", ->
    requesthandler.update(request, response, 'collection', 'key')
    stubCreateUpdate()
    expect(storage.update).toHaveBeenCalled()
    storageCallback = storage.update.mostRecentCall.args[3]
    storageCallback.call(requesthandler, undefined)
    expectResponse 204
    expectNoContent()

  it "says 404 if the document is not found during update", ->
    requesthandler.update(request, response, 'collection', 'key')
    stubCreateUpdate()
    storageCallback = storage.update.mostRecentCall.args[3]
    storageCallback.call(requesthandler, 404)
    expect404()

  it "says 500 if updating a document fails", ->
    requesthandler.update(request, response, 'collection', 'key')
    stubCreateUpdate()
    storageCallback = storage.update.mostRecentCall.args[3]
    storageCallback.call(requesthandler, 'error')
    expect500()

  it "deletes a document", ->
    requesthandler.remove(request, response, 'collection', 'key')
    callback = storage.remove.mostRecentCall.args[2]
    callback.call(requesthandler, undefined)
    expectResponse 204
    expectNoContent()

  it "says 500 if deleting  a document fails", ->
    requesthandler.remove(request, response, 'collection', 'key')
    callback = storage.remove.mostRecentCall.args[2]
    callback.call(requesthandler, 'error')
    expect500()

  it "handles bad requests", ->
    requesthandler.badRequest(response, "some very informational text")
    expectResponse 400
    #expect(response.write).toHaveBeenCalledWith('I\'m unable to process this request. I\'m terribly sorry.')
    #expect(response.write).toHaveBeenCalledWith('\nAdditional info: some very informational text')
    expectContent('I\'m unable to process this request. I\'m terribly sorry.', '\nAdditional info: some very informational text')

  it "handles not found errors", ->
    requesthandler.notFound(response)
    expect404()
  
  it "handles internal server errors", ->
    requesthandler.internalServerError(response)
    expect500()

  it "handles unimplemented methods", ->
    requesthandler.notImplemented(response)
    expectResponse 501
    expectNoContent()


  expectResponse = (status) ->
    expect(response.writeHead).toHaveBeenCalledWith(status, jasmine.any(Object)) 

  expectContent = (content...) ->
    if content and content.length > 0
      for string in content
        expect(response.write).toHaveBeenCalledWith(string)
    else
      expect(response.write).toHaveBeenCalled()
    expect(response.end).toHaveBeenCalled()

  expectNoContent = () ->
    expect(response.write).not.toHaveBeenCalled()
    expect(response.end).toHaveBeenCalled()

  expect404 = () ->
    expectResponse 404
    expectContent('The requested resource was not found.')

  expect500 = () ->
    expectResponse 500
    expectContent('Oops, something went wrong.')

  stubCreateUpdate = () ->
    requestReaderOnData = request.on.calls[0].args[1]
    requestReaderOnEnd = request.on.calls[1].args[1]
    requestReaderOnData.call(requesthandler, '{"foo":"bar"}')
    requestReaderOnEnd.call(requesthandler)
    
