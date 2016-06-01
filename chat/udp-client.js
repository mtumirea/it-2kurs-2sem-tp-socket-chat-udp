var port;
var multicastAddr;
var dgram = require('dgram');
var client;
var active = false;

//Create default dgram socket
client = dgram.createSocket({
    type: 'udp4',
    reuseAddr: true
});

//Logging when listening
client.on('listening', function () {
    var address = client.address();
    console.info('UDP Client listening on ' + address.address + ":" + address.port);
});




//Create socket
exports.start = function(mAddr, p){
    client = dgram.createSocket({
        type: 'udp4',
        reuseAddr: true
    });

    active = true;
    port = p;
    multicastAddr = mAddr;

    //Start listening
    client.bind(port, function () {
        client.addMembership(multicastAddr);
        
        console.info('Client addMembership to ' + multicastAddr+':'+port);
    });
};

//Send message
exports.send = function(type, message, privateip){
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
    const codes = {
        msg: 2016,
        name: 2017,
        backname: 2018,
        exit: 2019
    };
    
    //Convert codes to 4-bytes buffers
    for(var index in codes) {
        var el = codes[index];

        const buf = Buffer.alloc(4);
        buf.writeUInt32LE(el, 0);
        codes[index] = buf;
    }
    
    //Convert message length to 4-bytes buffer
    const lenbuffer = Buffer.alloc(4);
    lenbuffer.writeUInt32LE(message.length, 0);
    
    //Convert message to Buffer
    message = Buffer.from(message);
    
    //Concat all buffers to one
    const totalLength = codes[type].length + lenbuffer.length + message.length;
    const buffer = Buffer.concat([codes[type], lenbuffer, message], totalLength);

    //If we send private msg
    if(privateip){
        multicastAddr = privateip;
    }
    
    //Send buffer
    client.send(buffer, 0, buffer.length, port, multicastAddr, function () {
        console.info("Client sent '" + buffer + "' to: " + multicastAddr + ':' + port);
    });
};

//When receive message
exports.onmessage = function(callback){
    client.on('message', function (message, rinfo) {
        callback(message, rinfo);
        console.info('Message from: ' + rinfo.address + ':' + rinfo.port + ' - ' + message);
    });
};

//Close socket
exports.close = function(){
    if(active){
        client.dropMembership(multicastAddr);
        client.close();
        active = false;
    }
};