//Load jquery
window.$ = window.jQuery = require('./libs/jquery-1.10.2.min.js');


$(function () {
    //App vars
    var FADE_TIME = 150; // ms
    var TYPING_TIMER_LENGTH = 400; // ms
    var COLORS = [
        '#e21400', '#91580f', '#f8a700', '#f78b00',
        '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
        '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
    ];

    // Initialize variables
    var $window = $(window);
    var $usernameInput = $('.usernameInput'); // Input for username
    var $messages = $('.messages'); // Messages area
    var $inputMessage = $('.inputMessage'); // Input message input box
    var $ipInput = $('#ip-input'); //Input for ip

    var $loginPage = $('.login.page'); // The login page
    var $chatPage = $('.chat.page'); // The chatroom page

    //Connection
    var serverip;
    var serverport;
    var chooseIp = false;

    // Prompt for setting a username
    var username;
    var connected = false;
    var typing = false;
    var lastTypingTime;
    var $currentInput = $ipInput.focus();

    var socket;
    var users = [];

    //This is very dirty hack for not showing or last message as new
    var lastmessage;

    //The entry point
    function startApp() {
        hideIpModal();
    }

    //Hide ip modal and start server
    function hideIpModal() {
        //Get IP
        serverip = $ipInput.val();
        if (serverip.indexOf(":") !== -1) {
            serverport = serverip.substr(serverip.indexOf(":") + 1) | 0;
            serverip = serverip.substr(0, serverip.indexOf(":"));
        } else {
            serverport = 80;
        }

        //Hide modal
        $("#modal").hide();

        //Start socket
        startSocket();
        chooseIp = true;
    }

    //Show ip modal
    $("#reconnect").click(showIpModal);
    function showIpModal() {
        chooseIp = false;
        $currentInput = $ipInput.focus();
        $("#modal").show();
    }

    //Start socket process
    function startSocket() {
        connected = true;

        //If we have old socket close it
        if (socket && socket.close) {
            socket.close();
        }

        //Create new socket
        socket = require('./udp-client.js');

        socket.start(serverip, serverport);

        //Start SocketChat
        //Tell everyone about our name and ask for theirs
        setUsername();

        //Start socket listeners
        runSocketEvents();
    }

    // Sets the client's username
    function setUsername() {
        username = cleanInput($usernameInput.val().trim());

        // If the username is valid
        if (username) {
            $loginPage.fadeOut();
            $chatPage.show();
            $loginPage.off('click');
            $currentInput = $inputMessage.focus();

            // Tell the server your username
            socket.send('name', username);
        }
    }


    function findUser(type, val, returnIndex) {
        //if we not found anyone return empty object
        var returned = {
            name: false,
            ip: false,
            port: false
        };

        users.forEach(function (el, i) {
            //console.log(el[type] + ' | ' + val);
            if (el[type] == val) {
                if (returnIndex) {
                    returned = i;
                } else {
                    returned = el;
                }
            }
        });

        return returned;
    }

    // Socket events
    function runSocketEvents() {
        //Listen for messages
        socket.onmessage(function (message, rinfo) {
            const type = message.readUIntLE(0, 3);
            const mess = message.toString('utf8', 8, message.length);

            console.info('[RECEIVE] type: ' + type + ' | mess: ' + mess);

            /*
             * первые 4 байта это метка
             * следующие 4 байта это длина строки сообщения
             *
             * метки:
             * 2016 - сообщение
             * 2017 - отправка имени и запрос на имя
             * 2018 - адрес обратного запроса
             * 2019 - удаление имени(выход пользователя)
             * */
            switch (type) {
                case 2016:
                    //message

                    //If it's not us
                    var sender_username = findUser('ip', rinfo.address).name;
                    console.info('Sender username: ' + sender_username);
                    if (sender_username !== username && lastmessage !== mess) {
                        var data = {};
                        data.message = mess;
                        data.username = sender_username;

                        addChatMessage(data);
                    }

                    break;
                case 2017:
                    //other user tell us about him and ask us to tell him about us

                    //If it's not us
                    if (mess !== username) {

                        //Add user(log + to obj)
                        addUser(mess, rinfo);

                        //Tell other user about us
                        socket.send('backname', username);

                    }

                    break;
                case 2018:
                    //other user tell us about him, when we tell about us

                    //@TODO: fix bug, for some reason we get empty message with 2018 code
                    if (mess.length >= 1) {
                        //If it's not us
                        if (mess !== username) {

                            //Add user(log + to obj)
                            addUser(mess, rinfo);

                        }
                    }

                    break;
                case 2019:
                    //user leave chat

                    //Log this to chat
                    log(mess + ' вышел');

                    //remove this user from username object
                    delete(users[findUser('ip', rinfo.address, true)]);

                    break;
                default:
                    console.error("PANIC UNKNOWN CODE");
                    console.log(message);
                    console.log(type);
                    console.log(mess);
                    break;
            }
        });

        //Tell everyone goodbye when we close app
        window.addEventListener("beforeunload", function (e) {
            socket.send('exit', username);
            socket.close();
        }, false);
    }

    function addUser(mess, rinfo) {
        //log this to chat
        log(mess + ' в чате');

        //add to users object
        var uobj = {};
        uobj.name = mess;
        uobj.ip = rinfo.address;
        uobj.port = rinfo.port;
        users.push(uobj);
    }


    //################################ GET AND SEND MESSAGE
    // Adds the visual chat message to the message list
    function addChatMessage(data, options) {
        var privateClass = data.private ? 'private' : '';
        var user = data.username;

        // Don't fade the message in if there is an 'X was typing'
        options = options || {};

        var $usernameDiv = $('<span class="username"/>')
            .text(user)
            .addClass(privateClass)
            .css('color', getUsernameColor(user));
        var $messageBodyDiv = $('<span class="messageBody">')
            .text(data.message);

        var typingClass = data.typing ? 'typing' : '';
        var $messageDiv = $('<li class="message"/>')
            .data('username', user)
            .addClass(typingClass)
            .addClass(privateClass)
            .append($usernameDiv, $messageBodyDiv);

        addMessageElement($messageDiv, options);
    }

    // Sends a chat message
    function sendMessage() {
        var message = $inputMessage.val();
        // Prevent markup from being injected into the message
        message = cleanInput(message);
        // if there is a non-empty message and a socket connection
        if (message && connected) {
            $inputMessage.val('');

            //Check if we want to send private message
            if (message.indexOf("/p ") == 0) {
                var to_start = message.indexOf("/p ") + 3;
                var user_to = message.substr(to_start).trim();
                user_to = user_to.substr(0, user_to.indexOf(" ")).trim();

                var mess = message.substr(to_start).trim();
                mess = mess.substr(mess.indexOf(" ")).trim();

                var data = {
                    username: username,
                    to: user_to,
                    message: mess,
                    private: true
                };

                addChatMessage(data);

                var privateIp = "";

                users.forEach(function (el, i) {
                    if (el.name == user_to) {
                        privateIp = el.ip;
                    }
                });

                /*
                 var test = {
                 key1: 42,
                 key2: 'foo'
                 };
                 test.getKeyByValue( 42 );  // returns 'key1'
                 */

                // tell server to execute 'new message' and send along one parameter
                socket.send('msg', mess, privateIp);
                lastmessage = mess;
            } else {
                addChatMessage({
                    username: username,
                    message: message
                });
                // tell server to execute 'new message' and send along one parameter
                socket.send('msg', message);
                lastmessage = message;
            }

        }
    }


    //############################Visual functions
    // Log a message
    function log(message, options) {
        var $el = $('<li>').addClass('log').text(message);
        addMessageElement($el, options);
    }

    // Prevents input from having injected markup
    function cleanInput(input) {
        return $('<div/>').text(input).text();
    }

    // Gets the color of a username through our hash function
    function getUsernameColor(username) {
        // Compute hash code
        var hash = 7;
        for (var i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + (hash << 5) - hash;
        }
        // Calculate color
        var index = Math.abs(hash % COLORS.length);
        return COLORS[index];
    }

    // Adds a message element to the messages and scrolls to the bottom
    // el - The element to add as a message
    // options.fade - If the element should fade-in (default = true)
    // options.prepend - If the element should prepend
    //   all other messages (default = false)
    function addMessageElement(el, options) {
        var $el = $(el);

        // Setup default options
        if (!options) {
            options = {};
        }
        if (typeof options.fade === 'undefined') {
            options.fade = true;
        }
        if (typeof options.prepend === 'undefined') {
            options.prepend = false;
        }

        // Apply options
        if (options.fade) {
            $el.hide().fadeIn(FADE_TIME);
        }
        if (options.prepend) {
            $messages.prepend($el);
        } else {
            $messages.append($el);
        }
        $messages[0].scrollTop = $messages[0].scrollHeight;
    }


    //########################################## Keyboard events
    $window.keydown(function (event) {
        // Auto-focus the current input when a key is typed
        if (!(event.ctrlKey || event.metaKey || event.altKey)) {
            $currentInput.focus();
        }

        if (chooseIp) {
            // When the client hits ENTER on their keyboard
            if (event.which === 13) {
                if (username) {
                    sendMessage();
                } else {
                    setUsername();
                }
            }
        } else {
            if (event.which === 13) {
                startApp();
                $currentInput = $usernameInput.focus();
            }
        }
    });

    // Click events
    // Focus input when clicking anywhere on login page
    $loginPage.click(function () {
        $currentInput.focus();
    });

    // Focus input when clicking on the message input's border
    $inputMessage.click(function () {
        $inputMessage.focus();
    });
});
