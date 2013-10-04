var express = require('express');
var fs = require('fs');
var open = require('open');

exports.start = function(PORT, STATIC_DIR, TEST_DIR) {
  var app = express();
  var server = require('http').createServer(app);
  var server2 = require('http').createServer(app);
  var io = require('socket.io').listen(server);
  var webRTC = require('webrtc.io').listen(server2);

  var users_online = new Array();

  app.set('views', STATIC_DIR + '/views');
  app.set('view engine', 'jade');
  //app.use(express.logger('dev'));

  //this sets the static path to provide all static files
  app.use('/static',express.static(STATIC_DIR));
  
  server.listen(PORT);
  server2.listen(4000);

  app.get('/', function (req, res) {
    res.render('index',
      { title : 'Home' }
    );
  });

  app.get('/:chatroom', function (req, res) {
    res.render('chatroom',
      { title : 'Chatroom' }
    );
  });

  app.get('*', function (req, res) {
    res.render('404',
      { title : '404' }
    );
  });

  io.sockets.on('connection', function (socket) {
    /*
    Connect the client to a chatroom
    */
    socket.on('connect', function (data) {
      var chatroom = data["chatroom"].toLowerCase(); 
      var username = data["username"]; 
      var user_id = data["user_id"]; 
      var users_in_chatroom = 1;

      for (var i = 0; i < users_online.length; i++) {
        if(users_online[i]["chatroom"] === chatroom) {
          users_in_chatroom++;
          if(users_online[i]["user_id"] === user_id ) socket.emit("recieve already in this room");
        }
      }

      data["users_in_chatroom"] = users_in_chatroom;

      users_online.push({ socket_id: socket.id, chatroom: chatroom, user_id: user_id, username: username  });
      sendToChatRoom(chatroom,socket.id,"recieve new user online", data);
    });

    socket.on('disconnect', function () {
      var socket_data = getSocketData(socket.id);
      var chatroom = socket_data["chatroom"];

      for (var i = 0; i < users_online.length; i++) {
        if(users_online[i]["socket_id"] == socket.id) { 
          sendToChatRoom(chatroom,socket.id,"recieve user offline", {user_id: users_online[i]["user_id"], username: users_online[i]["username"]});
          users_online.splice(i, 1);
          break;
        }
      };
    });

    /*
    Send message to all of the users who are online
    */
    socket.on('give new message', function (data) {
      var chatroom = data["chatroom"].toLowerCase();
      data["timestamp"] = new Date();
      sendToChatRoom(chatroom,socket.id,"recieve new message", data);
      socket.emit("recieve new message", data);
    });

    socket.on('recieve all users online', function (data) {
      var chatroom = data["chatroom"].toLowerCase();
      var user_id = data["user_id"];
      var users_in_chatroom = new Array();

      for (var i = 0; i < users_online.length; i++) {
        if(users_online[i]["chatroom"] == chatroom) {
          if(users_online[i]["user_id"] != user_id) users_in_chatroom.push({user_id: users_online[i]["user_id"],username: users_online[i]["username"]});
        }
      }
      socket.emit("recieve users online pane", users_in_chatroom);
    });

    socket.on('name change', function (data) {
      var username = data["username"];
      var socket_data = getSocketData(socket.id);
      var chatroom = socket_data["chatroom"];
      socket_data["username"] = username;
      setSocketUsername(socket.id, username);

      sendToChatRoom(chatroom,socket.id,"recieve name change", socket_data);
      socket.emit("recieve name change",socket_data);
    });

    socket.on('give photo change', function (data) {
      var user_id = data["user_id"];
      var chatroom = data["chatroom"].toLowerCase();

      sendToChatRoom(chatroom,socket.id,"receive photo change", data);
    });

  });

  function getSocketId(chatroom,user_id) {
    for (var i = 0; i < users_online.length; i++) {
      if(users_online[i]["chatroom"] == chatroom && users_online[i]["user_id"] == user_id)
        return users_online[i]["socket_id"];
    };

    return null;
  }

  function getSocketData(socket_id) {
    for (var i = 0; i < users_online.length; i++) {
      if(users_online[i]["socket_id"] === socket_id)
        return { chatroom: users_online[i]["chatroom"], user_id: users_online[i]["user_id"]};
    };

    console.log("There are no users fitting that criteria, Socket Id: " + socket_id);
    return {};
  }

  function setSocketUsername(socket_id,username) {
    for (var i = 0; i < users_online.length; i++) {
      if(users_online[i]["socket_id"] == socket_id) users_online[i]["username"] = username;
    };
  }

  function sendToChatRoom(chatroom, socket_id,func,data) {
    for (var i = 0; i < users_online.length; i++) {
      if(users_online[i]["chatroom"] == chatroom && users_online[i]["socket_id"] != socket_id) {
        io.sockets.socket(users_online[i]["socket_id"]).emit(func,data);
      }
    }
  }

  webRTC.rtc.on('chat_msg', function(data, socket) {
    var roomList = webRTC.rtc.rooms[data.room] || [];

    for (var i = 0; i < roomList.length; i++) {
      var socketId = roomList[i];

      if (socketId !== socket.id) {
        var soc = webRTC.rtc.getSocket(socketId);

        if (soc) {
          soc.send(JSON.stringify({
            "eventName": "receive_chat_msg",
            "data": {
              "messages": data.messages,
              "color": data.color
            }
          }), function(error) {
            if (error) {
              console.log(error);
            }
          });
        }
      }
    }
  });
};
