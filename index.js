var util = require('util');
var _ = require('underscore');
var stream = require('stream');

// Give our driver a stream interface
util.inherits(myDriver,stream);
util.inherits(Device,stream);

// Our greeting to the user.
var ANNOUNCEMENT = {
  "contents": [
    { "type": "heading",      "text": "Xbox Live Driver Loaded" },
    { "type": "paragraph",    "text": "You need to configure this driver using the \"Drivers\" button in the dashboard." }
  ]
};

/**
 * Called when our client starts up
 * @constructor
 *
 * @param  {Object} opts Saved/default driver configuration
 * @param  {Object} app  The app event emitter
 * @param  {String} app.id The client serial number
 *
 * @property  {Function} save When called will save the contents of `opts`
 * @property  {Function} config Will be called when config data is received from the Ninja Platform
 *
 * @fires register - Emit this when you wish to register a device (see Device)
 * @fires config - Emit this when you wish to send config data back to the Ninja Platform
 */
function myDriver(opts,app) {

  var self = this;
  this._opts = opts;

  app.on('client::up',function(){

    // The client is now connected to the Ninja Platform

    // Check if we have sent an announcement before.
    // If not, send one and save the fact that we have.
    if (!opts.hasSentAnnouncement) {
      self.emit('announcement',ANNOUNCEMENT);
      opts.hasSentAnnouncement = true;
    }

    opts.gamertags = opts.gamertags || {};
    self.save();

    for (var tag in opts.gamertags) {
      self.emit('register', new Device(tag, opts, self));
    }

  });
}

myDriver.prototype.config = function(rpc,cb) {

  var self = this;

  if (!rpc) {
    return cb(null,{"contents":[
      { "type": "submit", "name": "Add your Xbox Live Gamer Tag", "rpc_method": "addGamerTag" }
    ]});
  }

  switch (rpc.method) {
    case 'addGamerTag':
      cb(null, {
        "contents":[
          { "type": "paragraph", "text":"Please enter your Gamer Tag below."},
          { "type": "input_field_text", "field_name": "gamertag", "value": "", "label": "Gamer Tag", "placeholder": "MyCoolGamerName", "required": true},
          { "type": "paragraph", "text":"The online status of the friends of this gamertag will be sent to NinjaBlocks.'"},
          { "type": "submit", "name": "Add", "rpc_method": "add" }
        ]
      });
      break;
    case 'add':
      if (self._opts[gamertag]) {
        cb(null, {
          "contents": [
            { "type":"paragraph", "text":"Gamer Tag " + rpc.params.gamertag + " was already added previously."},
            { "type":"close", "text":"Close"}
          ]
        });
      } else {
        // Register a device
        self.emit('register', new Device(rpc.params.gamertag, self._opts, self));
        self._opts.gamertags[rpc.params.gamertag] = true;
        self.save();
        cb(null, {
          "contents": [
            { "type":"paragraph", "text":"Gamer Tag " + rpc.params.gamertag + " added."},
            { "type":"close", "text":"Close"}
          ]
        });
      }
      break;
    default:
      console.log('Unknown rpc method', rpc.method, rpc);
  }
};

function Device(gamertag, opts, driver) {

  var self = this;

  this.writeable = false;
  this.readable = true;
  this.V = 0;
  this.D = 14;
  this.G = 'xboxlive'+gamertag;

  opts.presence = opts.presence || {};
  presence = opts.presence;
  var client  = new (require('request-json').JsonClient)('https://www.xboxleaders.com/api/1.0/');

  function getFriends() {
    client.get('friends.json?gamertag=' + gamertag, function(err, res, body) {
        console.log(body);
        if (!err && body && !body.Error) {
          _.each(body.Data.Friends, function(friend) {
            if (!presence[friend.GamerTag] || presence[friend.Gamertag] !== friend.IsOnline) {
                console.log(friend);
                self.emit('data', {
                  id: friend.Gamertag,
                  present: friend.IsOnline == 'True',
                  image: friend.AvatarLarge
                });
            }
            presence[friend.Gamertag] = friend.IsOnline;
          });

          driver.save();
        } else {
             console.log('Failed to get friend data.', err || body.Error);
        }

        setTimeout(getFriends, 60 * 1000);

    });
  }

  getFriends();

}

// Export it
module.exports = myDriver;
