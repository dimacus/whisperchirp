var socket = io.connect("http://"+SERVER_ADDRESS);
var chatroom = window.location.pathname.split('/').pop().toLowerCase();
var useremail;
var new_message_sound = new Audio("/static/mp3/new-message-sound.mp3");
var join_broadcast = false;
var users_online = new Array();
var users_in_chatroom = 0;
var chat_colors = new Array("#cc2a36","#00a0b0","#eb6841","#67204e","#4f372d");
var is_homepage = false;


jQuery(document).ready(function() {
  (function($) {
    // Sets cookie to determine if this is the users first time in a chatroom.
    if(!wc.getCookie("first_chatroom")){
      wc.setCookie("first_chatroom","false",365);
      addSystemMessage("Welcome to WhisperChirp. To start broadcasting your camera, click the camera icon above. Chirp on.");
    }

    // Sets cookie to determine whether or not user just watches or joins broadcast.
    if(wc.getCookie("join_broadcast&"+chatroom)) {
      if(wc.getCookie("join_broadcast&"+chatroom) == "true") join_broadcast = true;
    }
    else {
      wc.setCookie("join_broadcast&"+chatroom,"false",365);
    }



    //Setup style for coding messages for client
    users_online.push(user_id);
    $("#settings-pane").attr("userid",user_id);
    $("#settings-pane").addClass("u"+user_id);
    wc.setUserColors(user_id,"#1464a8");
    $('#dynamic-style').append(".u"+user_id+" .chat-username { color: #1464a8; }");



    /*
     * Socket io
     */
    // Connect to the chatroom
    socket.emit('connect',{chatroom: chatroom, username: username, user_id: user_id });
    socket.emit('request all users online',{chatroom: chatroom,user_id: user_id});
    socket.emit("request chat history",{chatroom: chatroom, user_id: user_id});

    socket.on('console log', function (data) {
      console.dir(data);
    });

    socket.on('receive all users online', function (data) {
      users_in_chatroom = data["number_of_users_online"];
      updateUsersOnlineNumber(data["number_of_users_online"]);
      for(var i = 0; i < data["users_in_chatroom"].length; i++){
        wc.newUser(data["users_in_chatroom"][i]["user_id"],data["users_in_chatroom"][i]["username"]);
      }
    });
    socket.on('receive new user online', function (data) {
      var user_id = data["user_id"];
      var username = data["username"];
      users_in_chatroom = data["users_in_chatroom"];
      wc.updateUsersInChatroom(users_in_chatroom);
     
      wc.newUser(user_id,username);
      console.dir(username+" is online.");
      updateUsersOnlineNumber(users_in_chatroom);
      if(users_online.indexOf(user_id) == -1) wc.newUser(user_id,username);
    });

    socket.on('receive user offline', function (data) {
      var user_id = data["user_id"];
      var username = data["username"];

      users_in_chatroom--;
      wc.updateUsersInChatroom(users_in_chatroom);
      $("#users-online-pane .u"+user_id).remove();
      console.dir(username + " is offline");
      updateUsersOnlineNumber(users_in_chatroom);
    });


    socket.on('receive already in this room', function (data) {
      alert("You are in this room in another tab. Please close this window to avoid strange behavior.");
    });

    socket.on('receive new message', function (data) {
      addChatMessage(data);
      $("#chat-messages").scrollTop($("#chat-messages .chat-message-section").length * 5000);
      new_message_sound.play();
      
    });

    socket.on('receive name change', function (data) {
      var user_id = data["user_id"];
      var username = data["username"];
      $(".u"+user_id+" .chat-username").text(username);
      console.dir("receive name change");
    });

    socket.on('receive photo change', function (data) {
      var userphoto = data["userphoto"];
      var user_id = data["user_id"];
      $(".u"+user_id+" .chat-userphoto").attr("src",userphoto);
      validateAllPhotos();
      console.dir("receive photo change");
    });

    socket.on('receive users online pane', function (data) {
      for (var i = 0; i < data.length; i++) {
        users_in_chatroom++;
        wc.newUser(data[i]["user_id"],data[i]["username"]);
      }
      wc.updateUsersInChatroom(users_in_chatroom);
    });

    socket.on('give chat history', function (data) {
      var user_id = data["user_id"];
      var chatroom = data["chatroom"];
      var history = new Array();
      var count = 0;
      
      $("#chat-messages .chat-message-section").each(function(){
        if($(this).find(".chat-username").first().text() != "system_messenger") {
          history[count] = {
            "message": $(this).find(".chat-message").first().text(),
            "username": $(this).find(".chat-username").first().text(),
            "userphoto": $(this).find(".chat-userphoto").first().attr("src"),
            "user_id": $(this).attr("user_id"),
            "timestamp": $(this).attr("timestamp")
          };
        }
        count++;
      });
      // This is where I need to send the history as json. Each post as it's own number. Holding an object in each.
      socket.emit('receive chat history',{chatroom: chatroom,user_id: user_id, history: history});
    });

    socket.on('receive chat history', function (data) {
      var history = data["history"];
      var user_id = data["user_id"];
      var chatroom = data["chatroom"];
      for(var i=0; i < history.length; i++) {
        addChatMessage(history[i]);
      }
      $("#chat-messages").scrollTop($("#chat-messages").height() * 2);

    });


    /*
     * Handlers
     */
    $(document).ready(function(){
      $(window).resize();
      /*
       * Web rtc io
       */
      var PeerConnection = window.PeerConnection || window.webkitPeerConnection00 || window.webkitRTCPeerConnection || window.mozRTCPeerConnection || window.RTCPeerConnection;
      var is_chrome = navigator.userAgent.toLowerCase().indexOf('chrome') > -1;
      var is_ios = ( navigator.userAgent.match(/(iPad|iPhone|iPod|CriOS|iOS)/g) ? true : false );
      var is_android = ( navigator.userAgent.match(/(Android)/g) ? true : false );

      if(is_chrome) {
        var chrome_ver = parseInt(window.navigator.appVersion.match(/Chrome\/(\d+)\./)[1], 10);
      }
      if(PeerConnection && is_chrome && (chrome_ver >= 30 || is_ios || is_android)) {
        rtc.on('add remote stream', function(stream, socketId) {
          var new_video = newVideo(socketId);
          rtc.attachStream(stream, new_video.attr("id"));
        });
        rtc.on('disconnect stream', function(data) {
          removeVideo(data);
        });

        if(join_broadcast === true) {
          joinBroadcast();
          $("#video-toggle").removeClass("off");
        }
        else {
          watchBroadcasts();
          $("#video-toggle").addClass("off");
        }

        rtc.connect("ws://"+SERVER_ADDRESS+":4000", chatroom);
        resizeVideos();
      }
      else {
        //$("#video-toggle").css("display","none");
        $("#videos").html("<div style='text-align: left; color: gray; font-size: 16px;'>Sorry but you must use the latest version of Google Chrome for video chat capabilites. Feel free to enjoy text chat. And if you're using Internet Explorer, don't. :)</div>");
      }

    });
    $(window).resize(function(){
      resizeVideos();
      $("#chat-messages").css("height",$(window).height() - 145 + "px");

      // All this is to ensure a smooth transition between the mobile and desktop versions
      if($(window).width() >= 1000) {
        // This ensures the chat is restored to normal
        $("#chat-icon").removeClass("open");
        $("#chat-icon").css("right","30px");
        $("#chat-sec").css("right","0px");
        $(".content-2").css("height","auto");
      }else {
        $(".content-2").css("height",$(window).height()-125+"px");
        $("#chat-icon").css("right",$("#chat-sec").width() +10-80 + "px" );
        $("#chat-icon").addClass("open");
        $("#chat-sec").css("right","0px");
      }
    });
    $("#chat-box").keypress(function(event){
      var keycode = (event.keyCode ? event.keyCode : event.which);
        if(keycode == '13'){
          socket.emit('give new message',{chatroom: chatroom, username: username,user_id:user_id, userphoto: userphoto, message: $("#chat-box").val() });
          $(this).focus();
          $(this).val("");
        }
    });
    $("#chat-box").keyup(function(event){
      if($(this).val().trim() === "") {
        $(this).val("");
        wc.resetRange($(this));
      }
    });

    $("#change-name").click(function(){
      wc.changeName();
    });

    $("#change-photo").click(function(){
      wc.changePhoto();
    });
    $("#users-toggle").click(function(){
      if(users_in_chatroom > 1) {
        $("#users-online-pane").toggleClass("hidden");
        $("#users-toggle img").toggleClass("hidden");
      }
    });
    $("#video-toggle").click(function(){
      if($(this).hasClass("off")) {
        wc.setCookie("join_broadcast&"+chatroom,"true",365);
      }
      else {
        wc.setCookie("join_broadcast&"+chatroom,"false",365);
      }
      location.href="/"+chatroom;
    });

    //This checks to see if a change needs to be made to the username.
    setInterval(function(){
      if(wc.getCookie("userphoto") != userphoto) {
        $.when($("#settings-userphoto").val(wc.getCookie("userphoto"))).then(wc.changePhoto());
      }
      if(wc.getCookie("username") != username) {
        $.when($("#settings-username").val(wc.getCookie("username"))).then(wc.changeName());
      }
    }, 5000);

    $("#settings-username,#settings-userphoto").keypress(function(event){
      var keycode = (event.keyCode ? event.keyCode : event.which);
        if(keycode == '13'){
          $("#settings-update").click();
        }
    });

    $("#chat-icon").click(function(){
      if($(this).hasClass("open")) {
        $("#chat-sec").animate({ right: "-100%"},500);
        $("#chat-icon").animate({ right: "30px" },500, function(){
          $(this).removeClass("open");
        });
      }
      else {
        $("#chat-sec").animate({ right: 0},500);
        $("#chat-icon").animate({ right: $("#chat-sec").width() +10-80 + "px" },500,function(){
          $(this).addClass("open");
        });
      }
    });

  })( jQuery ); // End scripts
});

window.onbeforeunload = function() {
  socket.onclose = function () {}; // disable onclose handler first
  socket.close();
};




function newVideo(socketId) {
  var new_video = "<video id='remote"+socketId+"' class='video' width='600' height='400' autoplay></video>";
  var video_sec_width = $("#videos").width();
  $("#videos").append(new_video);

  var no_of_videos = $(".video").length;

  if(no_of_videos >= 4) {
    $(".video").attr("width","200");
    $(".video").attr("height","150");
  }
  else {
    var vid_width = video_sec_width/no_of_videos - 50;
    $(".video").attr("width",vid_width);
    $(".video").attr("height",(vid_width*3)/4);
  }
  
  if($("#videos video").length > 8) {
    addSystemMessage("More than 8 videos at once it not recommended. You may experience slow service.");
  }
  resizeVideos();
  return $("#remote"+socketId);
}
function addSystemMessage(message) {
    addChatMessage({
      "message": message,
      "username" : "system_messenger",
      "userphoto":"/static/img/chat-logo.png",
      "user_id": "system_messenger",
      "timestamp": new Date()
    }); 
}
function addChatMessage(data) {
  var message = data["message"];
  var username = data["username"];
  var userphoto = data["userphoto"];
  var user_id = data["user_id"];
  var timestamp = data["timestamp"];
  var exp2 = /\(?(?:(http|https|ftp):\/\/)?(?:((?:[^\W\s]|\.|-|[:]{1})+)@{1})?((?:www.)?(?:[^\W\s]|\.|-)+[\.][^\W\s]{2,4}|localhost(?=\/)|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::(\d*))?([\/]?[^\s\?]*[\/]{1})*(?:\/?([^\s\n\?\[\]\{\}\#]*(?:(?=\.)){1}|[^\s\n\?\[\]\{\}\.\#]*)?([\.]{1}[^\s\?\#]*)?)?(?:\?{1}([^\s\n\#\[\]]*))?([\#][^\s\n]*)?\)?/;
  message = message.replace(exp2,"<a href='http://$3$4$5$6$7$8' target='_blank'>$3$4$5$6$7$8</a>"); 

  $('#chat-messages').append("\
    <div class='chat-message-section u"+user_id+"' user_id='"+user_id+"' timestamp='"+timestamp+"'>\
      <div class='chat-message-picture'>\
        <img class='chat-userphoto' src='"+userphoto+"' />\
      </div>\
      <div class='chat-message-text'>\
        <div class='chat-username'>"+username+"</div>\
        <div class='chat-message'>"+message+"</div>\
      </div>\
    </div>\
    <div class='clear'></div>\
  ");
  validateAllPhotos();


}

function removeVideo(socketId) {
  var video = $('#remote' + socketId);
  if(video.length !== 0) {
    video.remove();
  }
  resizeVideos();
}

function joinBroadcast() {
  $("#videos").prepend("<video id='localvideo' width='400' height='300' muted='' autoplay='' class='video'></video>");

  rtc.createStream({
    "video": true,
    "audio": true
  }, function(stream) {
    $("#localvideo").attr("src", URL.createObjectURL(stream));
    $("#localvideo").get(0).play();
    rtc.attachStream(stream, 'localvideo');
  });

}

function watchBroadcasts() {
  // This tells the browser it's ready to start watching the broadcasts
  setTimeout(function() { 
    rtc.fire("ready");
  },1000);
}

/*
 * General Functions -- Move these to functions.js
 */
function resizeVideos() {
  var no_vids = $("#videos").find("video").length;
  var v_w = parseInt($("#videos").width(),0)/no_vids;
  if(v_w > 600 ) v_w = 600; 
  if(v_w < 150 ) v_w = 150; 
  var v_h = (v_w * 3)/4;

  $("#videos video").each(function(){
    $(this).width(v_w+"px");
    $(this).height(v_h+"px");
  });
}
function updateUsersOnlineNumber(x){
  $("#users-online-number").html(x);
  if(users_in_chatroom <= 1 ) {
    $("#users-online-pane").addClass("hidden");
    $("#open-arrow-uo").addClass("hidden");
    $("#close-arrow-uo").addClass("hidden");
    $("#plural-user").addClass("hidden");
  }
  else {
    $("#open-arrow-uo").removeClass("hidden");
    $("#close-arrow-uo").addClass("hidden");
    $("#plural-user").removeClass("hidden");
  }
}
function validateAllPhotos(){
  $("#chat-messages img").error(function(){
    $(this).attr("src",defaultuserphoto);
  });
  $("#chat-messages img").each(function(){
    if($(this).attr("src") === "") $(this).attr("src",defaultuserphoto);
  });
}
